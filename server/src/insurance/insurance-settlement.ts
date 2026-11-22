import { BadRequestException, ConflictException } from '@nestjs/common';
import { type Account, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { financialPeriod } from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import { mappedAccount } from '../purchases/purchase-return-posting';
import {
  MONEY_INPUT_PATTERN,
  type PreparedSettlementDue,
  type SettlementLineInput,
  parseExplicitAllocations,
  prepareSettlementAllocations,
  unallocatedSummary,
  updateSettledInvoiceStatuses,
} from './insurance-settlement-balance';

export type InsuranceSettlementInput = {
  providerId: number;
  invoiceIds: number[];
  amount: string;
  bankReference: string;
  confirmed: boolean;
  allocations?: SettlementLineInput[];
  unallocatedAmount?: string;
};

export async function postInsuranceSettlement(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  userId: number,
  input: InsuranceSettlementInput,
) {
  const { providerId } = input;
  const bankReference = input.bankReference.trim().toUpperCase();
  const rawInvoiceIds = Array.isArray(input.invoiceIds) ? input.invoiceIds : [];
  const invoiceIds = [...new Set(rawInvoiceIds)].sort((a, b) => a - b);
  const rawUnallocated = input.unallocatedAmount;
  const hasUnallocated = rawUnallocated !== undefined;
  if (
    input.confirmed !== true ||
    bankReference.length < 5 ||
    bankReference.length > 200 ||
    !MONEY_INPUT_PATTERN.test(input.amount) ||
    !Money.isPositive(input.amount) ||
    invoiceIds.length > 100 ||
    invoiceIds.length !== rawInvoiceIds.length ||
    invoiceIds.some((id) => !Number.isInteger(id) || id <= 0) ||
    (!invoiceIds.length && !hasUnallocated) ||
    (rawUnallocated !== undefined &&
      (!MONEY_INPUT_PATTERN.test(rawUnallocated) ||
        !Money.isPositive(rawUnallocated)))
  )
    throw new BadRequestException(
      'يلزم مبلغ دقيق ومرجع بنكي مؤكد وتحديد الفواتير أو الرصيد غير الموزع',
    );

  const unallocatedDecimal =
    rawUnallocated !== undefined
      ? Money.decimal(rawUnallocated)
      : Money.decimal(0);
  const allocatedExpected = Money.decimal(input.amount).minus(
    unallocatedDecimal,
  );

  if (invoiceIds.length === 0) {
    if (
      (input.allocations !== undefined && input.allocations.length > 0) ||
      !allocatedExpected.isZero()
    )
      throw new BadRequestException(
        'الحوالة غير الموزعة بالكامل تتطلب تطابق المبلغ غير الموزع مع مبلغ التحويل دون تخصيص فواتير',
      );
  } else if (!allocatedExpected.gt(0)) {
    throw new BadRequestException(
      'المبلغ غير الموزع يجب أن يكون أقل من إجمالي الحوالة عند اختيار فواتير',
    );
  }

  const explicit = invoiceIds.length
    ? parseExplicitAllocations(invoiceIds, input.allocations, allocatedExpected)
    : undefined;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;
  if (
    !(await tx.user.findFirst({
      where: { id: userId, hospitalId, isActive: true, isDeleted: false },
      select: { id: true },
    }))
  )
    throw new BadRequestException('المستخدم غير متاح ضمن المنشأة');

  const previous = await tx.insuranceSettlement.findUnique({
    where: { hospitalId_bankReference: { hospitalId, bankReference } },
    include: {
      allocations: {
        where: { applicationId: null },
        orderBy: { invoiceId: 'asc' },
      },
    },
  });
  if (previous) {
    if (
      previous.providerId !== providerId ||
      !Money.eq(previous.amount, input.amount) ||
      !Money.eq(previous.unallocatedAmount, unallocatedDecimal) ||
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
      throw new ConflictException('مرجع التحويل مستخدم في تسوية مختلفة');
    return previous;
  }

  await tx.$queryRaw`SELECT id FROM "InsuranceProvider" WHERE id = ${providerId} AND "hospitalId" = ${hospitalId} FOR SHARE`;
  if (
    !(await tx.insuranceProvider.findFirst({
      where: { id: providerId, hospitalId, isActive: true },
      select: { id: true },
    }))
  )
    throw new BadRequestException('شركة التأمين غير نشطة ضمن المنشأة');

  const entryDate = new Date();
  const { financialYear, period } = await financialPeriod(
    tx,
    hospitalId,
    entryDate,
  );
  const bank = await mappedAccount(tx, hospitalId, 'BANK_MAIN');
  if (bank.type !== 'ASSET')
    throw new BadRequestException('حساب البنك يجب أن يكون من الأصول');

  let unallocatedAccount: Account | null = null;
  if (unallocatedDecimal.gt(0)) {
    unallocatedAccount = await mappedAccount(
      tx,
      hospitalId,
      'INSURANCE_UNALLOCATED_RECEIPTS',
    );
    if (
      unallocatedAccount.type !== 'LIABILITY' ||
      unallocatedAccount.id === bank.id
    )
      throw new BadRequestException(
        'حساب الحوالات غير الموزعة يجب أن يكون حساب التزام مستقل عن البنك',
      );
  }

  let dues: PreparedSettlementDue[] = [];
  let credits = new Map<number, Prisma.Decimal>();
  let allocations: Prisma.InsuranceSettlementAllocationUncheckedCreateWithoutSettlementInput[] =
    [];
  if (invoiceIds.length > 0) {
    const prepared = await prepareSettlementAllocations(
      tx,
      hospitalId,
      providerId,
      invoiceIds,
      allocatedExpected,
      explicit,
      unallocatedAccount,
    );
    if (prepared.credits.has(bank.id))
      throw new BadRequestException('حساب البنك يطابق حساب ذمة التأمين');
    dues = prepared.dues;
    credits = prepared.credits;
    allocations = prepared.allocations;
  }

  const amount = Money.toDbString(input.amount);
  const unallocatedAmountStr = Money.toDbString(unallocatedDecimal);
  const refHash = createHash('sha256').update(bankReference).digest('hex');
  const postingKey =
    invoiceIds.length === 0
      ? `insurance-claim-settlement:${hospitalId}:unallocated:${refHash}`
      : `insurance-claim-settlement:${hospitalId}:${invoiceIds.join(',')}${
          dues.some(({ hasHistory }) => hasHistory) || unallocatedDecimal.gt(0)
            ? `:${refHash}`
            : ''
        }`;

  const journalLines: Prisma.AccountingEntryLineUncheckedCreateWithoutEntryInput[] =
    [
      { accountId: bank.id, debit: amount, credit: '0.000' },
      ...[...credits].map(([accountId, credit]) => ({
        accountId,
        debit: '0.000',
        credit: Money.toDbString(credit),
      })),
    ];
  if (unallocatedAccount) {
    journalLines.push({
      accountId: unallocatedAccount.id,
      debit: '0.000',
      credit: unallocatedAmountStr,
    });
  }

  const entry = await tx.accountingEntry.create({
    data: {
      hospitalId,
      entryDate,
      postingKey,
      description:
        invoiceIds.length === 0
          ? `حوالة تأمين غير موزعة - ${bankReference}`
          : unallocatedDecimal.gt(0)
            ? `تحصيل تأمين مع فائض غير موزع - ${bankReference}`
            : `تحصيل تأمين - ${bankReference}`,
      sourceModule: 'CASHIER',
      sourceId: invoiceIds[0] ?? providerId,
      createdById: userId,
      financialYearId: financialYear.id,
      financialPeriodId: period.id,
      lines: { create: journalLines },
    },
  });

  const settlement = await tx.insuranceSettlement.create({
    data: {
      hospitalId,
      providerId,
      bankReference,
      amount,
      unallocatedAmount: unallocatedAmountStr,
      unallocatedAccountId: unallocatedAccount?.id ?? null,
      postingEntryId: entry.id,
      recordedById: userId,
      ...(allocations.length ? { allocations: { create: allocations } } : {}),
    },
    include: {
      allocations: {
        where: { applicationId: null },
        orderBy: { invoiceId: 'asc' },
      },
    },
  });

  if (dues.length > 0) {
    await updateSettledInvoiceStatuses(tx, hospitalId, dues);
  }

  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    action: 'INSURANCE_CLAIMS_SETTLED',
    entity: 'InsuranceSettlement',
    entityId: settlement.id,
    details: {
      providerId,
      bankReference,
      amount,
      unallocatedAmount: unallocatedAmountStr,
      unallocatedAccountId: unallocatedAccount?.id ?? null,
      invoiceIds,
      allocations: dues.map(({ invoice, amount: lineAmt, outstanding }) => ({
        invoiceId: invoice.id,
        amount: Money.toDbString(lineAmt),
        outstandingBefore: Money.toDbString(outstanding),
        remaining: Money.toDbString(outstanding.minus(lineAmt)),
      })),
      accountingEntryId: entry.id,
    },
  });
  return settlement;
}

