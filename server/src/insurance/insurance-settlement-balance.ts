import { BadRequestException } from '@nestjs/common';
import { type Account, type Invoice, Prisma } from '@prisma/client';
import { lockFinancialInvoice } from '../accounting/financial-posting';
import { originalInsuranceReceivable } from '../accounting/insurance-receivable';
import { adjustmentBalance } from '../billing/invoice-snapshot';
import { Money } from '../common/utils/money.util';
import { dispensedPrescriptionClaim } from '../pharmacy/prescription-prepayment';

export const MONEY_INPUT_PATTERN = /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/;

export const settlementAllocationBalance = {
  amount: true,
  refunds: {
    where: { refund: { status: 'POSTED' } },
    select: { amount: true },
  },
} satisfies Prisma.InsuranceSettlementAllocationSelect;

export function settlementNet(
  allocations: Prisma.InsuranceSettlementAllocationGetPayload<{
    select: typeof settlementAllocationBalance;
  }>[],
) {
  return Money.sumDecimal(
    ...allocations.map((allocation) =>
      allocation.amount.minus(
        Money.sumDecimal(...allocation.refunds.map((refund) => refund.amount)),
      ),
    ),
  );
}

export function settledClaimStatus(net: Prisma.Decimal, share: Prisma.Decimal) {
  if (net.eq(share)) return 'PAID';
  return net.isZero() ? 'SUBMITTED' : 'PARTIALLY_PAID';
}

export async function trackedInsuranceShare(
  tx: Pick<Prisma.TransactionClient, 'invoiceAdjustment'>,
  invoice: { id: number; hospitalId: number; insuranceShare: Prisma.Decimal },
) {
  const credits = await tx.invoiceAdjustment.aggregate({
    where: {
      invoiceId: invoice.id,
      hospitalId: invoice.hospitalId,
      status: 'POSTED',
      OR: [{ insuranceOnly: true }, { partialDispense: true }],
    },
    _sum: { insuranceDelta: true },
  });
  return Money.sumDecimal(invoice.insuranceShare, credits._sum.insuranceDelta);
}

export async function initialTrackedInsuranceShare(
  tx: Pick<Prisma.TransactionClient, 'invoiceAdjustment'>,
  invoice: { id: number; hospitalId: number; insuranceShare: Prisma.Decimal },
) {
  const credit = await tx.invoiceAdjustment.findFirst({
    where: {
      invoiceId: invoice.id,
      hospitalId: invoice.hospitalId,
      status: 'POSTED',
      partialDispense: true,
    },
    select: { insuranceDelta: true },
  });
  return Money.sumDecimal(invoice.insuranceShare, credit?.insuranceDelta);
}

export async function readSettlementBalance(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  invoiceId: number,
) {
  const history = await tx.insuranceSettlementAllocation.findMany({
    where: { invoiceId, settlement: { hospitalId } },
    select: settlementAllocationBalance,
  });
  return { net: settlementNet(history), hasHistory: history.length > 0 };
}

export function unallocatedSummary(settlement: {
  unallocatedAmount: Prisma.Decimal;
  applications: { amount: Prisma.Decimal }[];
  refunds: { status: string; unallocatedAmount: Prisma.Decimal }[];
}) {
  const applied = Money.sumDecimal(
    ...settlement.applications.map((item) => item.amount),
  );
  const refunded = Money.sumDecimal(
    ...settlement.refunds
      .filter((item) => item.status === 'POSTED')
      .map((item) => item.unallocatedAmount),
  );
  const pendingRefund = Money.sumDecimal(
    ...settlement.refunds
      .filter((item) => item.status === 'PENDING')
      .map((item) => item.unallocatedAmount),
  );
  const available = settlement.unallocatedAmount
    .minus(applied)
    .minus(refunded)
    .minus(pendingRefund);
  return {
    unallocatedAmount: settlement.unallocatedAmount,
    applied,
    refunded,
    pendingRefund,
    available,
  };
}

export type SettlementLineInput = { invoiceId: number; amount: string };

export function parseExplicitAllocations(
  invoiceIds: number[],
  allocations: SettlementLineInput[] | undefined,
  expectedTotal: Prisma.Decimal | string,
) {
  if (allocations === undefined) return undefined;
  if (
    !Array.isArray(allocations) ||
    allocations.length !== invoiceIds.length ||
    allocations.some(
      (line) =>
        !line ||
        !invoiceIds.includes(line.invoiceId) ||
        !MONEY_INPUT_PATTERN.test(line.amount) ||
        !Money.isPositive(line.amount),
    )
  )
    throw new BadRequestException('يلزم تخصيص موجب ودقيق لكل فاتورة مختارة');
  const explicit = new Map(
    allocations.map(({ invoiceId, amount }) => [invoiceId, amount]),
  );
  if (
    explicit.size !== invoiceIds.length ||
    !Money.eq(Money.sumDecimal(...explicit.values()), expectedTotal)
  )
    throw new BadRequestException('مجموع التخصيصات يجب أن يطابق المبلغ المخصص');
  return explicit;
}

