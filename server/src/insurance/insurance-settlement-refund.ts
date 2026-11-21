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
import { ensureUnusedRefundBankReference } from './refund-bank-reference';
import {
  readSettlementBalance,
  settledClaimStatus,
  trackedInsuranceShare,
} from './insurance-settlement-balance';

export type SettlementRefundInput = {
  requestId: string;
  reason: string;
  lines: { allocationId: number; amount: string }[];
};
export type SettlementRefundReview = {
  decision: 'POST' | 'REJECT';
  note: string;
  bankReference?: string;
  confirmed?: boolean;
};
type RefundContext = {
  hospitalId: number;
  settlementId: number;
  userId: number;
};

const settlementLedger = {
  allocations: {
    orderBy: { id: 'asc' },
    include: { refunds: { include: { refund: { select: { status: true } } } } },
  },
  refunds: {
    orderBy: { id: 'desc' },
    include: { lines: { orderBy: { allocationId: 'asc' } } },
  },
} satisfies Prisma.InsuranceSettlementInclude;

async function readSettlement(
  db: Pick<Prisma.TransactionClient, 'insuranceSettlement'>,
  hospitalId: number,
  settlementId: number,
) {
  const settlement = await db.insuranceSettlement.findFirst({
    where: { id: settlementId, hospitalId },
    include: settlementLedger,
  });
  if (!settlement)
    throw new NotFoundException('تسوية حوالة التأمين غير موجودة');
  return settlement;
}

function amounts(
  allocation: Awaited<ReturnType<typeof readSettlement>>['allocations'][number],
) {
  const posted = Money.sumDecimal(
    ...allocation.refunds
      .filter((line) => line.refund.status === 'POSTED')
      .map((line) => line.amount),
  );
  const reserved = Money.sumDecimal(
    ...allocation.refunds
      .filter((line) => line.refund.status === 'PENDING')
      .map((line) => line.amount),
  );
  return { posted, available: allocation.amount.minus(posted).minus(reserved) };
}

export async function listSettlementRefunds(
  db: Pick<Prisma.TransactionClient, 'insuranceSettlement'>,
  hospitalId: number,
  settlementId: number,
) {
  const settlement = await readSettlement(db, hospitalId, settlementId);
  return {
    id: settlement.id,
    bankReference: settlement.bankReference,
    amount: Money.toDbString(settlement.amount),
    allocations: settlement.allocations.map((allocation) => {
      const { available, posted } = amounts(allocation);
      return {
        id: allocation.id,
        invoiceId: allocation.invoiceId,
        amount: Money.toDbString(allocation.amount),
        outstandingBefore: Money.toDbString(allocation.outstandingBefore),
        remainingAfterReceipt: Money.toDbString(
          allocation.outstandingBefore.minus(allocation.amount),
        ),
        available: Money.toDbString(available),
        refunded: Money.toDbString(posted),
      };
    }),
    refunds: settlement.refunds,
  };
}

