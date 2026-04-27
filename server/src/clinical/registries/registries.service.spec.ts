import { Test, TestingModule } from '@nestjs/testing';
import { RegistriesService } from './registries.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RegistriesService', () => {
  let service: RegistriesService;
  let prismaService: any;

  beforeEach(async () => {
    prismaService = {
      patientRegistry: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      registryCriteria: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      patientRegistryMembership: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        count: jest.fn(),
      },
      careGapRule: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      careGap: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      encounterDiagnosis: { findMany: jest.fn() },
      labOrder: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prismaService)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistriesService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<RegistriesService>(RegistriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateRegistryMemberships', () => {
    it('should enroll patients matching diagnosis criteria', async () => {
      prismaService.patientRegistry.findMany.mockResolvedValue([
        {
          id: 1,
          criteria: [{ type: 'DIAGNOSIS', value: 'E11.9' }],
        },
      ]);
      prismaService.encounterDiagnosis.findMany.mockResolvedValue([
        { encounter: { patientId: 100 } },
        { encounter: { patientId: 101 } },
      ]);
      prismaService.patientRegistryMembership.findUnique.mockResolvedValue(null);

      const result = await service.evaluateRegistryMemberships();

      expect(prismaService.encounterDiagnosis.findMany).toHaveBeenCalledWith({
        where: { diagnosisCode: { code: 'E11.9' } },
        select: { encounter: { select: { patientId: true } } },
      });
      expect(prismaService.patientRegistryMembership.upsert).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ evaluated: 2, added: 2 });
    });
  });

  describe('evaluateCareGaps', () => {
    it('should create an OPEN gap if no recent lab test exists', async () => {
      prismaService.careGapRule.findMany.mockResolvedValue([
        {
          id: 10,
          registryId: 1,
          targetType: 'LAB_TEST',
          targetValue: 'HbA1c',
          frequencyDays: 180,
          isActive: true,
        },
      ]);
      prismaService.patientRegistryMembership.findMany.mockResolvedValue([
        { patientId: 100 },
      ]);
      prismaService.labOrder.findFirst.mockResolvedValue(null); // No recent test
      prismaService.careGap.findFirst.mockResolvedValue(null); // No existing open gap

      const result = await service.evaluateCareGaps();

      expect(prismaService.careGap.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ruleId: 10,
            patientId: 100,
            status: 'OPEN',
          }),
        }),
      );
      expect(result).toEqual({ evaluated: 1, opened: 1, closed: 0 });
    });

    it('should close existing gap if recent lab test is found', async () => {
      prismaService.careGapRule.findMany.mockResolvedValue([
        {
          id: 10,
          registryId: 1,
          targetType: 'LAB_TEST',
          targetValue: 'HbA1c',
          frequencyDays: 180,
          isActive: true,
        },
      ]);
      prismaService.patientRegistryMembership.findMany.mockResolvedValue([
        { patientId: 100 },
      ]);
      // Recent test exists
      prismaService.labOrder.findFirst.mockResolvedValue({ id: 999, status: 'COMPLETED' }); 
      prismaService.careGap.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.evaluateCareGaps();

      expect(prismaService.careGap.updateMany).toHaveBeenCalledWith({
        where: { ruleId: 10, patientId: 100, status: 'OPEN' },
        data: expect.objectContaining({
          status: 'CLOSED',
          closureReason: 'System auto-closure: Requirement met',
        }),
      });
      expect(prismaService.careGap.create).not.toHaveBeenCalled();
      expect(result).toEqual({ evaluated: 1, opened: 0, closed: 1 });
    });
  });

  describe('registry configuration', () => {
    it('creates a registry with criteria and care gap rules', async () => {
      prismaService.patientRegistry.create.mockResolvedValue({
        id: 1,
        hospitalId: 7,
        name: 'Diabetes Registry',
        criteria: [{ id: 10, type: 'DIAGNOSIS', operator: 'EQUALS', value: 'E11.9' }],
        careGapRules: [{ id: 20, name: 'HbA1c Every 6 Months' }],
      });

      const result = await service.createRegistry(7, {
        name: 'Diabetes Registry',
        description: 'Tracking diabetic patients',
        isActive: true,
        criteria: [{ type: 'DIAGNOSIS', operator: 'EQUALS', value: 'E11.9' }],
        careGapRules: [
          {
            name: 'HbA1c Every 6 Months',
            targetType: 'LAB_TEST',
            targetValue: 'HbA1c',
            frequencyDays: 180,
            isActive: true,
          },
        ],
      });

      expect(prismaService.patientRegistry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hospitalId: 7,
            name: 'Diabetes Registry',
          }),
        }),
      );
      expect(result.name).toBe('Diabetes Registry');
    });

    it('updates registry criteria and deactivates removed rules', async () => {
      prismaService.patientRegistry.findFirst.mockResolvedValue({
        id: 1,
        hospitalId: 7,
        name: 'Diabetes Registry',
        isActive: true,
        criteria: [],
        careGapRules: [
          { id: 20, name: 'Old Rule' },
          { id: 21, name: 'Retired Rule' },
        ],
      });
      prismaService.patientRegistry.findUnique.mockResolvedValue({
        id: 1,
        hospitalId: 7,
        name: 'Diabetes Registry',
        criteria: [{ id: 10, type: 'AGE_OVER', operator: 'GREATER_THAN', value: '40' }],
        careGapRules: [{ id: 20, name: 'Updated Rule', isActive: true }],
      });

      const result = await service.updateRegistry(7, 1, {
        name: 'Diabetes Registry',
        description: 'Updated',
        isActive: true,
        criteria: [{ type: 'AGE_OVER', operator: 'GREATER_THAN', value: '40' }],
        careGapRules: [
          {
            id: 20,
            name: 'Updated Rule',
            targetType: 'LAB_TEST',
            targetValue: 'HbA1c',
            frequencyDays: 180,
            isActive: true,
          },
        ],
      });

      expect(prismaService.registryCriteria.deleteMany).toHaveBeenCalledWith({
        where: { registryId: 1 },
      });
      expect(prismaService.careGapRule.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [21] } },
        data: { isActive: false },
      });
      expect(prismaService.careGapRule.update).toHaveBeenCalled();
      expect(result?.criteria).toHaveLength(1);
    });
  });
});