export type PreparedSettlementDue = {
  invoice: Invoice;
  outstanding: Prisma.Decimal;
  amount: Prisma.Decimal;
  hasHistory: boolean;
};

export async function prepareSettlementAllocations(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  providerId: number,
  invoiceIds: number[],
  expectedTotal: Prisma.Decimal,
  explicit?: Map<number, string>,
  unallocatedAccount?: Account | null,
) {
  const candidates = await tx.invoice.findMany({
    where: {
      id: { in: invoiceIds },
      hospitalId,
      insuranceProviderId: providerId,
      ...dispensedPrescriptionClaim,
    },
    select: { id: true },
    orderBy: [{ patientId: 'asc' }, { encounterId: 'asc' }, { id: 'asc' }],
  });
  if (candidates.length !== invoiceIds.length)
    throw new BadRequestException(
      'كل الفواتير المؤهلة يجب أن تخص المنشأة وشركة التأمين المختارة',
    );
  const invoices: Invoice[] = [];
  for (const { id } of candidates) {
    invoices.push(await lockFinancialInvoice(tx, hospitalId, id));
  }
  if (
    invoices.some(
      (invoice) =>
        invoice.type !== 'INVOICE' ||
        invoice.insuranceProviderId !== providerId ||
        !['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status) ||
        !['SUBMITTED', 'PARTIALLY_PAID'].includes(invoice.claimStatus ?? '') ||
        !Money.isPositive(invoice.insuranceShare),
    )
  )
    throw new BadRequestException(
      'الفواتير يجب أن تخص مطالبات مرسلة ومبالغ مستحقة لم تسو بعد',
    );
  if (
    await tx.claim.count({
      where: { hospitalId, invoiceId: { in: invoiceIds } },
    })
  )
    throw new BadRequestException(
      'توجد مطالبات مسجلة في دورة الإيرادات؛ استكملها في المسار نفسه',
    );
  if (
    await tx.invoiceAdjustment.count({
      where: {
        hospitalId,
        invoiceId: { in: invoiceIds },
        OR: [
          { status: 'PENDING' },
          {
            status: 'POSTED',
            insuranceOnly: false,
            partialDispense: false,
            insuranceDelta: { not: 0 },
          },
        ],
      },
    })
  )
    throw new BadRequestException(
      'توجد تسويات معلقة أو تغيرات في ذمة التأمين تتطلب المطابقة',
    );

  const dues: PreparedSettlementDue[] = [];
  for (const invoice of invoices) {
    const { net, hasHistory } = await readSettlementBalance(
      tx,
      hospitalId,
      invoice.id,
    );
    const share = await trackedInsuranceShare(tx, invoice);
    const outstanding = share.minus(net);
    if (
      net.lt(0) ||
      !outstanding.gt(0) ||
      invoice.claimStatus !== settledClaimStatus(net, share)
    )
      throw new BadRequestException('رصيد التأمين المستحق يحتاج إلى مطابقة');
    const amount = Money.decimal(explicit?.get(invoice.id) ?? outstanding);
    if (amount.gt(outstanding))
      throw new BadRequestException(
        `التخصيص يتجاوز الرصيد المستحق للفاتورة #${invoice.id}`,
      );
    dues.push({ invoice, outstanding, amount, hasHistory });
  }
  const allocatedTotal = Money.sumDecimal(...dues.map(({ amount }) => amount));
  if (!Money.eq(allocatedTotal, expectedTotal))
    throw new BadRequestException(
      'المبلغ المخصص لا يطابق مجموع الأرصدة المستحقة؛ حدد تخصيص كل فاتورة للحوالة الجزئية',
    );

  const credits = new Map<number, Prisma.Decimal>();
  const allocations: Prisma.InsuranceSettlementAllocationUncheckedCreateWithoutSettlementInput[] =
    [];
  for (const { invoice, outstanding, amount } of dues) {
    const { receivable } = await originalInsuranceReceivable(tx, invoice);
    if (unallocatedAccount && receivable.accountId === unallocatedAccount.id)
      throw new BadRequestException(
        'حساب الحوالات غير الموزعة يطابق حساب الذمة',
      );
    credits.set(
      receivable.accountId,
      Money.sumDecimal(credits.get(receivable.accountId), amount),
    );
    allocations.push({
      invoiceId: invoice.id,
      originalReceivableId: receivable.id,
      amount: Money.toDbString(amount),
      outstandingBefore: Money.toDbString(outstanding),
    });
  }
  return { dues, credits, allocations, allocatedTotal };
}

export async function updateSettledInvoiceStatuses(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  dues: PreparedSettlementDue[],
) {
  for (const { invoice, amount, outstanding } of dues) {
    const patient = await adjustmentBalance(
      tx,
      hospitalId,
      invoice.id,
      invoice.patientShare,
      invoice.paidAmount,
    );
    const settled = amount.eq(outstanding);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        claimStatus: settled ? 'PAID' : 'PARTIALLY_PAID',
        status: settled && patient.balance.lte(0) ? 'PAID' : 'PARTIALLY_PAID',
      },
    });
  }
}