export async function listInsuranceSettlements(
  db: Pick<Prisma.TransactionClient, 'insuranceSettlement'>,
  hospitalId: number,
  filters: { providerId?: number; onlyUnallocated?: boolean },
) {
  const rows = await db.insuranceSettlement.findMany({
    where: {
      hospitalId,
      ...(filters.providerId ? { providerId: filters.providerId } : {}),
      ...(filters.onlyUnallocated ? { unallocatedAmount: { gt: 0 } } : {}),
    },
    include: {
      provider: { select: { id: true, name: true, code: true } },
      applications: { select: { id: true, amount: true } },
      refunds: { select: { id: true, status: true, unallocatedAmount: true } },
      _count: { select: { allocations: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  const mapped = rows.map((row) => {
    const summary = unallocatedSummary(row);
    return {
      id: row.id,
      providerId: row.providerId,
      provider: row.provider,
      bankReference: row.bankReference,
      amount: Money.toDbString(row.amount),
      unallocatedAmount: Money.toDbString(summary.unallocatedAmount),
      appliedUnallocated: Money.toDbString(summary.applied),
      refundedUnallocated: Money.toDbString(summary.refunded),
      pendingRefundUnallocated: Money.toDbString(summary.pendingRefund),
      availableUnallocated: Money.toDbString(summary.available),
      createdAt: row.createdAt,
      allocationsCount: row._count.allocations,
      applicationsCount: row.applications.length,
    };
  });

  if (filters.onlyUnallocated) {
    return mapped.filter((item) => Money.isPositive(item.availableUnallocated));
  }
  return mapped;
}
