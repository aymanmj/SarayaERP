import { Prisma } from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { ConflictException } from '@nestjs/common';

export async function claimCollectionBalance(
  tx: Pick<Prisma.TransactionClient, 'claimReceipt' | 'claimReceiptRefund'>,
  hospitalId: number,
  claimId: number,
) {
  const receipts = await tx.claimReceipt.aggregate({
    where: { hospitalId, claimId },
    _sum: { amount: true },
  });
  const refunds = await tx.claimReceiptRefund.aggregate({
    where: { hospitalId, receipt: { hospitalId, claimId }, status: 'POSTED' },
    _sum: { amount: true },
  });
  const gross = Money.decimal(receipts._sum.amount);
  const refunded = Money.decimal(refunds._sum.amount);
  return { gross, refunded, net: gross.minus(refunded) };
}

export async function assertClaimReceivableJournals(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  claimId: number,
  accountId: number,
) {
  const [mismatch] = await tx.$queryRaw<{ id: number }[]>`
    SELECT r.id
    FROM "ClaimReceipt" r
    JOIN "Claim" c ON c.id = r."claimId" AND c."hospitalId" = r."hospitalId"
    LEFT JOIN "AccountingEntry" e ON e."hospitalId" = r."hospitalId"
      AND e."postingKey" = concat('claim-receipt:', r."hospitalId", ':', r.id)
    WHERE r."hospitalId" = ${hospitalId} AND c.id = ${claimId}
      AND r.amount > COALESCE((SELECT SUM(f.amount) FROM "ClaimReceiptRefund" f
        WHERE f."receiptId" = r.id AND f."hospitalId" = r."hospitalId" AND f.status = 'POSTED'), 0)
      AND (
        (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id AND l."accountId" = ${accountId}) IS DISTINCT FROM r.amount
        OR EXISTS (SELECT 1 FROM "AccountingEntry" x WHERE x."hospitalId" = r."hospitalId"
          AND x."sourceModule" = 'JOURNAL_REVERSAL' AND x."sourceId" = e.id)
      )
    LIMIT 1
  `;
  if (mismatch)
    throw new ConflictException(
      'يوجد تحصيل سابق بحاجة إلى مطابقة مع حساب ذمة التأمين الأصلي',
    );
}
