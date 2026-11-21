import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  financialPeriod,
  lockFinancialInvoice,
} from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import { ensureUnusedRefundBankReference } from '../insurance/refund-bank-reference';
import {
  initialTrackedInsuranceShare,
  trackedInsuranceShare,
} from '../insurance/insurance-settlement-balance';
import { claimCollectionBalance } from './claim-collection-balance';

export type RefundRequest = {
  receiptId: number;
  requestId: string;
  amount: string;
  reason: string;
};
export type RefundReview = {
  decision: 'POST' | 'REJECT';
  note: string;
  bankReference?: string;
  confirmed?: boolean;
};
type Context = { hospitalId: number; invoiceId: number; userId: number };

async function lockRefundContext(
  tx: Prisma.TransactionClient,
  { hospitalId, invoiceId, userId }: Context,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;
  const invoice = await lockFinancialInvoice(tx, hospitalId, invoiceId);
  if (invoice.type !== 'INVOICE' || !invoice.insuranceProviderId)
    throw new BadRequestException('الفاتورة لا تسمح بردّ تحصيل التأمين');
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
  if (
    claims.length !== 1 ||
    claim.batchId != null ||
    !Money.eq(
      claim.claimedAmount,
      await initialTrackedInsuranceShare(tx, invoice),
    ) ||
    !Money.isZero(claim.adjustmentAmount)
  )
    throw new BadRequestException('يلزم أصل مطالبة فردية متطابقة مع الفاتورة');
  return { invoice, claim };
}

async function ensureRefundable(
  tx: Prisma.TransactionClient,
  { invoice, claim }: Awaited<ReturnType<typeof lockRefundContext>>,
) {
  if (
    ['DRAFT', 'CANCELLED'].includes(invoice.status) ||
    !['PAID', 'PARTIALLY_PAID'].includes(invoice.claimStatus ?? '') ||
    !['PAID', 'PARTIALLY_PAID'].includes(claim.status)
  )
    throw new BadRequestException('حالة المطالبة لا تسمح بردّ التحصيل');
  if (
    await tx.invoiceAdjustment.count({
      where: {
        hospitalId: invoice.hospitalId,
        invoiceId: invoice.id,
        insuranceOnly: true,
        status: 'PENDING',
      },
    })
  )
    throw new BadRequestException('يلزم حسم طلب تصحيح حصة التأمين قبل الرد');
}

export async function listClaimReceiptRefunds(
  db: Pick<Prisma.TransactionClient, 'claim' | 'claimReceipt'>,
  hospitalId: number,
  invoiceId: number,
) {
  const claims = await db.claim.findMany({
    where: { hospitalId, invoiceId, invoice: { hospitalId } },
    select: { id: true, batchId: true, status: true },
    take: 2,
  });
  if (claims.length !== 1 || claims[0].batchId != null)
    throw new NotFoundException('المطالبة الفردية غير موجودة');
  const claim = claims[0];
  const receipts = await db.claimReceipt.findMany({
    where: { hospitalId, claimId: claim.id },
    select: {
      id: true,
      amount: true,
      createdAt: true,
      refunds: { where: { hospitalId }, orderBy: { id: 'desc' } },
    },
    orderBy: { id: 'desc' },
  });
  const refunds = receipts.flatMap((receipt) => receipt.refunds);
  const gross = Money.sumDecimal(...receipts.map((receipt) => receipt.amount));
  const refunded = Money.sumDecimal(
    ...refunds
      .filter((refund) => refund.status === 'POSTED')
      .map((refund) => refund.amount),
  );
  return {
    grossAmount: Money.toDbString(gross),
    refundedAmount: Money.toDbString(refunded),
    netAmount: Money.toDbString(gross.minus(refunded)),
    receipts: receipts.map(({ id, amount, createdAt, refunds }) => ({
      id,
      createdAt,
      amount: Money.toDbString(amount),
      availableAmount: Money.toDbString(
        amount.minus(
          Money.sumDecimal(
            ...refunds
              .filter((refund) => refund.status !== 'REJECTED')
              .map((refund) => refund.amount),
          ),
        ),
      ),
    })),
    refunds,
  };
}

