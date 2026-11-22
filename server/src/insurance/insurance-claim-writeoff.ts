import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SystemAccountKey } from '@prisma/client';
import {
  financialPeriod,
  lockFinancialInvoice,
} from '../accounting/financial-posting';
import { originalInsuranceReceivable } from '../accounting/insurance-receivable';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { adjustmentBalance } from '../billing/invoice-snapshot';
import { Money } from '../common/utils/money.util';
import { dispensedPrescriptionClaim } from '../pharmacy/prescription-prepayment';
import { mappedAccount } from '../purchases/purchase-return-posting';
import {
  MONEY_INPUT_PATTERN,
  readSettlementBalance,
  readWriteOffBalance,
  settledClaimStatus,
  settlementAllocationBalance,
  settlementNet,
  trackedInsuranceShare,
} from './insurance-settlement-balance';

export type WriteOffCategory = 'CONTRACTUAL_ALLOWANCE' | 'BAD_DEBT';

export type ClaimWriteOffInput = {
  requestId: string;
  category: WriteOffCategory;
  amount: string;
  reason: string;
};

export type ClaimWriteOffReview = {
  decision: 'POST' | 'REJECT';
  note: string;
};

type WriteOffContext = {
  hospitalId: number;
  invoiceId: number;
  userId: number;
};

function writeOffAccountKey(category: WriteOffCategory): {
  key: SystemAccountKey;
  expectedType: 'CONTRA_REVENUE' | 'EXPENSE';
} {
  if (category === 'CONTRACTUAL_ALLOWANCE') {
    return { key: 'REVENUE_WRITE_OFF', expectedType: 'CONTRA_REVENUE' };
  }
  return { key: 'INSURANCE_BAD_DEBT_EXPENSE', expectedType: 'EXPENSE' };
}

export async function listClaimWriteOffs(
  db: Pick<Prisma.TransactionClient, 'invoice'>,
  hospitalId: number,
  invoiceId: number,
) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, hospitalId },
    include: {
      insuranceProvider: { select: { id: true, name: true, code: true } },
      adjustments: {
        where: {
          status: 'POSTED',
          OR: [{ insuranceOnly: true }, { partialDispense: true }],
        },
        select: { insuranceDelta: true },
      },
      insuranceSettlementAllocations: { select: settlementAllocationBalance },
      insuranceClaimWriteOffs: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      },
    },
  });
  if (
    !invoice ||
    invoice.type !== 'INVOICE' ||
    !invoice.insuranceProviderId ||
    !Money.isPositive(invoice.insuranceShare)
  )
    throw new NotFoundException('فاتورة مطالبة التأمين غير موجودة');

  const effectiveShare = Money.sumDecimal(
    invoice.insuranceShare,
    ...invoice.adjustments.map((item) => item.insuranceDelta),
  );
  const settledNet = settlementNet(invoice.insuranceSettlementAllocations);
  const postedWriteOff = Money.sumDecimal(
    ...invoice.insuranceClaimWriteOffs
      .filter((item) => item.status === 'POSTED')
      .map((item) => item.amount),
  );
  const pendingWriteOff = Money.sumDecimal(
    ...invoice.insuranceClaimWriteOffs
      .filter((item) => item.status === 'PENDING')
      .map((item) => item.amount),
  );
  const available = effectiveShare
    .minus(settledNet)
    .minus(postedWriteOff)
    .minus(pendingWriteOff);

  return {
    invoiceId: invoice.id,
    provider: invoice.insuranceProvider,
    claimStatus: invoice.claimStatus,
    status: invoice.status,
    insuranceShare: Money.toDbString(invoice.insuranceShare),
    effectiveShare: Money.toDbString(effectiveShare),
    settledNet: Money.toDbString(settledNet),
    postedWriteOff: Money.toDbString(postedWriteOff),
    pendingWriteOff: Money.toDbString(pendingWriteOff),
    available: Money.toDbString(available.lt(0) ? 0 : available),
    writeOffs: invoice.insuranceClaimWriteOffs.map((item) => ({
      id: item.id,
      category: item.category as WriteOffCategory,
      amount: Money.toDbString(item.amount),
      outstandingBefore: Money.toDbString(item.outstandingBefore),
      reason: item.reason,
      status: item.status as 'PENDING' | 'POSTED' | 'REJECTED',
      requestedById: item.requestedById,
      reviewedById: item.reviewedById,
      reviewNote: item.reviewNote,
      postingEntryId: item.postingEntryId,
      createdAt: item.createdAt,
      reviewedAt: item.reviewedAt,
    })),
  };
}

