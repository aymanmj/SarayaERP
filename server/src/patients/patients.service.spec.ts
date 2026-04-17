/**
 * Patients Service — Unit Tests
 *
 * Tests patient CRUD, MRN generation, search,
 * soft delete, and allergy management.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { SoftDeleteService } from '../common/soft-delete.service';

describe('PatientsService', () => {
  let service: PatientsService;
  let prisma: any;

  const mockSoftDeleteService = {
    softDelete: jest.fn().mockResolvedValue({ id: 1, isDeleted: true }),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      patient: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      patientAllergy: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((arg: any) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return arg(mockPrismaService);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SoftDeleteService, useValue: mockSoftDeleteService },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  //  MRN GENERATION & PATIENT CREATION
  // ===========================================
  describe('create', () => {
    it('should create patient with auto-generated MRN', async () => {
      // No existing patients → MRN-0001
      prisma.patient.findFirst.mockResolvedValue(null);
      prisma.patient.create.mockImplementation((args: any) => ({
        id: 1,
        ...args.data,
        hospitalId: 1,
      }));

      const result = await service.create(1, { fullName: 'أحمد محمد' } as any);

      expect(result).toBeDefined();
      expect(prisma.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mrn: expect.stringMatching(/^MRN-\d{4}$/),
            fullName: 'أحمد محمد',
          }),
        }),
      );
    });

    it('should increment MRN based on last patient', async () => {
      // Last patient has MRN-0005
      prisma.patient.findFirst
        .mockResolvedValueOnce({ mrn: 'MRN-0005' })  // generateNextMrn: findFirst for last patient
        .mockResolvedValueOnce(null);                   // generateNextMrn: collision check (MRN-0006 available)

      prisma.patient.create.mockImplementation((args: any) => ({
        id: 6,
        ...args.data,
      }));

      await service.create(1, { fullName: 'Test' } as any);

      expect(prisma.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mrn: 'MRN-0006',
          }),
        }),
      );
    });
  });

  // ===========================================
  //  FIND ONE
  // ===========================================
  describe('findOne', () => {
    it('should return patient when found', async () => {
      const patient = { id: 1, hospitalId: 1, fullName: 'Test', isDeleted: false };
      prisma.patient.findFirst.mockResolvedValue(patient);

      const result = await service.findOne(1, 1);
      expect(result).toEqual(patient);
    });

    it('should throw NotFoundException when patient not found', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.findOne(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  //  FIND ALL (SEARCH + PAGINATION)
  // ===========================================
  describe('findAll', () => {
    it('should return paginated patients', async () => {
      const patients = [{ id: 1 }, { id: 2 }];
      prisma.patient.findMany.mockResolvedValue(patients);
      prisma.patient.count.mockResolvedValue(2);

      const result = await service.findAll({ hospitalId: 1, page: 1, limit: 10 });

      expect(result.items).toEqual(patients);
      expect(result.meta.totalCount).toBe(2);
      expect(result.meta.page).toBe(1);
    });

    it('should apply search filters correctly', async () => {
      prisma.patient.findMany.mockResolvedValue([]);
      prisma.patient.count.mockResolvedValue(0);

      await service.findAll({ hospitalId: 1, search: 'أحمد' });

      // Verify that OR condition was applied
      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                fullName: expect.objectContaining({ contains: 'أحمد' }),
              }),
            ]),
          }),
        }),
      );
    });
  });

  // ===========================================
  //  SOFT DELETE
  // ===========================================
  describe('softDelete', () => {
    it('should soft delete patient via SoftDeleteService', async () => {
      await service.softDelete(1, 1, 99);

      expect(mockSoftDeleteService.softDelete).toHaveBeenCalledWith(
        prisma.patient,
        expect.objectContaining({
          where: { id: 1, hospitalId: 1, isDeleted: false },
          extraUpdateData: { isActive: false },
        }),
        99,
      );
    });
  });

  // ===========================================
  //  ALLERGY MANAGEMENT
  // ===========================================
  describe('Allergies', () => {
    it('should add allergy for valid patient', async () => {
      prisma.patient.findFirst.mockResolvedValue({ id: 1, hospitalId: 1 });
      prisma.patientAllergy.create.mockResolvedValue({
        id: 1, patientId: 1, allergen: 'Penicillin', severity: 'SEVERE',
      });

      const result = await service.addAllergy(1, 99, {
        patientId: 1,
        allergen: 'Penicillin',
        severity: 'SEVERE',
        reaction: 'Anaphylaxis',
      });

      expect(result.allergen).toBe('Penicillin');
    });

    it('should reject allergy for non-existent patient', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);

      await expect(
        service.addAllergy(1, 99, { patientId: 999, allergen: 'X', severity: 'MILD' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should remove allergy with hospital verification', async () => {
      prisma.patientAllergy.findUnique.mockResolvedValue({
        id: 1,
        patient: { hospitalId: 1 },
      });
      prisma.patientAllergy.delete.mockResolvedValue({ id: 1 });

      const result = await service.removeAllergy(1, 1);
      expect(result.id).toBe(1);
    });

    it('should reject removing allergy from different hospital', async () => {
      prisma.patientAllergy.findUnique.mockResolvedValue({
        id: 1,
        patient: { hospitalId: 2 }, // Different hospital
      });

      await expect(service.removeAllergy(1, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
