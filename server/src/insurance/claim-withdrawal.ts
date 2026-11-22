import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lockFinancialInvoice } from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import { claimCollectionBalance } from '../rcm/claim-collection-balance';
import {
  initialTrackedInsuranceShare,
  readSettlementBalance,
} from './insurance-settlement-balance';

const OUTSTANDING = ['SUBMITTED', 'ACCEPTED', 'REJECTED', 'APPEAL_ACCEPTED'];

export type ClaimWithdrawalInput = {
  payerReference: string;
  reason: string;
  confirmed: boolean;
};

export async function recordClaimWithdrawal(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  invoiceId: number,
  userId: number,
  input: ClaimWithdrawalInput,
) {
  const payerReference = input.payerReference.trim();
  const reason = input.reason.trim();
  if (!input.confirmed || payerReference.length < 5 || reason.length < 5)
    throw new BadRequestException(
      'يلزم تأكيد السحب من شركة التأمين وتسجيل مرجعه وسببه',
    );
  // Serialize with both legacy insurer settlements and RCM receipts.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;
  const invoice = await lockFinancialInvoice(tx, hospitalId, invoiceId);
  const existing = await tx.insuranceClaimWithdrawal.findFirst({
    where: { hospitalId, invoiceId },
  });
  if (existing) {
    if (
      existing.payerReference !== payerReference ||
      existing.reason !== reason
    )
      throw new ConflictException('سبق توثيق سحب مختلف لهذه المطالبة');
    return existing;
  }
  const settlement = await readSettlementBalance(tx, hospitalId, invoiceId);
  if (
    invoice.type !== 'INVOICE' ||
    ['CANCELLED', 'DRAFT'].includes(invoice.status) ||
    (!settlement.hasHistory &&
      (!invoice.prepaidPrescription || !invoice.coveragePolicyId)) ||
    !invoice.insuranceProviderId ||
    !Money.isPositive(invoice.insuranceShare)
  )
    throw new BadRequestException(
      'السحب متاح لمطالبة حوالة موثقة أو فاتورة وصفة مؤمّنة ومثبتة على البوليصة',
    );
  if (
    !(await tx.user.findFirst({
      where: { id: userId, hospitalId, isActive: true, isDeleted: false },
      select: { id: true },
    }))
  )
    throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
  await tx.$queryRaw`SELECT id FROM "Claim" WHERE "hospitalId" = ${hospitalId} AND "invoiceId" = ${invoiceId} ORDER BY id FOR UPDATE`;
  const claims = await tx.claim.findMany({ where: { hospitalId, invoiceId } });
  const claim = claims[0];
  if (claims.length > 1 || claim?.batchId != null)
    throw new BadRequestException(
      'المطالبة مرتبطة بدفعة أو بسجلات متعددة وتحتاج تسوية منفصلة',
    );
  if (
    !settlement.net.isZero() ||
    (settlement.hasHistory && claims.length > 0) ||
    invoice.claimStatus === 'PAID' ||
    invoice.claimStatus === 'PARTIALLY_PAID' ||
    (claim &&
      (!Money.isZero(claim.paidAmount) ||
        !Money.isZero(claim.adjustmentAmount) ||
        !(await claimCollectionBalance(tx, hospitalId, claim.id)).net.isZero()))
  )
    throw new BadRequestException(
      'المطالبة تحتوي على تحصيل أو تسوية مالية وتحتاج مسار رد مستقل',
    );
  if (
    await tx.invoiceAdjustment.count({
      where: { hospitalId, invoiceId, insuranceOnly: true, status: 'PENDING' },
    })
  )
    throw new BadRequestException(
      'يلزم حسم طلب تصحيح حصة التأمين قبل توثيق السحب',
    );
  if (
    await tx.insuranceClaimWriteOff.count({
      where: { hospitalId, invoiceId, status: { in: ['PENDING', 'POSTED'] } },
    })
  )
    throw new BadRequestException(
      'توجد طلبات شطب قائمة أو معتمدة تمنع سحب المطالبة',
    );
  const [legacySettlement] = await tx.$queryRaw<{ id: number }[]>`
    SELECT e.id FROM "AccountingEntry" e
    WHERE e."hospitalId" = ${hospitalId}
      AND e."postingKey" LIKE ${`insurance-claim-settlement:${hospitalId}:%`}
      AND ${String(invoiceId)} = ANY(string_to_array(split_part(e."postingKey", ':', 3), ','))
      AND NOT EXISTS (SELECT 1 FROM "InsuranceSettlement" s WHERE s."postingEntryId" = e.id)
    LIMIT 1
  `;
  if (legacySettlement)
    throw new BadRequestException('يوجد قيد تحصيل تأميني سابق لهذه الفاتورة');
  if (
    claim
      ? !OUTSTANDING.includes(claim.status) ||
        !Money.eq(
          claim.claimedAmount,
          await initialTrackedInsuranceShare(tx, invoice),
        )
      : !['SUBMITTED', 'REJECTED'].includes(invoice.claimStatus ?? '')
  )
    throw new BadRequestException(
      'حالة المطالبة أو حصتها لا تسمح بتوثيق السحب',
    );

  const withdrawal = await tx.insuranceClaimWithdrawal.create({
    data: {
      hospitalId,
      invoiceId,
      claimId: claim?.id,
      recordedById: userId,
      payerReference,
      reason,
      previousInvoiceStatus: invoice.claimStatus,
      previousClaimStatus: claim?.status,
    },
  });
  if (claim) {
    await tx.claim.update({
      where: { id: claim.id },
      data: { status: 'VOID' },
    });
    await tx.claimHistory.create({
      data: {
        claimId: claim.id,
        fromStatus: claim.status,
        toStatus: 'VOID',
        changedById: userId,
        notes: `مطالبة مسحوبة وفق تأكيد شركة التأمين #${withdrawal.id}`,
      },
    });
  }
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { claimStatus: 'WITHDRAWN' },
  });
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    action: 'RECORD_INSURANCE_CLAIM_WITHDRAWAL',
    entity: 'InsuranceClaimWithdrawal',
    entityId: withdrawal.id,
    details: {
      invoiceId,
      claimId: claim?.id ?? null,
      payerReference,
      reason,
      fromSettlement: settlement.hasHistory,
    },
  });
  return withdrawal;
}
