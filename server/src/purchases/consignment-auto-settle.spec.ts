import { PaymentMethod, PurchaseInvoiceStatus } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccountingService } from '../accounting/accounting.service';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';

jest.mock('../accounting/financial-posting', () => ({
  financialPeriod: jest
    .fn()
    .mockResolvedValue({ financialYear: { id: 1 }, period: { id: 1 } }),
}));

jest.mock('../audit/audit-chain', () => ({
  appendChainedAuditInTransaction: jest.fn().mockResolvedValue({
    id: 901,
    action: 'CONSIGNMENT_CONSUMPTIONS_AUTO_SETTLED',
  }),
}));

jest.mock('../audit/siem.logger', () => ({
  publishCommittedCriticalAudit: jest.fn(),
}));

describe('PurchasesService — CAP10 Consignment Auto-Settlement on Full Supplier Payment', () => {
  const buildService = () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 55,
          hospitalId: 1,
          supplierId: 9,
          status: PurchaseInvoiceStatus.APPROVED,
          netAmount: '1000.000',
          paidAmount: '0.000',
        }),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              id: 55,
              status:
                (data.status as PurchaseInvoiceStatus) ??
                PurchaseInvoiceStatus.APPROVED,
              ...data,
            }),
          ),
      },
      purchaseReturn: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: null } }),
      },
      supplierPayment: {
        create: jest.fn().mockResolvedValue({ id: 77, amount: '1000.000' }),
      },
      consignmentConsumption: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const accounting = {
      recordSupplierPaymentEntry: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PurchasesService(
      prisma as unknown as PrismaService,
      accounting as unknown as AccountingService,
    );
    return { service, tx, accounting };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does NOT settle BILLED consignment consumptions on partial supplier payment', async () => {
    const { service, tx } = buildService();

    const res = (await service.recordSupplierPayment({
      hospitalId: 1,
      purchaseInvoiceId: 55,
      supplierId: 9,
      amount: 400,
      method: PaymentMethod.TRANSFER,
      userId: 12,
    })) as {
      invoice: { status: PurchaseInvoiceStatus };
      settledConsignmentsCount: number;
    };

    expect(res.invoice.status).toBe(PurchaseInvoiceStatus.PARTIALLY_PAID);
    expect(res.settledConsignmentsCount).toBe(0);
    expect(tx.consignmentConsumption.updateMany).not.toHaveBeenCalled();
    expect(appendChainedAuditInTransaction).not.toHaveBeenCalled();
  });

  it('automatically transitions BILLED consignment consumptions to SETTLED and audits on full payment (PAID)', async () => {
    const { service, tx } = buildService();

    const res = (await service.recordSupplierPayment({
      hospitalId: 1,
      purchaseInvoiceId: 55,
      supplierId: 9,
      amount: 1000,
      method: PaymentMethod.TRANSFER,
      userId: 12,
    })) as {
      invoice: { status: PurchaseInvoiceStatus };
      settledConsignmentsCount: number;
    };

    expect(res.invoice.status).toBe(PurchaseInvoiceStatus.PAID);
    expect(res.settledConsignmentsCount).toBe(3);
    expect(tx.consignmentConsumption.updateMany).toHaveBeenCalledWith({
      where: {
        hospitalId: 1,
        purchaseInvoiceId: 55,
        supplierBillStatus: 'BILLED',
      },
      data: { supplierBillStatus: 'SETTLED' },
    });
    expect(appendChainedAuditInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        hospitalId: 1,
        userId: 12,
        action: 'CONSIGNMENT_CONSUMPTIONS_AUTO_SETTLED',
        entity: 'PurchaseInvoice',
        entityId: 55,
      }),
    );
    expect(publishCommittedCriticalAudit).toHaveBeenCalledTimes(1);
  });
});