export async function requestClaimWriteOff(
  tx: Prisma.TransactionClient,
  context: WriteOffContext,
  input: ClaimWriteOffInput,
) {
  const { hospitalId, invoiceId, userId } = context;
  const reason = input.reason.trim();
  if (
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      input.requestId,
    ) ||
    !['CONTRACTUAL_ALLOWANCE', 'BAD_DEBT'].includes(input.category) ||
    !MONEY_INPUT_PATTERN.test(input.amount) ||
    !Money.isPositive(input.amount) ||
    reason.length < 5 ||
    reason.length > 1000
  )
    throw new BadRequestException(
      'يلزم معرف طلب صالح وتصنيف ومبلغ دقيق موجب وسبب واضح للشطب',
    );

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;
  if (
    !(await tx.user.findFirst({
      where: { hospitalId, id: userId, isActive: true, isDeleted: false },
      select: { id: true },
    }))
  )
    throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');

  const invoice = await lockFinancialInvoice(tx, hospitalId, invoiceId);
  const requestKey = `claim-writeoff:${hospitalId}:${invoiceId}:${input.requestId.toLowerCase()}`;
  const previous = await tx.insuranceClaimWriteOff.findUnique({
    where: { requestKey },
  });
  if (previous) {
    if (
      previous.hospitalId !== hospitalId ||
      previous.invoiceId !== invoiceId ||
      previous.requestedById !== userId ||
      previous.category !== input.category ||
      !Money.eq(previous.amount, input.amount) ||
      previous.reason !== reason
    )
      throw new ConflictException('معرف الشطب مستخدم لطلب مختلف');
    return previous;
  }

  if (
    invoice.type !== 'INVOICE' ||
    !invoice.insuranceProviderId ||
    ['CANCELLED', 'DRAFT'].includes(invoice.status) ||
    !Money.isPositive(invoice.insuranceShare) ||
    !['SUBMITTED', 'PARTIALLY_PAID', 'REJECTED'].includes(
      invoice.claimStatus ?? '',
    )
  )
    throw new BadRequestException(
      'الشطب متاح فقط لفاتورة مطالبة تأمينية قائمة غير مسحوبة ولم تُسدد بالكامل',
    );

  if (
    !(await tx.invoice.count({
      where: { id: invoiceId, hospitalId, ...dispensedPrescriptionClaim },
    }))
  )
    throw new BadRequestException('يلزم استكمال صرف الوصفة قبل تسوية المطالبة');

  if (
    await tx.insuranceClaimWithdrawal.count({
      where: { hospitalId, invoiceId },
    })
  )
    throw new BadRequestException('لا يمكن شطب مطالبة تم توثيق سحبها');

  if (await tx.claim.count({ where: { hospitalId, invoiceId } }))
    throw new BadRequestException(
      'توجد مطالبات مسجلة في دورة الإيرادات؛ استكملها في المسار نفسه',
    );

  if (
    await tx.invoiceAdjustment.count({
      where: {
        hospitalId,
        invoiceId,
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
      'توجد تسويات معلقة أو تغيرات في ذمة التأمين تتطلب المطابقة قبل الشطب',
    );

  const settlement = await readSettlementBalance(tx, hospitalId, invoiceId);
  const writtenOff = await readWriteOffBalance(tx, hospitalId, invoiceId);
  const share = await trackedInsuranceShare(tx, invoice);
  const completed = settlement.net.plus(writtenOff.posted);
  const outstandingBefore = share.minus(completed);
  const available = outstandingBefore.minus(writtenOff.pending);

  const expectedStatus = completed.gt(0)
    ? settledClaimStatus(completed, share)
    : null;
  if (
    settlement.net.lt(0) ||
    writtenOff.posted.lt(0) ||
    !available.gt(0) ||
    (expectedStatus
      ? invoice.claimStatus !== expectedStatus
      : !['SUBMITTED', 'REJECTED'].includes(invoice.claimStatus ?? ''))
  )
    throw new BadRequestException(
      'رصيد التأمين وحالة المطالبة يحتاجان إلى مطابقة',
    );

  if (Money.gt(input.amount, available))
    throw new BadRequestException('مبلغ الشطب يتجاوز الرصيد التأميني المتاح');

  const { receivable } = await originalInsuranceReceivable(tx, invoice);
  if (
    !Money.eq(receivable.debit, invoice.insuranceShare) ||
    !Money.isZero(receivable.credit) ||
    receivable.account.hospitalId !== hospitalId ||
    receivable.account.type !== 'ASSET'
  )
    throw new BadRequestException('قيد ذمة التأمين الأصلي يحتاج إلى مطابقة');

  const otherAllocation = await tx.insuranceSettlementAllocation.findFirst({
    where: {
      invoiceId,
      originalReceivableId: { not: receivable.id },
    },
    select: { id: true },
  });
  if (otherAllocation)
    throw new BadRequestException('قيد ذمة التأمين المرتبط يحتاج إلى مطابقة');

  const amountStr = Money.toDbString(input.amount);
  const outstandingStr = Money.toDbString(outstandingBefore);
  const created = await tx.insuranceClaimWriteOff.create({
    data: {
      hospitalId,
      invoiceId,
      originalReceivableId: receivable.id,
      requestKey,
      category: input.category,
      amount: amountStr,
      outstandingBefore: outstandingStr,
      reason,
      requestedById: userId,
    },
  });

  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    entity: 'InsuranceClaimWriteOff',
    entityId: created.id,
    action: 'REQUEST_INSURANCE_CLAIM_WRITEOFF',
    details: {
      invoiceId,
      category: input.category,
      amount: amountStr,
      outstandingBefore: outstandingStr,
      reason,
    },
  });

  return created;
}

