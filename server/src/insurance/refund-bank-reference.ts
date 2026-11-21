import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Both refund workflows hold the hospital's insurer settlement lock on entry.
export async function ensureUnusedRefundBankReference(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  reference: string,
) {
  const [duplicate] = await tx.$queryRaw<{ used: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "InsuranceSettlementRefund"
      WHERE "hospitalId" = ${hospitalId} AND upper("bankReference") = upper(${reference})
      UNION ALL
      SELECT 1 FROM "ClaimReceiptRefund"
      WHERE "hospitalId" = ${hospitalId} AND upper("bankReference") = upper(${reference})
    ) AS used
  `;
  if (duplicate.used) throw new ConflictException('مرجع التحويل مسجل مسبقًا');
}