async function originalReceiptJournal(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  receiptId: number,
  claimId: number,
) {
  const receipt = await tx.claimReceipt.findFirst({
    where: { id: receiptId, hospitalId, claimId },
  });
  if (!receipt) throw new NotFoundException('إيصال تحصيل المطالبة غير موجود');
  const posting = await tx.accountingEntry.findFirst({
    where: {
      hospitalId,
      postingKey: `claim-receipt:${hospitalId}:${receipt.id}`,
    },
    include: { lines: { include: { account: true } } },
  });
  const bank = posting?.lines.find(({ debit }) => Money.isPositive(debit));
  const receivable = posting?.lines.find(({ credit }) =>
    Money.isPositive(credit),
  );
  if (
    !posting ||
    posting.lines.length !== 2 ||
    !bank ||
    !receivable ||
    bank.accountId === receivable.accountId ||
    !Money.eq(bank.debit, receipt.amount) ||
    !Money.isZero(bank.credit) ||
    !Money.eq(receivable.credit, receipt.amount) ||
    !Money.isZero(receivable.debit) ||
    [bank, receivable].some(
      ({ account }) =>
        !account.isActive ||
        account.hospitalId !== hospitalId ||
        account.type !== 'ASSET',
    ) ||
    (await tx.accountingEntry.count({
      where: {
        hospitalId,
        sourceModule: 'JOURNAL_REVERSAL',
        sourceId: posting.id,
      },
    }))
  )
    throw new BadRequestException(
      'قيد الإيصال الأصلي يحتاج إلى مطابقة قبل الرد',
    );
  return {
    receipt,
    bankId: bank.accountId,
    receivableId: receivable.accountId,
  };
}

export async function requestClaimReceiptRefund(
  tx: Prisma.TransactionClient,
  context: Context,
  input: RefundRequest,
) {
  const { hospitalId, invoiceId, userId } = context;
  const locked = await lockRefundContext(tx, context);
  const { claim } = locked;
  const reason = input.reason.trim();
  if (
    !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(input.amount) ||
    !Money.isPositive(input.amount) ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      input.requestId,
    ) ||
    reason.length < 5 ||
    reason.length > 1000
  )
    throw new BadRequestException('مبلغ الرد أو سببه أو معرفه غير صالح');
  const requestKey = `claim-refund:${hospitalId}:${invoiceId}:${input.requestId.toLowerCase()}`;
  const previous = await tx.claimReceiptRefund.findUnique({
    where: { requestKey },
  });
  if (previous) {
    if (
      previous.requestedById !== userId ||
      previous.receiptId !== input.receiptId ||
      previous.reason !== reason ||
      !Money.eq(previous.amount, input.amount)
    )
      throw new ConflictException('معرف الرد مستخدم لطلب مختلف');
    return previous;
  }
  await ensureRefundable(tx, locked);
  const { receipt } = await originalReceiptJournal(
    tx,
    hospitalId,
    input.receiptId,
    claim.id,
  );
  const { net } = await claimCollectionBalance(tx, hospitalId, claim.id);
  const reserved = await tx.claimReceiptRefund.aggregate({
    where: {
      hospitalId,
      receiptId: receipt.id,
      status: { in: ['PENDING', 'POSTED'] },
    },
    _sum: { amount: true },
  });
  if (
    !Money.eq(net, claim.paidAmount) ||
    Money.gt(input.amount, net) ||
    Money.gt(
      input.amount,
      Money.subtractDecimal(receipt.amount, reserved._sum.amount),
    )
  )
    throw new BadRequestException(
      'مبلغ الرد يتجاوز رصيد الإيصال أو توجد حاجة إلى المطابقة',
    );
  const refund = await tx.claimReceiptRefund.create({
    data: {
      hospitalId,
      receiptId: receipt.id,
      requestKey,
      amount: Money.toDbString(input.amount),
      reason,
      requestedById: userId,
    },
  });
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    entity: 'ClaimReceiptRefund',
    entityId: refund.id,
    action: 'REQUEST_CLAIM_RECEIPT_REFUND',
    details: { invoiceId, receiptId: receipt.id, amount: input.amount, reason },
  });
  return refund;
}

