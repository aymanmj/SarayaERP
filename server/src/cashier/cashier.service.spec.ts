import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CashierService } from './cashier.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { InvoiceStatus, PaymentMethod, ServiceType } from '@prisma/client';

describe('CashierService', () => {
  let service: CashierService;
  let prisma: any;
  let accounting: any;
  let auditLogCreate: jest.Mock;

  beforeEach(async () => {
    auditLogCreate = jest.fn().mockResolvedValue({ id: 1 });
    prisma = {
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
      invoice: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        groupBy: jest.fn(),
      },
      patient: {
        findFirst: jest.fn(),
      },
      dispenseItem: {
        findMany: jest.fn(),
      },
      order: {
        updateMany: jest.fn(),
      },
      labOrder: {
        updateMany: jest.fn(),
      },
      radiologyOrder: {
        updateMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 7, hospitalId: 1, isActive: true }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      cashierShiftClosing: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      systemAccountMapping: {
        findFirst: jest.fn(),
      },
      accountingEntry: {
        create: jest.fn(),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: auditLogCreate,
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    accounting = {
      validateDateInOpenPeriod: jest.fn().mockResolvedValue({
        financialYear: { id: 1 },
        period: { id: 2 },
      }),
      recordInvoiceEntry: jest.fn(),
      recordPaymentEntry: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashierService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
      ],
    }).compile();

    service = module.get<CashierService>(CashierService);
    jest
      .spyOn(service as any, 'updateRelatedOrdersPaymentStatus')
      .mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWorklist', () => {
    it('returns invoices that still have patient liability or zero-payment confirmation pending', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 1,
          status: InvoiceStatus.ISSUED,
          totalAmount: 100,
          discountAmount: 0,
          paidAmount: 20,
          patientShare: 60,
          insuranceShare: 40,
          createdAt: new Date(),
          patient: { id: 1, fullName: 'Ahmed', mrn: 'MRN-1' },
          encounter: { id: 10, type: 'OPD' },
        },
        {
          id: 2,
          status: InvoiceStatus.ISSUED,
          totalAmount: 100,
          discountAmount: 0,
          paidAmount: 0,
          patientShare: 0,
          insuranceShare: 100,
          createdAt: new Date(),
          patient: { id: 2, fullName: 'Sara', mrn: 'MRN-2' },
          encounter: { id: 11, type: 'OPD' },
        },
        {
          id: 3,
          status: InvoiceStatus.PARTIALLY_PAID,
          totalAmount: 100,
          discountAmount: 0,
          paidAmount: 50,
          patientShare: 50,
          insuranceShare: 50,
          createdAt: new Date(),
          patient: { id: 3, fullName: 'Noor', mrn: 'MRN-3' },
          encounter: { id: 12, type: 'OPD' },
        },
      ]);

      const result = await service.getWorklist(1);

      expect(result.map((item) => item.id)).toEqual([1, 2]);
    });
  });

  describe('recordPayment', () => {
    beforeEach(() => {
      const db = prisma as {
        $queryRaw: jest.Mock;
        invoice: {
          findUnique: jest.Mock<
            Promise<{ paidAmount: number } & Record<string, unknown>>
          >;
          findFirst: jest.Mock;
          findFirstOrThrow: jest.Mock;
          count: jest.Mock;
        };
        payment: { aggregate: jest.Mock };
      };
      db.$queryRaw = jest.fn().mockResolvedValue([]);
      const invoice = async () => {
        const row = await db.invoice.findUnique();
        return row
          ? {
              patientId: 1,
              encounterId: 1,
              type: 'INVOICE',
              ...row,
              encounter: { hospitalId: 1, patientId: 1 },
            }
          : null;
      };
      db.invoice.findFirst.mockImplementation(invoice);
      db.invoice.findFirstOrThrow = jest.fn(invoice);
      db.invoice.count = jest.fn().mockResolvedValue(0);
      db.payment.aggregate = jest.fn(async () => ({
        _sum: { amount: (await db.invoice.findUnique()).paidAmount },
      }));
    });
    it('rejects overpayment beyond patient liability', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 1,
        hospitalId: 1,
        totalAmount: 100,
        discountAmount: 0,
        paidAmount: 10,
        patientShare: 30,
        insuranceShare: 70,
        status: InvoiceStatus.ISSUED,
      });

      await expect(
        service.recordPayment({
          hospitalId: 1,
          invoiceId: 1,
          amount: 25,
          method: PaymentMethod.CASH,
          userId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('confirms zero-payment insurance-covered invoices without creating payment rows', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 2,
        hospitalId: 1,
        totalAmount: 120,
        discountAmount: 0,
        paidAmount: 0,
        patientShare: 0,
        insuranceShare: 120,
        status: InvoiceStatus.ISSUED,
      });
      prisma.invoice.update.mockResolvedValue({
        id: 2,
        status: InvoiceStatus.PARTIALLY_PAID,
        totalAmount: 120,
        discountAmount: 0,
        paidAmount: 0,
      });

      const result = await service.recordPayment({
        hospitalId: 1,
        invoiceId: 2,
        amount: 0,
        method: PaymentMethod.CASH,
        userId: 7,
      });

      expect(result.paymentId).toBeNull();
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(accounting.recordPaymentEntry).not.toHaveBeenCalled();
      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 2, hospitalId: 1 },
        data: { status: InvoiceStatus.PARTIALLY_PAID, paidAmount: '0.000' },
      });
    });

    it('records a real payment, updates invoice state, and triggers downstream hooks', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 3,
        hospitalId: 1,
        totalAmount: 100,
        discountAmount: 0,
        paidAmount: 20,
        patientShare: 50,
        insuranceShare: 50,
        status: InvoiceStatus.ISSUED,
      });
      prisma.payment.create.mockResolvedValue({ id: 40 });
      prisma.invoice.update.mockResolvedValue({
        id: 3,
        status: InvoiceStatus.PARTIALLY_PAID,
        totalAmount: 100,
        discountAmount: 0,
        paidAmount: 50,
      });

      const result = await service.recordPayment({
        hospitalId: 1,
        invoiceId: 3,
        amount: 30,
        method: PaymentMethod.CARD,
        reference: 'POS-1',
        userId: 7,
      });

      expect(result.paymentId).toBe(40);
      const recorded = (
        prisma.payment.create as jest.Mock<
          unknown,
          [{ data: { paidAt: Date } & Record<string, unknown> }]
        >
      ).mock.calls[0][0].data;
      const { paidAt, ...paymentData } = recorded;
      expect(paidAt).toBeInstanceOf(Date);
      expect(paymentData).toEqual({
        hospitalId: 1,
        invoiceId: 3,
        amount: '30.000',
        requestKey: null,
        sessionId: null,
        method: PaymentMethod.CARD,
        reference: 'POS-1',
        cashierId: 7,
      });
      expect(
        (service as any).updateRelatedOrdersPaymentStatus,
      ).toHaveBeenCalledWith(prisma, 3);
      expect(accounting.recordPaymentEntry).toHaveBeenCalledWith({
        paymentId: 40,
        hospitalId: 1,
        userId: 7,
        prisma: prisma as PrismaService,
      });
      expect(auditLogCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('getInvoiceDetails', () => {
    it('includes pharmacy breakdown and substitution flags', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 9,
        status: InvoiceStatus.ISSUED,
        totalAmount: 75,
        discountAmount: 0,
        paidAmount: 25,
        currency: 'LYD',
        createdAt: new Date(),
        patientShare: 75,
        insuranceShare: 0,
        patient: { id: 1, fullName: 'Patient', mrn: 'MRN-1' },
        encounter: { id: 10, type: 'OPD' },
        charges: [
          {
            id: 99,
            sourceType: 'PHARMACY',
            sourceId: 501,
            quantity: 1,
            unitPrice: 75,
            totalAmount: 75,
            serviceItem: {
              id: 7,
              name: 'Pharmacy Drugs',
              code: 'PHARMACY-DRUGS',
              type: ServiceType.PHARMACY,
            },
          },
        ],
      });
      prisma.dispenseItem.findMany.mockResolvedValue([
        {
          id: 1,
          dispenseRecordId: 501,
          productId: 2,
          quantity: 3,
          unitPrice: 25,
          totalAmount: 75,
          product: {
            id: 2,
            code: 'ALT',
            name: 'Alt Drug',
            strength: '10mg',
            form: 'TAB',
          },
          prescriptionItem: {
            productId: 1,
            product: {
              id: 1,
              code: 'ORG',
              name: 'Original Drug',
              strength: '10mg',
              form: 'TAB',
            },
          },
        },
      ]);

      const result = await service.getInvoiceDetails(1, 9);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].pharmacyItems?.[0].isSubstitute).toBe(true);
      expect(result.lines[0].pharmacyItems?.[0].dispensedDrug?.name).toBe(
        'Alt Drug',
      );
    });

    it('throws when invoice details are requested for unknown invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.getInvoiceDetails(1, 404)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('patient financial views', () => {
    it('builds patient statement summary from invoices and payments', async () => {
      prisma.patient.findFirst.mockResolvedValue({
        id: 1,
        fullName: 'Ahmed',
        mrn: 'MRN-1',
      });
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 1,
          status: InvoiceStatus.ISSUED,
          totalAmount: 100,
          discountAmount: 10,
          paidAmount: 40,
          createdAt: new Date(),
          encounter: { id: 10, type: 'OPD' },
        },
        {
          id: 2,
          status: InvoiceStatus.PAID,
          totalAmount: 50,
          discountAmount: 0,
          paidAmount: 50,
          createdAt: new Date(),
          encounter: { id: 11, type: 'LAB' },
        },
      ]);
      prisma.payment.findMany.mockResolvedValue([
        {
          id: 20,
          invoiceId: 1,
          amount: 40,
          method: PaymentMethod.CASH,
          reference: null,
          paidAt: new Date(),
          invoice: { id: 1, createdAt: new Date() },
        },
      ]);

      const result = await service.getPatientStatement(1, 1);

      expect(result.summary).toEqual({
        totalInvoiced: 150,
        totalDiscount: 10,
        totalPaid: 90,
        grossCollected: 40,
        totalRefunded: 0,
        remaining: 50,
      });
      expect(result.payments).toHaveLength(1);
    });

    it('returns payment receipt with normalized numeric fields', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 30,
        amount: 25,
        method: PaymentMethod.CARD,
        paidAt: new Date('2026-04-19T10:00:00Z'),
        reference: 'REF-10',
        invoice: {
          id: 9,
          status: InvoiceStatus.PARTIALLY_PAID,
          totalAmount: 100,
          discountAmount: 5,
          paidAmount: 25,
          currency: 'LYD',
          createdAt: new Date('2026-04-19T09:00:00Z'),
          patient: { id: 1, fullName: 'Patient', mrn: 'MRN-1' },
          encounter: { id: 10, type: 'OPD' },
        },
      });

      const result = await service.getPaymentReceipt(1, 30);

      expect(result.invoice.remainingAmount).toBe(70);
      expect(result.payment?.reference).toBe('REF-10');
    });
  });
});
