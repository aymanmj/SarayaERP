import { Prisma } from '@prisma/client';
import { Money } from '../common/utils/money.util';

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