export async function reviewClaimReceiptRefund(
  tx: Prisma.TransactionClient,
  context: Context,
  refundId: number,
  input: RefundReview,
) {
  const { hospitalId, invoiceId, userId } = context;
  const locked = await lockRefundContext(tx, context);
  const { claim } = locked;
  const refund = await tx.claimReceiptRefund.findFirst({
    where: {
      id: refundId,
      hospitalId,
      receipt: { hospitalId, claimId: claim.id },
    },
  });
  if (!refund) throw new NotFoundException('طلب رد تحصيل التأمين غير موجود');
  if (refund.requestedById === userId)
    throw new ForbiddenException('مراجعة الرد تتطلب موظفًا آخر');
  const note = input.note.trim();
  const post = input.decision === 'POST';
  const reference = post ? (input.bankReference?.trim() ?? '') : null;
  if (
    !['POST', 'REJECT'].includes(input.decision) ||
    note.length < 5 ||
    note.length > 1000 ||
    (post &&
      (input.confirmed !== true ||
        reference!.length < 5 ||
        reference!.length > 200))
  )
    throw new BadRequestException(
      'يلزم سبب المراجعة وإثبات التحويل البنكي عند الاعتماد',
    );
  const status = post ? 'POSTED' : 'REJECTED';
  if (refund.status !== 'PENDING') {
    if (
      refund.status === status &&
      refund.reviewedById === userId &&
      refund.reviewNote === note &&
      refund.bankReference === reference
    )
      return refund;
    throw new ConflictException('حُسم طلب الرد بالفعل');
  }
  const reviewedAt = new Date();
  let postingEntryId: number | undefined;
  let nextNet: Prisma.Decimal | undefined;
  if (post) {
    await ensureRefundable(tx, locked);
    await ensureUnusedRefundBankReference(tx, hospitalId, reference!);
    const { net } = await claimCollectionBalance(tx, hospitalId, claim.id);
    if (
      !Money.eq(net, claim.paidAmount) ||
      net.lt(refund.amount) ||
      net.gt(await trackedInsuranceShare(tx, locked.invoice))
    )
      throw new BadRequestException(
        'رصيد المطالبة لا يطابق المدفوعات أو لا يكفي للرد',
      );
    nextNet = net.minus(refund.amount);
    const { bankId, receivableId } = await originalReceiptJournal(
      tx,
      hospitalId,
      refund.receiptId,
      claim.id,
    );
    const { financialYear, period } = await financialPeriod(
      tx,
      hospitalId,
      reviewedAt,
    );
    const entry = await tx.accountingEntry.create({
      data: {
        hospitalId,
        postingKey: `claim-refund:${hospitalId}:${refund.id}`,
        sourceModule: 'CASHIER',
        sourceId: refund.id,
        entryDate: reviewedAt,
        financialYearId: financialYear.id,
        financialPeriodId: period.id,
        createdById: userId,
        description: `ردّ تحصيل مطالبة #${claim.id} — إيصال #${refund.receiptId}`,
        lines: {
          create: [
            { accountId: receivableId, debit: refund.amount, credit: '0.000' },
            { accountId: bankId, debit: '0.000', credit: refund.amount },
          ],
        },
      },
    });
    postingEntryId = entry.id;
  }
  const result = await tx.claimReceiptRefund.update({
    where: { id: refund.id },
    data: {
      status,
      reviewedById: userId,
      reviewedAt,
      reviewNote: note,
      bankReference: reference,
      postingEntryId,
    },
  });
  if (nextNet !== undefined) {
    const claimStatus = nextNet.isZero() ? 'SUBMITTED' : 'PARTIALLY_PAID';
    await tx.claim.update({
      where: { id: claim.id },
      data: {
        paidAmount: Money.toDbString(nextNet),
        status: claimStatus,
        paidAt: null,
      },
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { claimStatus, status: 'PARTIALLY_PAID' },
    });
    await tx.claimHistory.create({
      data: {
        claimId: claim.id,
        fromStatus: claim.status,
        toStatus: claimStatus,
        changedById: userId,
        notes: `ردّ تحصيل مثبت #${refund.id}`,
      },
    });
  }
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    entity: 'ClaimReceiptRefund',
    entityId: refund.id,
    action: post ? 'POST_CLAIM_RECEIPT_REFUND' : 'REJECT_CLAIM_RECEIPT_REFUND',
    details: {
      invoiceId,
      postingEntryId,
      receiptId: refund.receiptId,
      reference,
      note,
      amount: Money.toDbString(refund.amount),
    },
  });
  return result;
}
