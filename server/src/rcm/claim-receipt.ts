import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Money } from '../common/utils/money.util';
import {
  financialPeriod,
  lockFinancialInvoice,
} from '../accounting/financial-posting';
import { mappedAccount } from '../purchases/purchase-return-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { adjustmentBalance } from '../billing/invoice-snapshot';
import { originalInsuranceReceivable } from '../accounting/insurance-receivable';
import {
  initialTrackedInsuranceShare,
  trackedInsuranceShare,
} from '../insurance/insurance-settlement-balance';
import {
  assertClaimReceivableJournals,
  claimCollectionBalance,
} from './claim-collection-balance';
export type ClaimReceiptInput = {
  requestId: string;
  paidAmount: string;
  adjustmentAmount?: string;
  adjustmentReason?: string;
};
export async function collectClaim(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  userId: number,
  claimId: number,
  input: ClaimReceiptInput,
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestId ?? '',
    ) ||
    typeof input.paidAmount !== 'string' ||
    !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(input.paidAmount)
  )
    throw new BadRequestException('يلزم مبلغ نصي دقيق ومعرف UUID للتحصيل');
  const amount = Money.decimal(input.paidAmount);
  if (amount.lte(0))
    throw new BadRequestException('مبلغ التحصيل يجب أن يكون موجبًا');
  if (
    input.adjustmentAmount !== undefined &&
    !Money.eq(input.adjustmentAmount, 0)
  )
    throw new BadRequestException(
      'شطب المطالبة يحتاج مسار تسوية مستقل معتمد؛هذا المسار للتحصيل فقط',
    );
  const key = `claim-receipt:${hospitalId}:${input.requestId.toLowerCase()}`;
  const hash = createHash('sha256')
    .update(JSON.stringify({ claimId, userId, paidAmount: amount.toFixed(3) }))
    .digest('hex');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;
  if (
    !(await tx.user.findFirst({
      where: { id: userId, hospitalId, isActive: true, isDeleted: false },
    }))
  )
    throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
  const replay = await tx.claimReceipt.findUnique({
    where: { requestKey: key },
  });
  if (replay) {
    if (replay.requestFingerprint !== hash)
      throw new ConflictException('معرف التحصيل مستخدم لطلب مختلف');
    return tx.claim.findUniqueOrThrow({ where: { id: replay.claimId } });
  }
  const identity = await tx.claim.findFirst({
    where: { id: claimId, hospitalId },
  });
  if (!identity) throw new NotFoundException('المطالبة غير موجودة');
  const invoice = await lockFinancialInvoice(
    tx,
    hospitalId,
    identity.invoiceId,
  );
  await tx.$queryRaw`SELECT id FROM "Claim" WHERE id=${claimId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
  const claim = await tx.claim.findFirstOrThrow({
    where: { id: claimId, hospitalId },
  });
  if (
    claim.invoiceId !== invoice.id ||
    invoice.type !== 'INVOICE' ||
    invoice.status === 'CANCELLED' ||
    invoice.claimStatus === 'WITHDRAWN' ||
    invoice.claimStatus === 'PAID' ||
    !['SUBMITTED', 'ACCEPTED', 'PARTIALLY_PAID', 'APPEAL_ACCEPTED'].includes(
      claim.status,
    )
  )
    throw new BadRequestException('حالة المطالبة أو الفاتورة لا تسمح بالتحصيل');
  if (
    !Money.eq(
      claim.claimedAmount,
      await initialTrackedInsuranceShare(tx, invoice),
    ) ||
    !invoice.insuranceProviderId
  )
    throw new BadRequestException(
      'قيمة المطالبة أو شركة التأمين لا تطابق الفاتورة',
    );
  if (
    await tx.invoiceAdjustment.count({
      where: {
        hospitalId,
        invoiceId: invoice.id,
        insuranceOnly: true,
        status: 'PENDING',
      },
    })
  )
    throw new BadRequestException('يلزم حسم طلب تصحيح حصة التأمين قبل التحصيل');
  if (
    await tx.insuranceSettlementAllocation.count({
      where: { invoiceId: invoice.id, settlement: { hospitalId } },
    })
  )
    throw new BadRequestException('توجد حوالة جماعية مثبتة لهذه الفاتورة');
  await tx.$queryRaw`SELECT id FROM "InsuranceProvider" WHERE id=${invoice.insuranceProviderId} AND "hospitalId"=${hospitalId} FOR SHARE`;
  if (
    !(await tx.insuranceProvider.findFirst({
      where: { id: invoice.insuranceProviderId, hospitalId, isActive: true },
    }))
  )
    throw new BadRequestException('شركة التأمين غير نشطة ضمن المنشأة');
  const { net: paidBefore } = await claimCollectionBalance(
    tx,
    hospitalId,
    claimId,
  );
  if (
    !Money.eq(paidBefore, claim.paidAmount ?? 0) ||
    !Money.eq(claim.adjustmentAmount ?? 0, 0)
  )
    throw new ConflictException(
      'رصيد المطالبة لا يطابق دفتر تحصيلها؛تلزم المطابقة',
    );
  const paid = Money.sumDecimal(paidBefore, amount);
  const effectiveShare = await trackedInsuranceShare(tx, invoice);
  if (paid.gt(effectiveShare))
    throw new BadRequestException('مبلغ التحصيل يتجاوز متبقي المطالبة');
  const now = new Date();
  const { financialYear, period } = await financialPeriod(tx, hospitalId, now);
  const bank = await mappedAccount(tx, hospitalId, 'BANK_MAIN');
  const { receivable } = await originalInsuranceReceivable(tx, invoice);
  if (bank.type !== 'ASSET' || bank.id === receivable.accountId)
    throw new BadRequestException('يلزم حساب بنك مستقل عن ذمة التأمين');
  await assertClaimReceivableJournals(
    tx,
    hospitalId,
    claimId,
    receivable.accountId,
  );
  const receipt = await tx.claimReceipt.create({
    data: {
      hospitalId,
      claimId,
      createdById: userId,
      requestKey: key,
      requestFingerprint: hash,
      amount: Money.toDbString(amount),
      adjustmentAmount: '0.000',
      reason: input.adjustmentReason,
    },
  });
  const status = paid.eq(effectiveShare) ? 'PAID' : 'PARTIALLY_PAID';
  const updated = await tx.claim.update({
    where: { id: claim.id },
    data: {
      paidAmount: Money.toDbString(paid),
      adjustmentAmount: '0.000',
      status,
      paidAt: status === 'PAID' ? now : null,
    },
  });
  await tx.claimHistory.create({
    data: {
      claimId,
      fromStatus: claim.status,
      toStatus: status,
      changedById: userId,
      notes: `تحصيل مثبت #${receipt.id}: ${Money.toDbString(amount)}`,
    },
  });
  const adjusted = await adjustmentBalance(
    tx,
    hospitalId,
    invoice.id,
    invoice.patientShare,
    invoice.paidAmount,
  );
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      claimStatus: status,
      status:
        status === 'PAID' && adjusted.balance.lte(0)
          ? 'PAID'
          : 'PARTIALLY_PAID',
    },
  });
  await tx.accountingEntry.create({
    data: {
      hospitalId,
      postingKey: `claim-receipt:${hospitalId}:${receipt.id}`,
      sourceModule: 'CASHIER',
      sourceId: receipt.id,
      createdById: userId,
      entryDate: now,
      financialYearId: financialYear.id,
      financialPeriodId: period.id,
      description: `تحصيل مطالبة #${claimId}`,
      lines: {
        create: [
          {
            accountId: bank.id,
            debit: Money.toDbString(amount),
            credit: '0.000',
          },
          {
            accountId: receivable.accountId,
            debit: '0.000',
            credit: Money.toDbString(amount),
          },
        ],
      },
    },
  });
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    action: 'INSURANCE_CLAIM_PAYMENT_COLLECTED',
    entity: 'ClaimReceipt',
    entityId: receipt.id,
    details: {
      claimId,
      invoiceId: invoice.id,
      amount: Money.toDbString(amount),
      paidBefore: Money.toDbString(paidBefore),
      paidAfter: Money.toDbString(paid),
      requestKey: key,
    },
  });
  return updated;
}