export async function reviewClaimWriteOff(
  tx: Prisma.TransactionClient,
  context: WriteOffContext,
  writeOffId: number,
  input: ClaimWriteOffReview,
) {
  const { hospitalId, invoiceId, userId } = context;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;
  if (
    !(await tx.user.findFirst({
      where: { hospitalId, id: userId, isActive: true, isDeleted: false },
      select: { id: true },
    }))
  )
    throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');

  const invoice = await lockFinancialInvoice(tx, hospitalId, invoiceId);
  const writeOff = await tx.insuranceClaimWriteOff.findFirst({
    where: { id: writeOffId, hospitalId, invoiceId },
    include: { originalReceivable: { include: { account: true } } },
  });
  if (!writeOff) throw new NotFoundException('طلب الشطب التأميني غير موجود');

  if (writeOff.requestedById === userId)
    throw new ForbiddenException(
      'اعتماد أو رفض الشطب يتطلب موظفًا مختلفًا عن مقدم الطلب',
    );

  const note = input.note.trim();
  const post = input.decision === 'POST';
  if (
    !['POST', 'REJECT'].includes(input.decision) ||
    note.length < 5 ||
    note.length > 1000
  )
    throw new BadRequestException(
      'يلزم قرار صحيح وملاحظة مراجعة لا تقل عن 5 أحرف',
    );

  const status = post ? 'POSTED' : 'REJECTED';
  if (writeOff.status !== 'PENDING') {
    if (
      writeOff.status === status &&
      writeOff.reviewedById === userId &&
      writeOff.reviewNote === note
    )
      return writeOff;
    throw new ConflictException('حُسم طلب الشطب بالفعل');
  }

  const reviewedAt = new Date();
  let writeOffAccountId: number | undefined;
  let postingEntryId: number | undefined;

  if (post) {
    if (
      invoice.type !== 'INVOICE' ||
      !invoice.insuranceProviderId ||
      ['CANCELLED', 'DRAFT'].includes(invoice.status) ||
      (await tx.insuranceClaimWithdrawal.count({
        where: { hospitalId, invoiceId },
      })) > 0 ||
      (await tx.claim.count({ where: { hospitalId, invoiceId } })) > 0 ||
      (await tx.invoiceAdjustment.count({
        where: {
          hospitalId,
          invoiceId,
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
      })) > 0
    )
      throw new BadRequestException(
        'حالة الفاتورة أو تسوياتها تحتاج إلى مطابقة قبل اعتماد الشطب',
      );

    const settlement = await readSettlementBalance(tx, hospitalId, invoiceId);
    const writtenOff = await readWriteOffBalance(tx, hospitalId, invoiceId);
    const share = await trackedInsuranceShare(tx, invoice);
    const completedBefore = settlement.net.plus(writtenOff.posted);
    const remainingBeforePost = share.minus(completedBefore);
    const expectedBefore = completedBefore.gt(0)
      ? settledClaimStatus(completedBefore, share)
      : null;

    if (
      remainingBeforePost.lt(writeOff.amount) ||
      (expectedBefore
        ? invoice.claimStatus !== expectedBefore
        : !['SUBMITTED', 'REJECTED'].includes(invoice.claimStatus ?? ''))
    )
      throw new BadRequestException(
        'الرصيد التأميني المتبقي لا يكفي لاعتماد الشطب',
      );

    const receivable = writeOff.originalReceivable;
    if (
      !Money.eq(receivable.debit, invoice.insuranceShare) ||
      !Money.isZero(receivable.credit) ||
      receivable.account.hospitalId !== hospitalId ||
      receivable.account.type !== 'ASSET' ||
      !receivable.account.isActive
    )
      throw new BadRequestException('قيد ذمة التأمين الأصلي يحتاج إلى مطابقة');

    const category = writeOff.category as WriteOffCategory;
    const { key, expectedType } = writeOffAccountKey(category);
    const writeOffAccount = await mappedAccount(tx, hospitalId, key);
    if (
      writeOffAccount.type !== expectedType ||
      writeOffAccount.id === receivable.accountId
    )
      throw new BadRequestException(
        'حساب الشطب المعتمد يجب أن يطابق التصنيف ويختلف عن حساب الذمة',
      );

    const { financialYear, period } = await financialPeriod(
      tx,
      hospitalId,
      reviewedAt,
    );
    const amountStr = Money.toDbString(writeOff.amount);
    const entry = await tx.accountingEntry.create({
      data: {
        hospitalId,
        postingKey: `insurance-claim-writeoff:${hospitalId}:${writeOff.id}`,
        sourceModule: 'CASHIER',
        sourceId: writeOff.id,
        description:
          category === 'CONTRACTUAL_ALLOWANCE'
            ? `شطب تعاقدي معتمد لمطالبة فاتورة #${invoiceId}`
            : `شطب دين معدوم معتمد لمطالبة فاتورة #${invoiceId}`,
        entryDate: reviewedAt,
        createdById: userId,
        financialYearId: financialYear.id,
        financialPeriodId: period.id,
        lines: {
          create: [
            {
              accountId: writeOffAccount.id,
              debit: amountStr,
              credit: '0.000',
            },
            {
              accountId: receivable.accountId,
              debit: '0.000',
              credit: amountStr,
            },
          ],
        },
      },
    });
    writeOffAccountId = writeOffAccount.id;
    postingEntryId = entry.id;

    const updated = await tx.insuranceClaimWriteOff.update({
      where: { id: writeOff.id },
      data: {
        status: 'POSTED',
        reviewedById: userId,
        reviewedAt,
        reviewNote: note,
        writeOffAccountId,
        postingEntryId,
      },
    });

    const completedAfter = completedBefore.plus(writeOff.amount);
    const nextClaimStatus = settledClaimStatus(completedAfter, share);
    const patient = await adjustmentBalance(
      tx,
      hospitalId,
      invoice.id,
      invoice.patientShare,
      invoice.paidAmount,
    );
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        claimStatus: nextClaimStatus,
        status:
          nextClaimStatus === 'PAID' && patient.balance.lte(0)
            ? 'PAID'
            : 'PARTIALLY_PAID',
      },
    });

    await appendChainedAuditInTransaction(tx, {
      hospitalId,
      userId,
      entity: 'InsuranceClaimWriteOff',
      entityId: writeOff.id,
      action: 'POST_INSURANCE_CLAIM_WRITEOFF',
      details: {
        invoiceId,
        category,
        amount: amountStr,
        writeOffAccountId,
        postingEntryId,
        note,
        claimStatus: nextClaimStatus,
      },
    });

    return updated;
  }

  const rejected = await tx.insuranceClaimWriteOff.update({
    where: { id: writeOff.id },
    data: {
      status: 'REJECTED',
      reviewedById: userId,
      reviewedAt,
      reviewNote: note,
    },
  });

  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    entity: 'InsuranceClaimWriteOff',
    entityId: writeOff.id,
    action: 'REJECT_INSURANCE_CLAIM_WRITEOFF',
    details: {
      invoiceId,
      category: writeOff.category,
      amount: Money.toDbString(writeOff.amount),
      note,
    },
  });

  return rejected;
}
