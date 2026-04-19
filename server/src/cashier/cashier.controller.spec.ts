import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CashierController } from './cashier.controller';
import { CashierService } from './cashier.service';
import { PdfService } from '../pdf/pdf.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CashierController', () => {
  let controller: CashierController;
  let cashierService: any;
  let pdfService: any;
  let prisma: any;

  const user = { sub: 8, id: 8, hospitalId: 1, roles: ['CASHIER'] };
  const admin = { sub: 1, id: 1, hospitalId: 1, roles: ['ADMIN'] };

  beforeEach(async () => {
    cashierService = {
      getWorklist: jest.fn(),
      recordPayment: jest.fn(),
      getPatientStatement: jest.fn(),
      getInvoiceDetails: jest.fn(),
      getPaymentReceipt: jest.fn(),
      getDailyReport: jest.fn(),
      listCashierUsers: jest.fn(),
      getCashierUserReport: jest.fn(),
      closeCashierShift: jest.fn(),
      listCashierShifts: jest.fn(),
    };
    pdfService = {
      generatePdf: jest.fn(),
    };
    prisma = {
      hospital: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CashierController],
      providers: [
        { provide: CashierService, useValue: cashierService },
        { provide: PdfService, useValue: pdfService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get<CashierController>(CashierController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('routes payment recording with hospital/user context', async () => {
    cashierService.recordPayment.mockResolvedValue({ id: 10 });

    const result = await controller.recordPayment(
      5,
      { amount: 40, method: 'CASH', reference: 'R-1' } as any,
      user as any,
    );

    expect(result).toEqual({ id: 10 });
    expect(cashierService.recordPayment).toHaveBeenCalledWith({
      hospitalId: 1,
      invoiceId: 5,
      amount: 40,
      method: 'CASH',
      reference: 'R-1',
      userId: 8,
    });
  });

  it('builds daily report range for selected date', async () => {
    cashierService.getDailyReport.mockResolvedValue({ ok: true });

    await controller.getDailyReport({ user } as any, '2026-04-19');

    expect(cashierService.getDailyReport).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        start: new Date('2026-04-19T00:00:00.000'),
        end: new Date('2026-04-19T23:59:59.999'),
      }),
    );
  });

  it('prevents cashier from requesting another cashier report', async () => {
    await expect(
      controller.getCashierUserReport(
        { user } as any,
        '2026-04-19',
        '08:00',
        '16:00',
        '99',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows admin to request another cashier report with overnight shift support', async () => {
    cashierService.getCashierUserReport.mockResolvedValue({ ok: true });

    await controller.getCashierUserReport(
      { user: admin } as any,
      '2026-04-19',
      '20:00',
      '04:00',
      '8',
    );

    expect(cashierService.getCashierUserReport).toHaveBeenCalledWith(
      1,
      8,
      expect.objectContaining({
        start: new Date('2026-04-19T20:00:00.000'),
        end: new Date('2026-04-20T04:00:59.999'),
      }),
    );
  });

  it('downloads payment receipt pdf from normalized receipt data', async () => {
    cashierService.getPaymentReceipt.mockResolvedValue({
      payment: {
        id: 5,
        amount: 25,
        method: 'CARD',
        paidAt: new Date('2026-04-19T10:00:00Z'),
        reference: 'POS-1',
      },
      invoice: {
        id: 11,
        status: 'PAID',
        totalAmount: 100,
        discountAmount: 10,
        paidAmount: 90,
        remainingAmount: 0,
        currency: 'LYD',
        createdAt: new Date('2026-04-19T09:00:00Z'),
      },
      patient: { id: 2, fullName: 'Ahmed', mrn: 'MRN-1' },
      encounter: { id: 3, type: 'OPD' },
    });
    prisma.hospital.findUnique.mockResolvedValue({
      displayName: 'Saraya Hospital',
      addressLine1: 'Tripoli',
      city: 'Tripoli',
      phone: '123',
      email: 'info@example.com',
    });
    pdfService.generatePdf.mockResolvedValue(Buffer.from('pdf'));

    const res = { set: jest.fn(), end: jest.fn() };

    await controller.downloadPaymentReceiptPdf(5, user as any, res as any);

    expect(pdfService.generatePdf).toHaveBeenCalledWith(
      'booking-receipt-modern',
      expect.objectContaining({
        paymentId: 5,
        patient: expect.objectContaining({ fullName: 'Ahmed' }),
        organization: expect.objectContaining({ displayName: 'Saraya Hospital' }),
      }),
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('pdf'));
  });

  it('rejects invalid close shift user id', async () => {
    await expect(
      controller.closeShift(
        { user: { hospitalId: 1, sub: 'bad-id' } } as any,
        { date: '2026-04-19', from: '08:00', to: '16:00', actualCash: 100 } as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('routes close shift with overnight correction', async () => {
    cashierService.closeCashierShift.mockResolvedValue({ id: 1 });

    await controller.closeShift(
      { user } as any,
      { date: '2026-04-19', from: '20:00', to: '04:00', actualCash: 100, note: 'night' } as any,
    );

    expect(cashierService.closeCashierShift).toHaveBeenCalledWith(
      1,
      8,
      expect.objectContaining({
        start: new Date('2026-04-19T20:00:00.000'),
        end: new Date('2026-04-20T04:00:00.000'),
        actualCash: 100,
        note: 'night',
      }),
    );
  });
});
