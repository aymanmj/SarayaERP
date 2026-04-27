import { Test, TestingModule } from '@nestjs/testing';
import { RegistriesService } from './registries.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RegistriesService', () => {
  let service: RegistriesService;
  let prismaService: any;

  beforeEach(async () => {
    prismaService = {
      patientRegistry: { findMany: jest.fn() },
      patientRegistryMembership: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        count: jest.fn(),
      },
      careGapRule: { findMany: jest.fn() },
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
});
