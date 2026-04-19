/**
 * Encounters Service — Enterprise Unit Tests
 *
 * Tests the encounter lifecycle:
 * - Create encounter with ER auto-billing
 * - Discharge with financial clearance
 * - IPD → discharge via discharge plan validation
 * - Encounter close/open status transitions
 * - Soft delete
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { PrismaService } from '../prisma/prisma.service';
import { SoftDeleteService } from '../common/soft-delete.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { PriceListsService } from '../price-lists/price-lists.service';
import { AccountingService } from '../accounting/accounting.service';

describe('EncountersService', () => {
  let service: EncountersService;
  let prisma: any;

  const mockSoftDeleteService = {
    softDelete: jest.fn().mockResolvedValue({ id: 1, isDeleted: true }),
  };

  const mockSystemSettings = {
    get: jest.fn().mockResolvedValue(null),
    getNumber: jest.fn().mockResolvedValue(0.01),
  };

  const mockPriceService = {
    getServicePrice: jest.fn().mockResolvedValue(50),
  };

  const mockAccountingService = {
    validateDateInOpenPeriod: jest.fn().mockResolvedValue({
      financialYear: { id: 1 },
      period: { id: 1 },
    }),
    reverseEntry: jest.fn(),
  };

  const mockPrismaFactory = () => {
    const mock: any = {
      patient: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      encounter: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      encounterCharge: {
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      invoice: {
        create: jest.fn(),
      },
      serviceItem: {
        findFirst: jest.fn(),
      },
      bedAssignment: {
        update: jest.fn(),
      },
      bed: {
        update: jest.fn(),
      },
      admission: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => {
        if (Array.isArray(fn)) return Promise.all(fn);
        return fn(mock);
      }),
    };
    return mock;
  };

  beforeEach(async () => {
    const prismaMock = mockPrismaFactory();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncountersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SoftDeleteService, useValue: mockSoftDeleteService },
        { provide: SystemSettingsService, useValue: mockSystemSettings },
        { provide: PriceListsService, useValue: mockPriceService },
        { provide: AccountingService, useValue: mockAccountingService },
      ],
    }).compile();

    service = module.get<EncountersService>(EncountersService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  //  CREATE ENCOUNTER
  // ===========================================
  describe('createEncounter', () => {
    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 1,
        hospitalId: 1,
        insurancePolicy: null,
      });
      prisma.encounter.findFirst.mockResolvedValue(null); // No active encounter
      prisma.encounter.create.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        patientId: 1,
        type: 'OPD',
        status: 'OPEN',
      });
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        patientId: 1,
        type: 'OPD',
        status: 'OPEN',
        patient: { fullName: 'Test', mrn: 'MRN-0001' },
        doctor: null,
        department: null,
      });
    });

    it('should create OPD encounter for valid patient', async () => {
      const result = await service.createEncounter(1, {
        patientId: 1,
        type: 'OPD' as any,
      });

      expect(result).toBeDefined();
      expect(prisma.encounter.create).toHaveBeenCalled();
    });

    it('should reject non-existent patient', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.createEncounter(1, { patientId: 999, type: 'OPD' as any }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject patient from different hospital', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 1,
        hospitalId: 999, // Different hospital
      });

      await expect(
        service.createEncounter(1, { patientId: 1, type: 'OPD' as any }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject duplicate active IPD/ER encounter', async () => {
      prisma.encounter.findFirst.mockResolvedValue({
        id: 5,
        status: 'OPEN',
        type: 'IPD',
      });

      await expect(
        service.createEncounter(1, { patientId: 1, type: 'IPD' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow multiple OPD encounters for same patient', async () => {
      // OPD encounters don't check for duplicates (findFirst is NOT called for OPD)
      prisma.encounter.findFirst.mockResolvedValue(null);

      const result = await service.createEncounter(1, {
        patientId: 1,
        type: 'OPD' as any,
      });

      expect(result).toBeDefined();
    });

    it('should auto-create ER charge and invoice with insurance split', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 1,
        hospitalId: 1,
        insurancePolicy: {
          id: 12,
          isActive: true,
          patientCopayRate: 20,
          insuranceProviderId: 7,
        },
      });
      prisma.encounter.create.mockResolvedValue({
        id: 44,
        hospitalId: 1,
        patientId: 1,
        type: 'ER',
        status: 'OPEN',
      });
      prisma.serviceItem.findFirst.mockResolvedValue({
        id: 88,
        code: 'ER-VISIT',
        isActive: true,
      });
      prisma.encounterCharge.create.mockResolvedValue({ id: 90 });
      prisma.invoice.create.mockResolvedValue({ id: 91 });
      prisma.encounter.findUnique.mockResolvedValue({
        id: 44,
        hospitalId: 1,
        patient: { fullName: 'Test', mrn: 'MRN-0001' },
        doctor: null,
        department: null,
      });

      const result = await service.createEncounter(1, {
        patientId: 1,
        type: 'ER' as any,
        doctorId: 5,
      });

      expect(mockPriceService.getServicePrice).toHaveBeenCalledWith(1, 88, 12);
      expect(prisma.invoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hospitalId: 1,
          patientId: 1,
          encounterId: 44,
          totalAmount: 50,
          patientShare: 10,
          insuranceShare: 40,
          insuranceProviderId: 7,
        }),
      });
      expect(prisma.encounterCharge.update).toHaveBeenCalledWith({
        where: { id: 90 },
        data: { invoiceId: 91 },
      });
      expect(result.id).toBe(44);
    });

    it('should still create ER encounter if invoice creation fails', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 1,
        hospitalId: 1,
        insurancePolicy: null,
      });
      prisma.encounter.create.mockResolvedValue({
        id: 55,
        hospitalId: 1,
        patientId: 1,
        type: 'ER',
        status: 'OPEN',
      });
      prisma.serviceItem.findFirst.mockResolvedValue({
        id: 88,
        code: 'ER-VISIT',
        isActive: true,
      });
      prisma.encounterCharge.create.mockResolvedValue({ id: 90 });
      mockAccountingService.validateDateInOpenPeriod.mockRejectedValueOnce(
        new Error('period closed'),
      );
      prisma.encounter.findUnique.mockResolvedValue({
        id: 55,
        hospitalId: 1,
        patient: { fullName: 'Test', mrn: 'MRN-0001' },
        doctor: null,
        department: null,
      });

      const result = await service.createEncounter(1, {
        patientId: 1,
        type: 'ER' as any,
      });

      expect(prisma.encounterCharge.create).toHaveBeenCalled();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
      expect(result.id).toBe(55);
    });
  });

  // ===========================================
  //  GET ENCOUNTER
  // ===========================================
  describe('getEncounterById', () => {
    it('should return encounter with correct hospital', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        status: 'OPEN',
      });

      const result = await service.getEncounterById(1, 10);
      expect(result.id).toBe(10);
    });

    it('should throw NotFoundException for wrong hospital', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 999,
      });

      await expect(service.getEncounterById(1, 10)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ===========================================
  //  CLOSE ENCOUNTER
  // ===========================================
  describe('closeEncounter', () => {
    it('should close an open OPD encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        status: 'OPEN',
        type: 'OPD',
      });
      prisma.encounter.update.mockResolvedValue({
        id: 10,
        status: 'CLOSED',
      });

      const result = await service.closeEncounter(1, 10);
      expect(result.status).toBe('CLOSED');
    });

    it('should reject closing an already closed encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        status: 'CLOSED',
        type: 'OPD',
      });

      await expect(service.closeEncounter(1, 10)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject directly closing IPD encounter (must use discharge)', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        status: 'OPEN',
        type: 'IPD',
      });

      await expect(service.closeEncounter(1, 10)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ===========================================
  //  DISCHARGE — FINANCIAL CLEARANCE
  // ===========================================
  describe('dischargePatient', () => {
    it('should reject discharge with outstanding debt', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        status: 'OPEN',
        type: 'OPD',
        invoices: [
          { status: 'ISSUED', patientShare: 100, paidAmount: 0 }, // 100 outstanding
        ],
        bedAssignments: [],
      });

      await expect(service.dischargePatient(1, 10)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject discharge with un-invoiced charges', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        status: 'OPEN',
        type: 'OPD',
        invoices: [],
        bedAssignments: [],
      });
      prisma.encounterCharge.count.mockResolvedValue(2); // 2 un-invoiced charges

      await expect(service.dischargePatient(1, 10)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should discharge when all financial obligations are met', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        status: 'OPEN',
        type: 'OPD',
        invoices: [
          { status: 'PAID', patientShare: 50, paidAmount: 50 }, // Fully paid
        ],
        bedAssignments: [],
      });
      prisma.encounterCharge.count.mockResolvedValue(0);
      prisma.encounter.update.mockResolvedValue({
        id: 10,
        status: 'CLOSED',
      });
      prisma.admission.findFirst.mockResolvedValue(null);

      const result = await service.dischargePatient(1, 10);
      expect(result.status).toBe('CLOSED');
    });

    it('should reject discharge for IPD encounters pending discharge workflow', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        status: 'OPEN',
        type: 'IPD',
        invoices: [],
        bedAssignments: [],
      });

      await expect(service.dischargePatient(1, 10)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ===========================================
  //  ASSIGN DOCTOR
  // ===========================================
  describe('assignDoctor', () => {
    it('should assign doctor to encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
      });
      prisma.encounter.update.mockResolvedValue({
        id: 10,
        doctorId: 5,
      });

      const result = await service.assignDoctor(1, 10, 5);
      expect(result.doctorId).toBe(5);
    });

    it('should reject for non-existent encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.assignDoctor(1, 999, 5)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('admitPatientFromER', () => {
    it('should convert open ER encounter into IPD', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        type: 'ER',
        status: 'OPEN',
        departmentId: 3,
      });
      prisma.encounter.update.mockResolvedValue({
        id: 10,
        type: 'IPD',
        departmentId: 5,
        status: 'OPEN',
      });

      const result = await service.admitPatientFromER(1, 10, 5);

      expect(result.type).toBe('IPD');
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          type: 'IPD',
          departmentId: 5,
        }),
      });
    });

    it('should reject admitting a non-ER encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        type: 'OPD',
        status: 'OPEN',
      });

      await expect(service.admitPatientFromER(1, 10)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ===========================================
  //  DELETE ENCOUNTER CHARGE (Financial Protection)
  // ===========================================
  describe('deleteEncounterCharge', () => {
    it('should delete charge without invoice', async () => {
      prisma.encounterCharge = {
        ...(prisma.encounterCharge || {}),
        findFirst: jest.fn().mockResolvedValue({ id: 1, invoiceId: null, hospitalId: 1 }),
        delete: jest.fn().mockResolvedValue({ id: 1 }),
      };

      const result = await service.deleteEncounterCharge(1, 1);
      expect(result.success).toBe(true);
    });

    it('should BLOCK deletion of charge linked to invoice', async () => {
      prisma.encounterCharge = {
        ...(prisma.encounterCharge || {}),
        findFirst: jest.fn().mockResolvedValue({ id: 1, invoiceId: 5, hospitalId: 1 }),
      };

      await expect(service.deleteEncounterCharge(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ===========================================
  //  FIND ALL (PAGINATION)
  // ===========================================
  describe('findAll', () => {
    it('should return paginated encounters', async () => {
      prisma.encounter.findMany.mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ]);
      prisma.encounter.count.mockResolvedValue(2);

      const result = await service.findAll({ hospitalId: 1, page: 1, limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.meta.totalCount).toBe(2);
      expect(result.meta.page).toBe(1);
    });

    it('should build patient search filters when search term is provided', async () => {
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(0);

      await service.findAll({ hospitalId: 1, search: 'Ahmed', page: 1, limit: 10 });

      expect(prisma.encounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hospitalId: 1,
            OR: expect.arrayContaining([
              expect.objectContaining({
                patient: {
                  fullName: { contains: 'Ahmed', mode: 'insensitive' },
                },
              }),
              expect.objectContaining({
                patient: {
                  mrn: { contains: 'Ahmed', mode: 'insensitive' },
                },
              }),
            ]),
          }),
        }),
      );
    });
  });

  describe('listActiveInpatients and softDelete', () => {
    it('should list only active inpatients with related context', async () => {
      prisma.encounter.findMany.mockResolvedValue([{ id: 77 }]);

      const result = await service.listActiveInpatients(1);

      expect(result).toEqual([{ id: 77 }]);
      expect(prisma.encounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            hospitalId: 1,
            type: 'IPD',
            status: 'OPEN',
          },
        }),
      );
    });

    it('should delegate soft delete to soft delete service with encounter scope', async () => {
      const result = await service.softDelete(1, 55, 9);

      expect(result).toEqual({ id: 1, isDeleted: true });
      expect(mockSoftDeleteService.softDelete).toHaveBeenCalledWith(
        prisma.encounter,
        expect.objectContaining({
          where: {
            id: 55,
            hospitalId: 1,
            isDeleted: false,
          },
        }),
        9,
      );
    });
  });
});
