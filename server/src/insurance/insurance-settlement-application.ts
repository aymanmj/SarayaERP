import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { financialPeriod } from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import {
  MONEY_INPUT_PATTERN,
  type SettlementLineInput,
  parseExplicitAllocations,
  prepareSettlementAllocations,
  unallocatedSummary,
  updateSettledInvoiceStatuses,
} from './insurance-settlement-balance';

export type ApplySettlementCreditInput = {
  requestId: string;
  invoiceIds: number[];
  amount: string;
  allocations?: SettlementLineInput[];
};

type ApplicationContext = {
  hospitalId: number;
  settlementId: number;
  userId: number;
};

export async function applyInsuranceSettlementCredit(
  tx: Prisma.TransactionClient,
  context: ApplicationContext,
  input: ApplySettlementCreditInput,
) {
  const { hospitalId, settlementId, userId } = context;
  const rawInvoiceIds = Array.isArray(input.invoiceIds) ? input.invoiceIds : [];
  const invoiceIds = [...new Set(rawInvoiceIds)].sort((a, b) => a - b);
  if (
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      input.requestId,
    ) ||
    !MONEY_INPUT_PATTERN.test(input.amount) ||
    !Money.isPositive(input.amount) ||
    !invoiceIds.length ||
    invoiceIds.length > 100 ||
    invoiceIds.length !== rawInvoiceIds.length ||
    invoiceIds.some((id) => !Number.isInteger(id) || id <= 0)
  )
    throw new BadRequestException(
      'يلزم معرف طلب صالح ومبلغ دقيق موجب وفواتير مميزة للتخصيص',
    );

  const explicit = parseExplicitAllocations(
    invoiceIds,
    input.allocations,
    input.amount,
  );

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;
  if (
    !(await tx.user.findFirst({
      where: { hospitalId, id: userId, isActive: true, isDeleted: false },
      select: { id: true },
    }))
  )
    throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');

  await tx.$queryRaw`SELECT id FROM "InsuranceSettlement" WHERE id = ${settlementId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
  const settlement = await tx.insuranceSettlement.findFirst({
    where: { id: settlementId, hospitalId },
    include: {
      unallocatedAccount: true,
      postingEntry: { include: { lines: true } },
      applications: {
        include: { allocations: { orderBy: { invoiceId: 'asc' } } },
      },
      refunds: { select: { status: true, unallocatedAmount: true } },
    },
  });
  if (!settlement)
    throw new NotFoundException('تسوية حوالة التأمين غير موجودة');

  const requestKey = `settlement-application:${hospitalId}:${settlementId}:${input.requestId.toLowerCase()}`;
  const previous = settlement.applications.find(
    (app) => app.requestKey === requestKey,
  );
  if (previous) {
    if (
      previous.recordedById !== userId ||
      !Money.eq(previous.amount, input.amount) ||
      previous.allocations.length !== invoiceIds.length ||
      previous.allocations.some(
        (item, index) =>
          item.invoiceId !== invoiceIds[index] ||
          !Money.eq(
            item.amount,
            explicit?.get(item.invoiceId) ?? item.outstandingBefore,
          ),
      )
    )
      throw new ConflictException('معرف التخصيص مستخدم لطلب مختلف');
    return previous;
  }

  const summary = unallocatedSummary(settlement);
  const unallocatedAccount = settlement.unallocatedAccount;
  const originalUnallocatedCredit = Money.sumDecimal(
    ...settlement.postingEntry.lines
      .filter(
        (line) =>
          line.accountId === settlement.unallocatedAccountId &&
          Money.isZero(line.debit),
      )
      .map((line) => line.credit),
  );
  if (
    !Money.isPositive(settlement.unallocatedAmount) ||
    !unallocatedAccount ||
    unallocatedAccount.hospitalId !== hospitalId ||
    !unallocatedAccount.isActive ||
    unallocatedAccount.type !== 'LIABILITY' ||
    !Money.eq(originalUnallocatedCredit, settlement.unallocatedAmount)
  )
    throw new BadRequestException(
      'الحوالة لا تحتوي على رصيد غير موزع متاح أو حسابها يحتاج إلى مطابقة',
    );

  if (Money.gt(input.amount, summary.available))
    throw new BadRequestException(
      'المبلغ المطلوب يتجاوز الرصيد غير الموزع المتاح في الحوالة',
    );

  await tx.$queryRaw`SELECT id FROM "InsuranceProvider" WHERE id = ${settlement.providerId} AND "hospitalId" = ${hospitalId} FOR SHARE`;
  if (
    !(await tx.insuranceProvider.findFirst({
      where: { id: settlement.providerId, hospitalId, isActive: true },
      select: { id: true },
    }))
  )
    throw new BadRequestException('شركة التأمين غير نشطة ضمن المنشأة');

  const prepared = await prepareSettlementAllocations(
    tx,
    hospitalId,
    settlement.providerId,
    invoiceIds,
    Money.decimal(input.amount),
    explicit,
    unallocatedAccount,
  );

  const entryDate = new Date();
  const { financialYear, period } = await financialPeriod(
    tx,
    hospitalId,
    entryDate,
  );
  const amount = Money.toDbString(input.amount);
  const entry = await tx.accountingEntry.create({
    data: {
      hospitalId,
      entryDate,
      postingKey: `insurance-${requestKey}`,
      description: `تخصيص رصيد غير موزع من حوالة #${settlementId} (${settlement.bankReference})`,
      sourceModule: 'CASHIER',
      sourceId: settlementId,
      createdById: userId,
      financialYearId: financialYear.id,
      financialPeriodId: period.id,
      lines: {
        create: [
          { accountId: unallocatedAccount.id, debit: amount, credit: '0.000' },
          ...[...prepared.credits].map(([accountId, credit]) => ({
            accountId,
            debit: '0.000',
            credit: Money.toDbString(credit),
          })),
        ],
      },
    },
  });

  const application = await tx.insuranceSettlementApplication.create({
    data: {
      hospitalId,
      settlementId,
      requestKey,
      amount,
      postingEntryId: entry.id,
      recordedById: userId,
      allocations: {
        create: prepared.allocations.map((allocation) => ({
          ...allocation,
          settlementId,
        })),
      },
    },
    include: { allocations: { orderBy: { invoiceId: 'asc' } } },
  });

  await updateSettledInvoiceStatuses(tx, hospitalId, prepared.dues);

  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    entity: 'InsuranceSettlementApplication',
    entityId: application.id,
    action: 'APPLY_INSURANCE_SETTLEMENT_UNALLOCATED',
    details: {
      settlementId,
      providerId: settlement.providerId,
      bankReference: settlement.bankReference,
      amount,
      remainingUnallocated: Money.toDbString(
        summary.available.minus(input.amount),
      ),
      allocations: prepared.dues.map(
        ({ invoice, amount: lineAmt, outstanding }) => ({
          invoiceId: invoice.id,
          amount: Money.toDbString(lineAmt),
          outstandingBefore: Money.toDbString(outstanding),
          remaining: Money.toDbString(outstanding.minus(lineAmt)),
        }),
      ),
      accountingEntryId: entry.id,
    },
  });

  return application;
}
