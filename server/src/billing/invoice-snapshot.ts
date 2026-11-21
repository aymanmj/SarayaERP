import { BadRequestException } from '@nestjs/common';
import { Prisma, SystemAccountKey } from '@prisma/client';
import { Money, type MoneyValue } from '../common/utils/money.util';
import { invoicePostingKey } from '../accounting/financial-posting';

export type InvoiceLine = {
  id: number;
  hospitalId: number;
  encounterId: number;
  invoiceId: number;
  serviceItemId: number;
  sourceType: string;
  sourceId: number | null;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  revenueAccountId: number;
  roomBillingKey: string | null;
  roomAllocation: Prisma.JsonValue;
  createdAt: string;
  serviceItem: { id: number; name: string; code: string | null; type: string };
};
export type InvoiceSnapshot = {
  version: 1;
  invoiceId: number;
  totalAmount: string;
  patientShare: string;
  insuranceShare: string;
  lines: InvoiceLine[];
};
export function readInvoiceSnapshot(
  value: Prisma.JsonValue | undefined,
): InvoiceSnapshot | null {
  if (!value) return null;
  const snapshot = value as unknown as InvoiceSnapshot;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.lines))
    throw new BadRequestException('نسخة بنود الفاتورة غير صالحة؛ تجب مراجعتها');
  return snapshot;
}
export async function captureInvoiceSnapshot(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  invoiceId: number,
) {
  const invoice = await tx.invoice.findFirstOrThrow({
    where: { id: invoiceId, hospitalId },
    include: {
      charges: { include: { serviceItem: true }, orderBy: { id: 'asc' } },
    },
  });
  if (invoice.lineSnapshot) return;
  const entry = await tx.accountingEntry.findUniqueOrThrow({
    where: { postingKey: invoicePostingKey(hospitalId, invoiceId) },
    include: { lines: true },
  });
  const keys: Record<string, SystemAccountKey> = {
    BED: 'REVENUE_INPATIENT',
    LAB: 'REVENUE_LAB',
    RADIOLOGY: 'REVENUE_RADIOLOGY',
    PHARMACY: 'REVENUE_PHARMACY',
  };
  const lines: InvoiceLine[] = [];
  for (const charge of invoice.charges) {
    const mapping = await tx.systemAccountMapping.findUnique({
      where: {
        hospitalId_key: {
          hospitalId,
          key: keys[charge.serviceItem.type] ?? 'REVENUE_OUTPATIENT',
        },
      },
    });
    if (
      !mapping ||
      !entry.lines.some(
        (line) =>
          line.accountId === mapping.accountId && Money.isPositive(line.credit),
      )
    )
      throw new BadRequestException('قيد الإيراد لا يطابق بند الفاتورة');
    lines.push({
      id: charge.id,
      hospitalId,
      encounterId: charge.encounterId,
      invoiceId,
      serviceItemId: charge.serviceItemId,
      sourceType: charge.sourceType,
      sourceId: charge.sourceId,
      quantity: charge.quantity,
      unitPrice: Money.toDbString(charge.unitPrice),
      totalAmount: Money.toDbString(charge.totalAmount),
      revenueAccountId: mapping.accountId,
      roomBillingKey: charge.roomBillingKey,
      roomAllocation: charge.roomAllocation,
      createdAt: charge.createdAt.toISOString(),
      serviceItem: {
        id: charge.serviceItem.id,
        name: charge.serviceItem.name,
        code: charge.serviceItem.code,
        type: charge.serviceItem.type,
      },
    });
  }
  if (
    !Money.eq(
      Money.sumDecimal(...lines.map((line) => line.totalAmount)),
      invoice.totalAmount,
    )
  )
    throw new BadRequestException('نسخة بنود الفاتورة لا تطابق إجماليها');
  const snapshot: InvoiceSnapshot = {
    version: 1,
    invoiceId,
    totalAmount: Money.toDbString(invoice.totalAmount),
    patientShare: Money.toDbString(invoice.patientShare),
    insuranceShare: Money.toDbString(invoice.insuranceShare),
    lines,
  };
  await tx.invoice.update({
    where: { id: invoiceId, hospitalId },
    data: { lineSnapshot: snapshot as unknown as Prisma.InputJsonValue },
  });
}

export function effectivePatientShare(invoice: {
  patientShare: MoneyValue;
  adjustments?: { delta: MoneyValue }[];
}) {
  return Money.sumDecimal(
    invoice.patientShare,
    ...(invoice.adjustments ?? []).map((item) => item.delta),
  );
}

export function effectiveInsuranceShare(invoice: {
  insuranceShare: MoneyValue;
  adjustments?: { insuranceDelta?: MoneyValue }[];
}) {
  return Money.sumDecimal(
    invoice.insuranceShare,
    ...(invoice.adjustments ?? []).map((item) => item.insuranceDelta ?? 0),
  );
}

export function totalInvoiceAdjustment(
  adjustments: { delta: MoneyValue; insuranceDelta?: MoneyValue }[],
) {
  return Money.sumDecimal(
    ...adjustments.map((item) =>
      Money.sumDecimal(item.delta, item.insuranceDelta),
    ),
  );
}

export function netPaidAmount(invoice: {
  paidAmount: MoneyValue;
  refunds?: { amount: MoneyValue }[];
}) {
  return Money.decimal(invoice.paidAmount).minus(
    Money.sumDecimal(...(invoice.refunds ?? []).map((item) => item.amount)),
  );
}

export async function adjustmentBalance(
  tx: Pick<Prisma.TransactionClient, 'invoiceAdjustment' | 'invoiceRefund'>,
  hospitalId: number,
  invoiceId: number,
  patientShare: MoneyValue,
  paidAmount: MoneyValue,
) {
  const items = await tx.invoiceAdjustment.findMany({
    where: { hospitalId, invoiceId, status: 'POSTED' },
    select: { delta: true, insuranceDelta: true },
  });
  const liability = effectivePatientShare({ patientShare, adjustments: items });
  const refunds = await tx.invoiceRefund.aggregate({
    where: { hospitalId, invoiceId, status: 'EXECUTED' },
    _sum: { amount: true },
  });
  const refunded = Money.decimal(refunds._sum.amount);
  const netPaid = Money.decimal(paidAmount).minus(refunded);
  const balance = liability.minus(netPaid);
  return {
    liability,
    balance,
    refunded,
    netPaid,
    delta: Money.subtractDecimal(liability, patientShare),
    insuranceDelta: effectiveInsuranceShare({
      insuranceShare: 0,
      adjustments: items,
    }),
    totalDelta: totalInvoiceAdjustment(items),
  };
}
