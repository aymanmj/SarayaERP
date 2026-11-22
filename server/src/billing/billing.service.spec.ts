import { PatientDepositService } from './patient-deposit.service';
jest.mock('./invoice-snapshot', () => ({
  ...jest.requireActual<Record<string, unknown>>('./invoice-snapshot'),
  captureInvoiceSnapshot: jest.fn().mockResolvedValue(undefined),
}));
// src/billing/billing.service.spec.ts
// Unit tests for Billing Service

import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock } from '../test-utils';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FinancialYearsService } from '../financial-years/financial-years.service';
import { InsuranceCalculationService } from '../insurance/insurance-calculation.service';
import { AccountingService } from '../accounting/accounting.service';
import { PriceListsService } from '../price-lists/price-lists.service';
import Decimal from 'decimal.js';
import { InvoiceStatus } from '@prisma/client';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('BillingService', () => {
  let service: BillingService;
  let prismaService: PrismaService;

  // Mock data
  const mockHospitalId = 1;
  const mockEncounterId = 100;
  const mockUserId = 1;

  const mockCharges = [
    {
      id: 1,
      hospitalId: mockHospitalId,
      encounterId: mockEncounterId,
      sourceType: 'MANUAL',
      serviceItemId: 1,
      quantity: 1,
      unitPrice: new Decimal(50),
      totalAmount: new Decimal(50),
      invoiceId: null,
      serviceItem: { name: 'استشارة طبية', type: 'CONSULTATION' },
    },
    {
      id: 2,
      hospitalId: mockHospitalId,
      encounterId: mockEncounterId,
      sourceType: 'MANUAL',
      serviceItemId: 2,
      quantity: 2,
      unitPrice: new Decimal(25),
      totalAmount: new Decimal(50),
      invoiceId: null,
      serviceItem: { name: 'تحليل دم', type: 'LAB' },
    },
  ];

  const mockEncounter = {
    id: mockEncounterId,
    hospitalId: mockHospitalId,
    patientId: 1,
    status: 'OPEN',
    type: 'OUTPATIENT',
    patient: {
      id: 1,
      fullName: 'أحمد محمد',
      mrn: 'MRN-001',
      phone: '0912345678',
    },
    charges: mockCharges as any,
    invoices: [],
  };

  const mockPrismaService = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    admission: { findFirst: jest.fn().mockResolvedValue(null) },
    encounter: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    encounterCharge: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    prescription: { findUnique: jest.fn().mockResolvedValue(null) },
    invoice: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
    },
    invoiceRefund: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    cashierSession: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    invoiceAdjustment: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    accountingEntry: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    accountingEntryLine: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((arg) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg(mockPrismaService);
    }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockFinancialYearsService = {
    getCurrentPeriod: jest.fn().mockResolvedValue({
      id: 1,
      financialYearId: 1,
      isOpen: true,
    }),
  };

  const mockInsuranceCalcService = {
    calculateCoverage: jest.fn().mockResolvedValue({
      patientShare: 100,
      insuranceShare: 0,
      details: [],
    }),
    calculateInsuranceSplit: jest.fn().mockResolvedValue({
      patientShare: 100,
      insuranceShare: 0,
      details: [],
    }),
  };

  const mockAccountingService = {
    recordInvoiceEntry: jest.fn().mockResolvedValue(undefined),
    postBillingEntry: jest.fn().mockResolvedValue({ id: 1 }),
    validateDateInOpenPeriod: jest.fn().mockResolvedValue({
      financialYear: { id: 1 },
      period: { id: 1 },
    }),
    reverseEntry: jest.fn().mockResolvedValue({ id: 11 }),
    recordCreditNoteEntry: jest.fn().mockResolvedValue({ id: 12 }),
  };

  const mockPriceListsService = {
    getServicePrice: jest.fn().mockImplementation((h, s, p) => {
      if (s === 1) return 50;
      if (s === 2) return 25;
      return 0;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PatientDepositService, useValue: {} },
        BillingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: FinancialYearsService, useValue: mockFinancialYearsService },
        {
          provide: InsuranceCalculationService,
          useValue: mockInsuranceCalcService,
        },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: PriceListsService, useValue: mockPriceListsService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getEncounterBilling', () => {
    it('should return encounter billing data with charges', async () => {
      mockPrismaService.encounter.findFirst.mockResolvedValue(mockEncounter);
      mockPrismaService.encounterCharge.findMany.mockResolvedValue(mockCharges);
      mockPrismaService.invoice.findMany.mockResolvedValue([]);

      const result = await service.getEncounterBilling(
        mockEncounterId,
        mockHospitalId,
      );

      expect(result).toBeDefined();
      expect(result.encounter.id).toBe(mockEncounterId);
      expect(result.charges).toEqual(mockCharges);
    });

    it('should throw NotFoundException if encounter not found', async () => {
      mockPrismaService.encounter.findFirst.mockResolvedValue(null);

      await expect(
        service.getEncounterBilling(999, mockHospitalId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createInvoiceForEncounter', () => {
    it('should create invoice with unbilled charges', async () => {
      const mockInvoice = {
        id: 1,
        hospitalId: mockHospitalId,
        patientId: 1,
        encounterId: mockEncounterId,
        totalAmount: 100,
        paidAmount: 0,
        status: 'ISSUED',
      };

      mockPrismaService.encounter.findFirst.mockResolvedValue(mockEncounter);
      mockPrismaService.encounterCharge.findMany.mockResolvedValue(mockCharges);
      mockPrismaService.invoice.create.mockResolvedValue(mockInvoice);
      mockPrismaService.encounterCharge.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        charges: mockCharges,
        patient: mockEncounter.patient,
        payments: [],
      });

      const result = await service.createInvoiceForEncounter(
        mockEncounterId,
        mockHospitalId,
        mockUserId,
      );

      expect(result).toBeDefined();
      expect(result!.id).toBe(1);
      expect(mockPrismaService.invoice.create).toHaveBeenCalled();
    });

    it('should throw error if no unbilled charges exist', async () => {
      mockPrismaService.encounter.findFirst.mockResolvedValue(mockEncounter);
      mockPrismaService.encounterCharge.findMany.mockResolvedValue([]);

      await expect(
        service.createInvoiceForEncounter(
          mockEncounterId,
          mockHospitalId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate total amount correctly', async () => {
      const mockInvoice = {
        id: 1,
        hospitalId: mockHospitalId,
        patientId: 1,
        encounterId: mockEncounterId,
        totalAmount: 100,
        paidAmount: 0,
        status: 'ISSUED',
      };

      mockPrismaService.encounter.findFirst.mockResolvedValue(mockEncounter);
      mockPrismaService.encounterCharge.findMany.mockResolvedValue(mockCharges);
      mockPrismaService.invoice.create.mockResolvedValue(mockInvoice);
      mockPrismaService.encounterCharge.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        charges: mockCharges,
        patient: mockEncounter.patient,
        payments: [],
      });

      await service.createInvoiceForEncounter(
        mockEncounterId,
        mockHospitalId,
        mockUserId,
      );

      expect(mockPrismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 100,
          }),
        }),
      );
    });

    it('should apply contracted pricing, insurance share, and emit invoice event', async () => {
      const encounterWithInsurance = {
        ...mockEncounter,
        patient: {
          ...mockEncounter.patient,
          insurancePolicy: { insuranceProviderId: 77 },
        },
      };
      const singleCharge = [mockCharges[0]];
      const createdInvoice = {
        id: 9,
        hospitalId: mockHospitalId,
        patientId: 1,
        encounterId: mockEncounterId,
        totalAmount: 80,
        paidAmount: 0,
        patientShare: 20,
        insuranceShare: 60,
        insuranceProviderId: 77,
        status: 'ISSUED',
      };

      mockPrismaService.encounter.findFirst.mockResolvedValue(
        encounterWithInsurance,
      );
      mockPrismaService.encounterCharge.findMany.mockResolvedValue(
        singleCharge,
      );
      mockInsuranceCalcService.calculateCoverage.mockResolvedValueOnce({
        patientShare: 20,
        insuranceShare: 30,
        requiresPreAuth: true,
        preAuthCode: 'AUTH-001',
        contractedPrice: 80,
      });
      mockPrismaService.invoice.create.mockResolvedValue(createdInvoice);
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        ...createdInvoice,
        charges: singleCharge,
        payments: [],
        insuranceProvider: { id: 77, name: 'Acme Insurance' },
      });

      const result = await service.createInvoiceForEncounter(
        mockEncounterId,
        mockHospitalId,
        mockUserId,
      );

      expect(result!.insuranceProviderId).toBe(77);
      expect(mockPrismaService.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 80,
            patientShare: 20,
            insuranceShare: 60,
            insuranceProviderId: 77,
          }),
        }),
      );
      expect(mockPrismaService.encounterCharge.updateMany).toHaveBeenCalledWith(
        {
          where: {
            id: 1,
            hospitalId: mockHospitalId,
            encounterId: mockEncounterId,
            sourceType: { not: 'PHARMACY_PRESCRIPTION' },
            OR: [{ invoiceId: null }, { invoice: { status: 'CANCELLED' } }],
          },
          data: { invoiceId: 9, totalAmount: 80 },
        },
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'invoice.issued',
        expect.objectContaining({
          invoiceId: 9,
          hospitalId: mockHospitalId,
          userId: mockUserId,
        }),
      );
    });
  });

  describe('listInvoices', () => {
    it('should return paginated list of invoices', async () => {
      const mockInvoices = [
        { id: 1, totalAmount: 100, status: 'DRAFT' },
        { id: 2, totalAmount: 200, status: 'ISSUED' },
      ];

      mockPrismaService.invoice.findMany.mockResolvedValue(mockInvoices);
      mockPrismaService.invoice.count.mockResolvedValue(2);

      const result = await service.listInvoices({
        hospitalId: mockHospitalId,
        page: 1,
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(result.items).toEqual(mockInvoices);
      expect(result.meta.totalCount).toBe(2);
    });

    it('should apply pagination correctly', async () => {
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.invoice.count.mockResolvedValue(100);

      await service.listInvoices({
        hospitalId: mockHospitalId,
        page: 3,
        limit: 20,
      });

      expect(mockPrismaService.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40, // (3-1) * 20
          take: 20,
        }),
      );
    });

    it('should build search filters for patient and invoice lookup', async () => {
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.invoice.count.mockResolvedValue(0);

      await service.listInvoices({
        hospitalId: mockHospitalId,
        page: 1,
        limit: 10,
        search: 'ahmed',
      });

      expect(mockPrismaService.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hospitalId: mockHospitalId,
            OR: expect.arrayContaining([
              expect.objectContaining({
                patient: {
                  fullName: { contains: 'ahmed', mode: 'insensitive' },
                },
              }),
              expect.objectContaining({
                patient: {
                  mrn: { contains: 'ahmed', mode: 'insensitive' },
                },
              }),
            ]),
          }),
        }),
      );
    });
  });

  describe('validateInvoiceIsEditable (private)', () => {
    const getValidator = () =>
      service as unknown as {
        validateInvoiceIsEditable: (invoice: {
          id: number;
          status: InvoiceStatus;
        }) => void;
      };

    it('should allow editing DRAFT invoices', () => {
      expect(() =>
        getValidator().validateInvoiceIsEditable({
          id: 1,
          status: InvoiceStatus.DRAFT,
        }),
      ).not.toThrow();
    });

    it('should throw error for PAID invoices', () => {
      expect(() =>
        getValidator().validateInvoiceIsEditable({
          id: 1,
          status: InvoiceStatus.PAID,
        }),
      ).toThrow(BadRequestException);
    });

    it('should throw error for CANCELLED invoices', () => {
      expect(() =>
        getValidator().validateInvoiceIsEditable({
          id: 1,
          status: InvoiceStatus.CANCELLED,
        }),
      ).toThrow(BadRequestException);
    });

    it('should throw error for ISSUED invoices', () => {
      expect(() =>
        getValidator().validateInvoiceIsEditable({
          id: 1,
          status: InvoiceStatus.ISSUED,
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('cancelInvoice', () => {
    beforeEach(() => {
      const invoice = async () => {
        const row = (await mockPrismaService.invoice.findUnique()) as Record<
          string,
          unknown
        > | null;
        return row
          ? {
              patientId: 1,
              encounterId: mockEncounterId,
              type: 'INVOICE',
              returns: [],
              ...row,
              encounter: { hospitalId: mockHospitalId, patientId: 1 },
            }
          : null;
      };
      mockPrismaService.invoice.findFirst.mockImplementation(invoice);
      mockPrismaService.invoice.findFirstOrThrow.mockImplementation(invoice);
      mockPrismaService.accountingEntry.count.mockResolvedValue(0);
    });
    it('should cancel invoice and unlink charges', async () => {
      const mockInvoice = {
        id: 1,
        hospitalId: mockHospitalId,
        status: 'ISSUED',
        charges: mockCharges,
        payments: [], // Empty payments array
      };

      mockPrismaService.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockPrismaService.invoice.update.mockResolvedValue({
        ...mockInvoice,
        status: 'CANCELLED',
      });
      mockPrismaService.encounterCharge.updateMany.mockResolvedValue({
        count: 2,
      });
      mockPrismaService.accountingEntry.findFirst.mockResolvedValue(null);

      const result = await service.cancelInvoice(mockHospitalId, 1, mockUserId);

      expect(result.status).toBe('CANCELLED');
    });

    it('should reject cancelling invoice with recorded payments', async () => {
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        id: 2,
        hospitalId: mockHospitalId,
        status: 'ISSUED',
        payments: [{ amount: new Decimal(25) }],
      });

      await expect(
        service.cancelInvoice(mockHospitalId, 2, mockUserId),
      ).rejects.toThrow(BadRequestException);

      expect(
        mockPrismaService.encounterCharge.updateMany,
      ).not.toHaveBeenCalled();
      expect(mockPrismaService.invoice.update).not.toHaveBeenCalled();
    });

    it('should reverse accounting entry and emit cancellation event when linked data exists', async () => {
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        id: 5,
        hospitalId: mockHospitalId,
        status: 'ISSUED',
        encounterId: mockEncounterId,
        payments: [],
      });
      mockPrismaService.encounterCharge.updateMany.mockResolvedValue({
        count: 2,
      });
      mockPrismaService.invoice.update.mockResolvedValue({
        id: 5,
        encounterId: mockEncounterId,
        hospitalId: mockHospitalId,
        status: 'CANCELLED',
      });
      mockPrismaService.accountingEntry.findFirst.mockResolvedValue({ id: 88 });

      await service.cancelInvoice(mockHospitalId, 5, mockUserId);

      expect(mockAccountingService.reverseEntry).toHaveBeenCalledWith(
        mockHospitalId,
        88,
        mockUserId,
        'إلغاء الفاتورة #5',
        mockPrismaService,
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'invoice.cancelled',
        expect.objectContaining({
          invoiceId: 5,
          encounterId: mockEncounterId,
          userId: mockUserId,
        }),
      );
    });
  });

  describe('legacy credit note containment', () => {
    it('rejects a legacy fake refund without creating any invoice or accounting entry', async () => {
      await expect(
        service.createCreditNote(
          mockHospitalId,
          12,
          mockUserId,
          'Returned items',
        ),
      ).rejects.toThrow('مسار المرتجع القديم موقوف');
      expect(mockPrismaService.invoice.create).not.toHaveBeenCalled();
      expect(
        mockAccountingService.recordCreditNoteEntry,
      ).not.toHaveBeenCalled();
    });
  });
  describe('deleteCharge', () => {
    it('should successfully delete an unbilled charge', async () => {
      const mockCharge = {
        id: 1,
        hospitalId: mockHospitalId,
        invoiceId: null,
      };

      mockPrismaService.encounterCharge.findUnique.mockResolvedValue(
        mockCharge,
      );
      mockPrismaService.encounterCharge.delete.mockResolvedValue(mockCharge);

      const result = await service.deleteCharge(mockHospitalId, 1);
      expect(result).toEqual({ success: true });
      expect(mockPrismaService.encounterCharge.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw NotFoundException if charge not found', async () => {
      mockPrismaService.encounterCharge.findUnique.mockResolvedValue(null);

      await expect(service.deleteCharge(mockHospitalId, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if charge belongs to another hospital', async () => {
      const mockCharge = {
        id: 1,
        hospitalId: 999, // different hospital
        invoiceId: null,
      };

      mockPrismaService.encounterCharge.findUnique.mockResolvedValue(
        mockCharge,
      );

      await expect(service.deleteCharge(mockHospitalId, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if charge is already billed', async () => {
      const mockCharge = {
        id: 1,
        hospitalId: mockHospitalId,
        invoiceId: 45, // already billed
      };

      mockPrismaService.encounterCharge.findUnique.mockResolvedValue(
        mockCharge,
      );

      await expect(service.deleteCharge(mockHospitalId, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
