import { Prisma } from '@prisma/client';
import { SuppliersService } from './suppliers.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('SuppliersService Money precision (FIN03A & FLOW04)', () => {
  it('computes getSupplierStatement and getSuppliersAging with Money precision and FIFO credit deduction', async () => {
    const prismaMock = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          name: 'شركة التجهيزات الطبية',
          code: 'SUP-10',
        }),
      },
      purchaseInvoice: {
        findMany: jest
          .fn()
          // 1st call: getSupplierStatement
          .mockResolvedValueOnce([
            {
              id: 1,
              invoiceDate: new Date('2026-01-10T00:00:00.000Z'),
              invoiceNumber: 'INV-1',
              notes: 'أدوية',
              netAmount: new Prisma.Decimal('100.105'),
            },
            {
              id: 2,
              invoiceDate: new Date('2026-03-05T00:00:00.000Z'),
              invoiceNumber: 'INV-2',
              notes: 'مستلزمات',
              netAmount: new Prisma.Decimal('50.205'),
            },
          ])
          // 2nd call: getSuppliersAging
          .mockResolvedValueOnce([
            {
              id: 1,
              supplierId: 10,
              invoiceDate: new Date('2026-01-01T00:00:00.000Z'),
              netAmount: new Prisma.Decimal('100.105'),
              purchaseReturns: [{ totalAmount: new Prisma.Decimal('10.005') }],
              supplier: {
                id: 10,
                name: 'شركة التجهيزات الطبية',
                code: 'SUP-10',
              },
            },
            {
              id: 2,
              supplierId: 10,
              invoiceDate: new Date('2026-05-05T00:00:00.000Z'),
              netAmount: new Prisma.Decimal('50.205'),
              purchaseReturns: [],
              supplier: {
                id: 10,
                name: 'شركة التجهيزات الطبية',
                code: 'SUP-10',
              },
            },
          ]),
      },
      supplierPayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 100,
            paidAt: new Date('2026-01-20T00:00:00.000Z'),
            reference: 'PAY-100',
            notes: 'دفعة أولى',
            amount: new Prisma.Decimal('40.005'),
            purchaseInvoiceId: 1,
          },
        ]),
        groupBy: jest
          .fn()
          // 1st call: paidByInvoice
          .mockResolvedValueOnce([
            {
              purchaseInvoiceId: 1,
              _sum: { amount: new Prisma.Decimal('40.005') },
            },
          ])
          // 2nd call: unallocated payments
          .mockResolvedValueOnce([
            {
              supplierId: 10,
              _sum: { amount: new Prisma.Decimal('60.095') },
            },
          ]),
      },
      purchaseReturn: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 200,
              returnDate: new Date('2026-03-10T00:00:00.000Z'),
              reason: 'تالف',
              totalAmount: new Prisma.Decimal('10.005'),
              purchaseInvoiceId: 2,
            },
          ])
          .mockResolvedValueOnce([]),
      },
    };

    const service = new SuppliersService(
      prismaMock as unknown as PrismaService,
    );

    const statement = await service.getSupplierStatement(1, 10, {
      fromDate: new Date('2026-03-01T00:00:00.000Z'),
      toDate: new Date('2026-03-31T23:59:59.999Z'),
    });
    // Opening = 100.105 - 40.005 = 60.100
    // Period: +50.205 - 10.005 => closing = 100.300
    expect(statement.openingBalance).toBe(60.1);
    expect(statement.totalDebit).toBe(50.205);
    expect(statement.totalCredit).toBe(10.005);
    expect(statement.closingBalance).toBe(100.3);

    const aging = await service.getSuppliersAging(
      1,
      new Date('2026-05-15T00:00:00.000Z'),
    );
    // Inv 1 (134d -> b121_plus): 100.105 - 40.005 - 10.005 = 50.095
    // Inv 2 (10d -> b0_30): 50.205
    // Unallocated credit = 60.095 -> wipes 50.095 from b121_plus, leaves 10.000 deducted from b0_30 -> b0_30 = 40.205
    expect(aging.grandTotals).toEqual({
      b0_30: 40.205,
      b31_60: 0,
      b61_90: 0,
      b91_120: 0,
      b121_plus: 0,
      total: 40.205,
      unallocatedCredit: 60.095,
      creditBalance: 0,
    });
  });
});
