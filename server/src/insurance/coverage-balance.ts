import { Prisma } from '@prisma/client';
import { Money, type MoneyValue } from '../common/utils/money.util';

export async function readCoverageBalance(
  db: Pick<Prisma.TransactionClient, 'insuranceCoverageBalance' | 'invoice'>,
  identity: {
    hospitalId: number;
    patientId: number;
    policyId: number;
    providerId: number;
    cap: MoneyValue;
  },
) {
  const { hospitalId, patientId, policyId, providerId, cap } = identity;
  const used = await db.insuranceCoverageBalance.findUnique({
    where: { patientId_policyId: { patientId, policyId } },
    select: { usedAmount: true },
  });
  const unattributed = await db.invoice.findFirst({
    where: {
      hospitalId,
      patientId,
      insuranceProviderId: providerId,
      coveragePolicyId: null,
      insuranceShare: { gt: 0 },
      type: 'INVOICE',
      status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID'] },
    },
    select: { id: true },
  });
  const usedAmount = Money.toDbString(used?.usedAmount);
  return {
    policyId,
    cap: cap == null ? null : Money.toDbString(cap),
    usedAmount,
    remainingAmount:
      cap == null || unattributed
        ? null
        : Money.toDbString(
            Money.decimalMax(0, Money.subtractDecimal(cap, usedAmount)),
          ),
    requiresReconciliation: !!unattributed,
  };
}