async function lockSettlement(
  tx: Prisma.TransactionClient,
  { hospitalId, settlementId, userId }: RefundContext,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;
  if (
    !(await tx.user.findFirst({
      where: { hospitalId, id: userId, isActive: true, isDeleted: false },
      select: { id: true },
    }))
  )
    throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
  await tx.$queryRaw`SELECT id FROM "InsuranceSettlement" WHERE id = ${settlementId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
  return readSettlement(tx, hospitalId, settlementId);
}

export async function requestSettlementRefund(
  tx: Prisma.TransactionClient,
  context: RefundContext,
  input: SettlementRefundInput,
) {
  const { hospitalId, settlementId, userId } = context;
  const reason = input.reason.trim();
  const lines = [...input.lines].sort(
    (a, b) => a.allocationId - b.allocationId,
  );
  if (
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      input.requestId,
    ) ||
    reason.length < 5 ||
    reason.length > 1000 ||
    !lines.length ||
    lines.length > 100 ||
    new Set(lines.map((line) => line.allocationId)).size !== lines.length ||
    lines.some(
      (line) =>
        !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(line.amount) ||
        !Money.isPositive(line.amount),
    )
  )
    throw new BadRequestException(
      'يلزم سبب الرد وتخصيص واحد على الأقل بمبلغ دقيق موجب',
    );
  const settlement = await lockSettlement(tx, context);
  const requestKey = `settlement-refund:${hospitalId}:${settlementId}:${input.requestId.toLowerCase()}`;
  const previous = settlement.refunds.find(
    (refund) => refund.requestKey === requestKey,
  );
  if (previous) {
    if (
      previous.requestedById !== userId ||
      previous.reason !== reason ||
      previous.lines.length !== lines.length ||
      previous.lines.some(
        (line, index) =>
          line.allocationId !== lines[index].allocationId ||
          !Money.eq(line.amount, lines[index].amount),
      )
    )
      throw new ConflictException('معرف الرد مستخدم لطلب مختلف');
    return previous;
  }
  const allocations = new Map(
    settlement.allocations.map((allocation) => [allocation.id, allocation]),
  );
  for (const line of lines) {
    const allocation = allocations.get(line.allocationId);
    if (!allocation || Money.gt(line.amount, amounts(allocation).available))
      throw new BadRequestException(
        'مبلغ الرد يتجاوز الرصيد المتاح في تخصيص الفاتورة',
      );
  }
  const amount = Money.toDbString(
    Money.sumDecimal(...lines.map((line) => line.amount)),
  );
  const result = await tx.insuranceSettlementRefund.create({
    data: {
      hospitalId,
      settlementId,
      requestKey,
      reason,
      requestedById: userId,
      amount,
      lines: {
        create: lines.map((line) => ({
          ...line,
          amount: Money.toDbString(line.amount),
        })),
      },
    },
    include: { lines: { orderBy: { allocationId: 'asc' } } },
  });
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    entity: 'InsuranceSettlementRefund',
    entityId: result.id,
    action: 'REQUEST_INSURANCE_SETTLEMENT_REFUND',
    details: { settlementId, amount, lines },
  });
  return result;
}

export async function reviewSettlementRefund(
  tx: Prisma.TransactionClient,
  context: RefundContext,
  refundId: number,
  input: SettlementRefundReview,
) {
  const { hospitalId, settlementId, userId } = context;
  const settlement = await lockSettlement(tx, context);
  const refund = settlement.refunds.find((item) => item.id === refundId);
  if (!refund) throw new NotFoundException('طلب رد الحوالة غير موجود');
  if (refund.requestedById === userId)
    throw new ForbiddenException('المراجعة تتطلب موظفًا آخر');
  const note = input.note.trim();
  const post = input.decision === 'POST';
  const reference = post
    ? (input.bankReference?.trim().toUpperCase() ?? '')
    : null;
  if (
    !['POST', 'REJECT'].includes(input.decision) ||
    note.length < 5 ||
    note.length > 1000 ||
    (reference !== null &&
      (input.confirmed !== true ||
        reference.length < 5 ||
        reference.length > 200))
  )
    throw new BadRequestException(
      'يلزم توثيق المراجعة والتحقق من التحويل البنكي عند الاعتماد',
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
  const invoiceUpdates: { id: number; claimStatus: string }[] = [];
  if (reference !== null) {
    await ensureUnusedRefundBankReference(tx, hospitalId, reference);
    const original = await tx.accountingEntry.findFirst({
      where: { hospitalId, id: settlement.postingEntryId },
      include: { lines: { include: { account: true } } },
    });
    const bank = original?.lines.filter((line) => Money.isPositive(line.debit));
    if (
      !bank ||
      bank.length !== 1 ||
      !Money.eq(bank[0].debit, settlement.amount) ||
      !Money.isZero(bank[0].credit) ||
      bank[0].account.hospitalId !== hospitalId ||
      bank[0].account.type !== 'ASSET' ||
      !bank[0].account.isActive
    )
      throw new BadRequestException(
        'قيد حوالة التأمين الأصلي يحتاج إلى مطابقة',
      );
    const credits = new Map<number, Prisma.Decimal>();
    const debits = new Map<number, Prisma.Decimal>();
    const allocations = await tx.insuranceSettlementAllocation.findMany({
      where: { settlementId },
      include: {
        originalReceivable: { include: { account: true } },
        invoice: {
          select: { patientId: true, encounterId: true, insuranceShare: true },
        },
      },
    });
    const byAllocation = new Map(allocations.map((item) => [item.id, item]));
    const ledger = new Map(
      settlement.allocations.map((item) => [item.id, item]),
    );
    for (const allocation of allocations) {
      const line = allocation.originalReceivable;
      if (
        !Money.eq(line.debit, allocation.invoice.insuranceShare) ||
        !Money.isZero(line.credit) ||
        line.account.hospitalId !== hospitalId ||
        line.account.type !== 'ASSET' ||
        line.accountId === bank[0].accountId
      )
        throw new BadRequestException(
          'قيد ذمة التأمين الأصلي يحتاج إلى مطابقة',
        );
      credits.set(
        line.accountId,
        Money.sumDecimal(credits.get(line.accountId), allocation.amount),
      );
    }
    const originalCredits = original!.lines.filter(
      (line) => line.id !== bank[0].id,
    );
    if (
      originalCredits.length !== credits.size ||
      new Set(originalCredits.map((line) => line.accountId)).size !==
        credits.size ||
      originalCredits.some(
        (line) =>
          !credits.has(line.accountId) ||
          !Money.eq(credits.get(line.accountId), line.credit) ||
          !Money.isZero(line.debit),
      )
    )
      throw new BadRequestException(
        'حسابات قيد الحوالة لا تطابق الذمم المخصصة',
      );
    const affected = refund.lines
      .map((line) => ({
        line,
        allocation: byAllocation.get(line.allocationId)!,
      }))
      .sort(
        (a, b) =>
          a.allocation.invoice.patientId - b.allocation.invoice.patientId ||
          a.allocation.invoice.encounterId - b.allocation.invoice.encounterId ||
          a.allocation.invoiceId - b.allocation.invoiceId,
      );
    for (const { line, allocation } of affected) {
      const invoice = await lockFinancialInvoice(
        tx,
        hospitalId,
        allocation.invoiceId,
      );
      const { posted } = amounts(ledger.get(allocation.id)!);
      const { net } = await readSettlementBalance(tx, hospitalId, invoice.id);
      const share = await trackedInsuranceShare(tx, invoice);
      const next = net.minus(line.amount);
      const receivable = allocation.originalReceivable;
      if (
        invoice.type !== 'INVOICE' ||
        invoice.status === 'CANCELLED' ||
        invoice.insuranceProviderId !== settlement.providerId ||
        !Money.eq(invoice.insuranceShare, receivable.debit) ||
        posted.plus(line.amount).gt(allocation.amount) ||
        next.lt(0) ||
        net.gt(share) ||
        invoice.claimStatus === 'WITHDRAWN' ||
        invoice.claimStatus !== settledClaimStatus(net, share) ||
        !receivable.account.isActive ||
        (await tx.invoiceAdjustment.count({
          where: { hospitalId, invoiceId: invoice.id, status: 'PENDING' },
        }))
      )
        throw new BadRequestException(
          'حالة الفاتورة أو قيدها يحتاج إلى مطابقة قبل الرد',
        );
      debits.set(
        receivable.accountId,
        Money.sumDecimal(debits.get(receivable.accountId), line.amount),
      );
      invoiceUpdates.push({
        id: invoice.id,
        claimStatus: settledClaimStatus(next, share),
      });
    }
    const { financialYear, period } = await financialPeriod(
      tx,
      hospitalId,
      reviewedAt,
    );
    const entry = await tx.accountingEntry.create({
      data: {
        hospitalId,
        postingKey: `insurance-settlement-refund:${hospitalId}:${refund.id}`,
        sourceModule: 'CASHIER',
        sourceId: refund.id,
        description: `رد حوالة تأمين لتسوية #${settlementId}`,
        entryDate: reviewedAt,
        createdById: userId,
        financialYearId: financialYear.id,
        financialPeriodId: period.id,
        lines: {
          create: [
            ...[...debits].map(([accountId, debit]) => ({
              accountId,
              debit: Money.toDbString(debit),
              credit: '0.000',
            })),
            {
              accountId: bank[0].accountId,
              debit: '0.000',
              credit: refund.amount,
            },
          ],
        },
      },
    });
    postingEntryId = entry.id;
  }
  const result = await tx.insuranceSettlementRefund.update({
    where: { id: refund.id },
    data: {
      status,
      reviewedById: userId,
      reviewedAt,
      reviewNote: note,
      bankReference: reference,
      postingEntryId,
    },
    include: { lines: { orderBy: { allocationId: 'asc' } } },
  });
  for (const invoice of invoiceUpdates) {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { claimStatus: invoice.claimStatus, status: 'PARTIALLY_PAID' },
    });
  }
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    entity: 'InsuranceSettlementRefund',
    entityId: refund.id,
    action: post
      ? 'POST_INSURANCE_SETTLEMENT_REFUND'
      : 'REJECT_INSURANCE_SETTLEMENT_REFUND',
    details: {
      settlementId,
      amount: Money.toDbString(refund.amount),
      postingEntryId,
      reference,
      note,
    },
  });
  return result;
}
