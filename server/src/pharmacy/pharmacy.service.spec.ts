/**
 * Pharmacy Service — Enterprise Unit Tests
 *
 * Tests the most critical pharmacy workflows:
 * - Prescription creation with drug-allergy safety checks
 * - FEFO stock allocation algorithm
 * - Dispense with optimistic locking (concurrency safety)
 * - Insufficient stock rejection
 * - Completed/cancelled prescription rejection
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
jest.mock('../cashier/cash-control', () => ({
  guardCashierMovement: jest.fn().mockResolvedValue({ session: { id: 1 } }),
}));
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountingService } from '../accounting/accounting.service';
import type { Prisma } from '@prisma/client';
import { PaymentMethod } from '@prisma/client';
import { CDSSService } from '../cdss/cdss.service';

describe('PharmacyService', () => {
  let service: PharmacyService;
  let prisma: ReturnType<typeof mockPrismaService>;
  let cdss: typeof mockCDSSService;

  // ==================================================
  // Mock factories
  // ==================================================
  const mockPrismaService = () => {
    const baseMock = {
      hospital: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ organization: null }),
      },
      inventoryBatchRestriction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      pharmacyWarehousePolicy: {
        findUnique: jest.fn().mockResolvedValue({ warehouseId: 4 }),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      warehouse: {
        findFirst: jest.fn(),
      },
      prescription: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      prescriptionItem: {
        findMany: jest.fn().mockResolvedValue([{ productId: 100 }]),
        create: jest.fn(),
      },
      financialYear: {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 1, status: 'OPEN' }),
      },
      financialPeriod: {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1, isOpen: true }),
      },
      encounter: {
        findUnique: jest.fn(),
      },
      patient: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      productStock: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      dispenseRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      dispenseItem: {
        create: jest.fn(),
      },
      stockTransaction: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      encounterCharge: {
        create: jest.fn(),
      },
      serviceItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 305,
          hospitalId: 1,
          type: 'PHARMACY',
          isActive: true,
          isDeleted: false,
          isBillable: true,
        }),
      },
      invoice: {
        fields: { patientShare: undefined },
        create: jest.fn().mockResolvedValue({ id: 800 }),
      },
      payment: {
        create: jest.fn(),
      },
      cDSSAlert: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 100, sellPrice: 0 }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const mock = {
      ...baseMock,
      $transaction: jest.fn(),
    };
    mock.$transaction.mockImplementation((fn: unknown) => {
      if (Array.isArray(fn)) return Promise.all(fn as Promise<unknown>[]);
      return (fn as (tx: typeof mock) => unknown)(mock);
    });
    return mock;
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockAccountingService = {
    recordCogsEntry: jest.fn(),
    recordInvoiceEntry: jest.fn(),
    recordPaymentEntry: jest.fn(),
  };

  const mockCDSSService = {
    checkDrugInteractions: jest.fn().mockResolvedValue([]),
    checkPrescription: jest.fn().mockResolvedValue({
      passed: true,
      alerts: [],
      canProceed: true,
    }),
  };

  beforeEach(async () => {
    const prismaMock = mockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PharmacyService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: CDSSService, useValue: mockCDSSService },
      ],
    }).compile();

    service = module.get<PharmacyService>(PharmacyService);
    prisma = prismaMock;
    cdss = mockCDSSService;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  //  PRESCRIPTION CREATION
  // ===========================================
  describe('createPrescriptionForEncounter', () => {
    const baseParams = {
      hospitalId: 1,
      encounterId: 10,
      doctorId: 5,
      items: [
        {
          drugItemId: 100,
          dose: '500mg',
          route: 'ORAL',
          frequency: 'TID',
          durationDays: 5,
          quantity: 15,
        },
      ],
    };

    beforeEach(() => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        patientId: 1,
        patient: { id: 1, allergies: [] },
      });

      prisma.product.findMany.mockResolvedValue([
        { id: 100, name: 'Amoxicillin 500mg', genericName: 'amoxicillin' },
      ]);

      prisma.prescription.create.mockResolvedValue({ id: 1 });
      prisma.prescriptionItem.create.mockResolvedValue({ id: 1 });
      cdss.checkPrescription.mockResolvedValue({
        passed: true,
        alerts: [],
        canProceed: true,
      });
    });

    it('should create prescription successfully for valid encounter', async () => {
      const result = await service.createPrescriptionForEncounter(baseParams);
      expect(result).toBeDefined();
      expect(prisma.prescription.create).toHaveBeenCalled();
    });

    it('should reject empty items array', async () => {
      await expect(
        service.createPrescriptionForEncounter({ ...baseParams, items: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(
        service.createPrescriptionForEncounter(baseParams),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject encounter from different hospital', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 999, // Different hospital
        patientId: 1,
        patient: { id: 1, allergies: [] },
      });

      await expect(
        service.createPrescriptionForEncounter(baseParams),
      ).rejects.toThrow(BadRequestException);
    });

    it('should BLOCK prescription when drug-allergy interaction detected', async () => {
      cdss.checkPrescription.mockResolvedValue({
        passed: false,
        alerts: [
          {
            type: 'DRUG_ALLERGY',
            severity: 'CRITICAL',
            message: 'Direct allergy match',
            requiresOverride: true,
          },
        ],
        canProceed: false,
      });

      await expect(
        service.createPrescriptionForEncounter(baseParams),
      ).rejects.toThrow(BadRequestException);
    });

    it('should BLOCK prescription when CDSS detects drug interactions (without override)', async () => {
      cdss.checkPrescription.mockResolvedValue({
        passed: false,
        alerts: [
          {
            type: 'DRUG_INTERACTION',
            severity: 'CRITICAL',
            message: 'Increased toxicity',
            requiresOverride: true,
          },
        ],
        canProceed: false,
      });

      await expect(
        service.createPrescriptionForEncounter(baseParams),
      ).rejects.toThrow(BadRequestException);
    });

    it('should ALLOW prescription when overrideSafety is true (doctor acknowledges risk)', async () => {
      cdss.checkPrescription.mockResolvedValue({
        passed: false,
        alerts: [
          {
            type: 'DRUG_INTERACTION',
            severity: 'CRITICAL',
            message: 'Interaction',
            requiresOverride: true,
          },
        ],
        canProceed: false,
      });

      const result = await service.createPrescriptionForEncounter({
        ...baseParams,
        overrideSafety: true,
      });
      expect(result).toBeDefined();
    });
  });

  // ===========================================
  //  DISPENSE PRESCRIPTION
  // ===========================================
  describe('dispensePrescription', () => {
    const baseDispenseParams = {
      hospitalId: 1,
      prescriptionId: 1,
      pharmacistId: 3,
    };

    beforeEach(() => {
      // Pharmacy warehouse
      prisma.warehouse.findFirst.mockResolvedValue({ id: 1 });

      // Prescription with items
      prisma.prescription.findUnique.mockResolvedValue({
        id: 1,
        hospitalId: 1,
        encounterId: 10,
        status: 'ACTIVE',
        pharmacistVerificationStatus: 'VERIFIED',
        items: [
          {
            id: 101,
            productId: 100,
            quantity: 3,
            product: {
              id: 100,
              name: 'Paracetamol 500mg',
              sellPrice: 2.5,
              costPrice: 1.0,
            },
          },
        ],
        encounter: { id: 10, status: 'OPEN' },
      });

      // No existing dispense
      prisma.dispenseRecord.findFirst.mockResolvedValue(null);
      prisma.dispenseRecord.create.mockResolvedValue({ id: 1 });
      prisma.dispenseItem.create.mockResolvedValue({ id: 1 });

      // Stock available (FEFO)
      prisma.productStock.findMany.mockResolvedValue([
        {
          id: 1,
          productId: 100,
          quantity: 50,
          batchNumber: 'BATCH-001',
          expiryDate: new Date('2027-06-01'),
          version: 1,
        },
      ]);

      // Successful stock update (optimistic lock passes)
      prisma.productStock.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockTransaction.create.mockResolvedValue({ id: 1 });
      prisma.product.update.mockResolvedValue({ id: 100 });
      prisma.prescription.update.mockResolvedValue({
        id: 1,
        status: 'COMPLETED',
      });
      prisma.serviceItem.findFirst.mockResolvedValue({ id: 1 });
    });

    it('should dispense prescription successfully', async () => {
      const result = await service.dispensePrescription(baseDispenseParams);
      expect(result).toBeDefined();
      expect(result.dispense).toBeDefined();
    });

    it('keeps the committed result when the refresh notification fails', async () => {
      mockEventEmitter.emit.mockImplementationOnce(() => {
        throw new Error('Synthetic refresh failure');
      });
      await expect(
        service.dispensePrescription(baseDispenseParams),
      ).resolves.toMatchObject({ dispense: { id: 1 } });
      expect(mockAccountingService.recordCogsEntry).toHaveBeenCalledTimes(1);
    });

    it('should reject non-existent prescription', async () => {
      prisma.prescription.findUnique.mockResolvedValue(null);

      await expect(
        service.dispensePrescription(baseDispenseParams),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject already completed prescription', async () => {
      prisma.prescription.findUnique.mockResolvedValue({
        id: 1,
        status: 'COMPLETED',
        items: [],
        encounter: { id: 10, status: 'OPEN' },
      });

      await expect(
        service.dispensePrescription(baseDispenseParams),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject already dispensed prescription (duplicate dispense)', async () => {
      prisma.dispenseRecord.findFirst.mockResolvedValue({ id: 999 }); // Already dispensed

      await expect(
        service.dispensePrescription(baseDispenseParams),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when stock is insufficient', async () => {
      prisma.productStock.findMany.mockResolvedValue([
        {
          id: 1,
          productId: 100,
          quantity: 1,
          batchNumber: 'B1',
          expiryDate: new Date('2027-06-01'),
          version: 1,
        },
      ]);

      // Prescription needs 3, only 1 available
      await expect(
        service.dispensePrescription(baseDispenseParams),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when optimistic lock fails (concurrent dispense)', async () => {
      // Optimistic lock fails — someone else modified the stock row
      prisma.productStock.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.dispensePrescription(baseDispenseParams),
      ).rejects.toThrow(ConflictException);
    });

    it('should use FEFO: allocate from earliest expiry first', async () => {
      // Two batches: B2 expires sooner, B1 expires later
      prisma.productStock.findMany.mockResolvedValue([
        {
          id: 2,
          productId: 100,
          quantity: 10,
          batchNumber: 'B2-SOON',
          expiryDate: new Date('2026-06-01'),
          version: 1,
        },
        {
          id: 3,
          productId: 100,
          quantity: 10,
          batchNumber: 'B3-LATER',
          expiryDate: new Date('2028-01-01'),
          version: 1,
        },
      ]);

      await service.dispensePrescription(baseDispenseParams);

      // FEFO should use B2-SOON first (sorted by expiryDate asc in allocateStockFEFO)
      const stockUpdateCalls = prisma.productStock.updateMany.mock
        .calls as Array<[{ where: { id: number } }]>;
      expect(stockUpdateCalls.length).toBe(1);
      expect(stockUpdateCalls[0][0].where.id).toBe(2); // B2-SOON (earliest expiry)
    });

    it('should create encounter charge when PHARMACY-DRUGS service item exists', async () => {
      prisma.serviceItem.findFirst.mockResolvedValue({
        id: 50,
        code: 'PHARMACY-DRUGS',
      });

      await service.dispensePrescription(baseDispenseParams);

      expect(prisma.encounterCharge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceType: 'PHARMACY',
            hospitalId: 1,
          }) as unknown,
        }) as unknown,
      );
    });

    it('rejects dispensing without an explicit source even when another warehouse exists', async () => {
      prisma.pharmacyWarehousePolicy.findUnique.mockResolvedValue(null);
      prisma.warehouse.findFirst.mockResolvedValue({ id: 9 });
      await expect(
        service.dispensePrescription(baseDispenseParams),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dispenseRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('dispenseAndPay', () => {
    const basePosParams = {
      hospitalId: 1,
      prescriptionId: 1,
      pharmacistId: 3,
      paymentMethod: PaymentMethod.CASH,
      amountPaid: 7.5,
    };

    beforeEach(() => {
      prisma.warehouse.findFirst.mockResolvedValue({ id: 1 });
      prisma.prescription.findUnique.mockResolvedValue({
        id: 1,
        hospitalId: 1,
        patientId: 1,
        encounterId: 10,
        status: 'ACTIVE',
        pharmacistVerificationStatus: 'VERIFIED',
        patient: { id: 1, fullName: 'Patient' },
        items: [
          {
            id: 101,
            productId: 100,
            quantity: 3,
            product: {
              id: 100,
              name: 'Paracetamol 500mg',
              sellPrice: 2.5,
              costPrice: 1.0,
            },
          },
        ],
        encounter: { id: 10, status: 'OPEN' },
      });
      prisma.dispenseRecord.create.mockResolvedValue({ id: 2 });
      prisma.dispenseItem.create.mockResolvedValue({ id: 1 });
      prisma.productStock.findMany.mockResolvedValue([
        {
          id: 1,
          productId: 100,
          quantity: 50,
          batchNumber: 'BATCH-001',
          expiryDate: new Date('2027-06-01'),
          version: 1,
        },
      ]);
      prisma.productStock.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockTransaction.create.mockResolvedValue({ id: 1 });
      prisma.product.update.mockResolvedValue({ id: 100 });
      prisma.invoice.create.mockResolvedValue({ id: 20, status: 'PAID' });
      prisma.payment.create.mockResolvedValue({ id: 21, amount: 7.5 });
      prisma.prescription.update.mockResolvedValue({
        id: 1,
        status: 'COMPLETED',
      });
      prisma.serviceItem.findFirst.mockResolvedValue({
        id: 50,
        code: 'PHARMACY-DRUGS',
      });
      prisma.encounterCharge.create.mockResolvedValue({ id: 99 });
    });

    it('should create POS invoice, payment, and accounting entries', async () => {
      const result = await service.dispenseAndPay(basePosParams);

      expect(result.invoice.id).toBe(20);
      expect(result.payment.id).toBe(21);
      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hospitalId: 1,
            patientId: 1,
            encounterId: 10,
            status: 'PAID',
            totalAmount: '7.500',
            paidAmount: '7.500',
          }) as unknown,
        }) as unknown,
      );
      expect(mockAccountingService.recordInvoiceEntry).toHaveBeenCalledWith({
        invoiceId: 20,
        hospitalId: 1,
        userId: 3,
        prisma: prisma as unknown as Prisma.TransactionClient,
      });
      expect(mockAccountingService.recordPaymentEntry).toHaveBeenCalledWith({
        paymentId: 21,
        hospitalId: 1,
        userId: 3,
        prisma: prisma as unknown as Prisma.TransactionClient,
      });
    });

    it('does not report a failed POS payment after a refresh notification error', async () => {
      mockEventEmitter.emit.mockImplementationOnce(() => {
        throw new Error('Synthetic refresh failure');
      });
      await expect(
        service.dispenseAndPay(basePosParams),
      ).resolves.toMatchObject({ invoice: { id: 20 }, payment: { id: 21 } });
      expect(mockAccountingService.recordCogsEntry).toHaveBeenCalledTimes(1);
    });

    it('should reject POS dispense when nothing is actually dispensed', async () => {
      prisma.prescription.findUnique.mockResolvedValue({
        id: 1,
        hospitalId: 1,
        patientId: 1,
        encounterId: 10,
        status: 'ACTIVE',
        patient: { id: 1 },
        items: [
          {
            id: 101,
            productId: 100,
            quantity: 0,
            product: {
              id: 100,
              name: 'Paracetamol 500mg',
              sellPrice: 2.5,
              costPrice: 1.0,
            },
          },
        ],
        encounter: { id: 10, status: 'OPEN' },
      });

      await expect(service.dispenseAndPay(basePosParams)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ===========================================
  //  WORKLIST
  // ===========================================
  describe('getWorklist', () => {
    it('should return paginated worklist', async () => {
      prisma.prescription.findMany.mockResolvedValue([
        {
          id: 1,
          status: 'ACTIVE',
          createdAt: new Date(),
          encounter: { id: 10, type: 'OPD' },
          patient: { id: 1, fullName: 'Test', mrn: 'MRN-0001' },
          doctor: { id: 5, fullName: 'Dr. Test' },
          items: [],
        },
      ]);
      prisma.prescription.count.mockResolvedValue(1);

      const result = await service.getWorklist(1, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta.totalCount).toBe(1);
      expect(result.meta.page).toBe(1);
    });
  });

  // ===========================================
  //  NO WAREHOUSE CONFIGURED
  // ===========================================
  describe('warehouse validation', () => {
    it('should throw when no pharmacy source is configured', async () => {
      prisma.pharmacyWarehousePolicy.findUnique.mockResolvedValue(null);
      prisma.prescription.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        items: [
          {
            id: 1,
            product: { id: 1, name: 'X', sellPrice: 1, costPrice: 0.5 },
            quantity: 1,
          },
        ],
        encounter: { id: 10, status: 'OPEN' },
      });
      prisma.dispenseRecord.findFirst.mockResolvedValue(null);

      await expect(
        service.dispensePrescription({
          hospitalId: 1,
          prescriptionId: 1,
          pharmacistId: 3,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createManualStockTransaction', () => {
    beforeEach(() => {
      prisma.warehouse.findFirst.mockResolvedValue({ id: 4 });
      prisma.product.findUnique.mockResolvedValue({
        id: 100,
        hospitalId: 1,
        costPrice: 2.5,
      });
      prisma.productStock.findUnique.mockResolvedValue(null);
      prisma.productStock.upsert.mockResolvedValue({ id: 301 });
      prisma.product.update.mockResolvedValue({ id: 100 });
      prisma.stockTransaction.create.mockResolvedValue({
        id: 401,
        batchNumber: 'GENERAL',
      });
    });

    it('rejects unsupported manual receipts in favor of documented purchasing', async () => {
      await expect(
        service.createManualStockTransaction({
          hospitalId: 1,
          userId: 9,
          drugItemId: 100,
          type: 'IN',
          quantity: 6,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.productStock.upsert).not.toHaveBeenCalled();
    });

    it('requires a documented adjustment identity before any stock mutation', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 100,
        hospitalId: 99,
      });

      await expect(
        service.createManualStockTransaction({
          hospitalId: 1,
          userId: 9,
          drugItemId: 100,
          type: 'ADJUST',
          quantity: 2,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
