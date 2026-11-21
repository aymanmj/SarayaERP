import { BadRequestException, ConflictException } from '@nestjs/common';
import { type Invoice, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
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
  readSettlementBalance,
  settledClaimStatus,
  trackedInsuranceShare,
} from './insurance-settlement-balance';

export type InsuranceSettlementInput = {
  providerId: number;
  invoiceIds: number[];
  amount: string;
  bankReference: string;
  confirmed: boolean;
  allocations?: { invoiceId: number; amount: string }[];
};

export async function postInsuranceSettlement(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  userId: number,
  input: InsuranceSettlementInput,
) {
  const { providerId } = input;
  const bankReference = input.bankReference.trim().toUpperCase();
  const invoiceIds = [...new Set(input.invoiceIds)].sort((a, b) => a - b);
  if (
    input.confirmed !== true ||
    bankReference.length < 5 ||
    bankReference.length > 200 ||
    !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(input.amount) ||
    !Money.isPositive(input.amount) ||
    !invoiceIds.length ||
    invoiceIds.length > 100 ||
    invoiceIds.length !== input.invoiceIds.length ||
    invoiceIds.some((id) => !Number.isInteger(id) || id <= 0)
  )
    throw new BadRequestException(
      'يلزم مبلغ دقيق ومرجع بنكي مؤكد وفواتير مميزة',
    );
  let explicit: Map<number, string> | undefined;
  if (input.allocations !== undefined) {
    if (
      !Array.isArray(input.allocations) ||
      input.allocations.length !== invoiceIds.length ||
      input.allocations.some(
        (line) =>
          !line ||
          !invoiceIds.includes(line.invoiceId) ||
          !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(line.amount) ||
          !Money.isPositive(line.amount),
      )
    )
      throw new BadRequestException('يلزم تخصيص موجب ودقيق لكل فاتورة مختارة');
    explicit = new Map(
      input.allocations.map(({ invoiceId, amount }) => [invoiceId, amount]),
    );
    if (
      explicit.size !== invoiceIds.length ||
      !Money.eq(Money.sumDecimal(...explicit.values()), input.amount)
    )
      throw new BadRequestException(
        'مجموع التخصيصات يجب أن يطابق مبلغ الحوالة',
      );
  }
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
    include: { allocations: { orderBy: { invoiceId: 'asc' } } },
  });
  if (previous) {
    if (
      previous.providerId !== providerId ||
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

  const candidates = await tx.invoice.findMany({
    where: {
      id: { in: invoiceIds },
      hospitalId,
      insuranceProviderId: providerId,
      ...dispensedPrescriptionClaim,
    },
    select: { id: true },
    orderBy: [{ patientId: 'asc' }, { encounterId: 'asc' }, { id: 'asc' }],
  });
  if (candidates.length !== invoiceIds.length)
    throw new BadRequestException(
      'كل الفواتير المؤهلة يجب أن تخص المنشأة وشركة التأمين المختارة',
    );
  const invoices: Invoice[] = [];
  for (const { id } of candidates) {
    invoices.push(await lockFinancialInvoice(tx, hospitalId, id));
  }
  if (
    invoices.some(
      (invoice) =>
        invoice.type !== 'INVOICE' ||
        invoice.insuranceProviderId !== providerId ||
        !['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status) ||
        !['SUBMITTED', 'PARTIALLY_PAID'].includes(invoice.claimStatus ?? '') ||
        !Money.isPositive(invoice.insuranceShare),
    )
  )
    throw new BadRequestException(
      'الفواتير يجب أن تخص مطالبات مرسلة ومبالغ مستحقة لم تسو بعد',
    );
  if (
    await tx.claim.count({
      where: { hospitalId, invoiceId: { in: invoiceIds } },
    })
  )
    throw new BadRequestException(
      'توجد مطالبات مسجلة في دورة الإيرادات؛ استكملها في المسار نفسه',
    );
  if (
    await tx.invoiceAdjustment.count({
      where: {
        hospitalId,
        invoiceId: { in: invoiceIds },
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
      'توجد تسويات معلقة أو تغيرات في ذمة التأمين تتطلب المطابقة',
    );

  const dues: {
    invoice: Invoice;
    outstanding: Prisma.Decimal;
    amount: Prisma.Decimal;
    hasHistory: boolean;
  }[] = [];
  for (const invoice of invoices) {
    const { net, hasHistory } = await readSettlementBalance(
      tx,
      hospitalId,
      invoice.id,
    );
    const share = await trackedInsuranceShare(tx, invoice);
    const outstanding = share.minus(net);
    if (
      net.lt(0) ||
      !outstanding.gt(0) ||
      invoice.claimStatus !== settledClaimStatus(net, share)
    )
      throw new BadRequestException('رصيد التأمين المستحق يحتاج إلى مطابقة');
    const amount = Money.decimal(explicit?.get(invoice.id) ?? outstanding);
    if (amount.gt(outstanding))
      throw new BadRequestException(
        `التخصيص يتجاوز الرصيد المستحق للفاتورة #${invoice.id}`,
      );
    dues.push({ invoice, outstanding, amount, hasHistory });
  }
  const total = Money.sumDecimal(...dues.map(({ amount }) => amount));
  if (!Money.eq(total, input.amount))
    throw new BadRequestException(
      'مبلغ الحوالة لا يطابق مجموع الأرصدة المستحقة؛ حدد تخصيص كل فاتورة للحوالة الجزئية',
    );
  const entryDate = new Date();
  const { financialYear, period } = await financialPeriod(
    tx,
    hospitalId,
    entryDate,
  );
  const bank = await mappedAccount(tx, hospitalId, 'BANK_MAIN');
  if (bank.type !== 'ASSET')
    throw new BadRequestException('حساب البنك يجب أن يكون من الأصول');

  const credits = new Map<number, Prisma.Decimal>();
  const allocations: Prisma.InsuranceSettlementAllocationUncheckedCreateWithoutSettlementInput[] =
    [];
  for (const { invoice, outstanding, amount } of dues) {
    const { receivable } = await originalInsuranceReceivable(tx, invoice);
    if (receivable.accountId === bank.id)
      throw new BadRequestException('حساب البنك يطابق حساب ذمة التأمين');
    credits.set(
      receivable.accountId,
      Money.sumDecimal(credits.get(receivable.accountId), amount),
    );
    allocations.push({
      invoiceId: invoice.id,
      originalReceivableId: receivable.id,
      amount: Money.toDbString(amount),
      outstandingBefore: Money.toDbString(outstanding),
    });
  }
  const amount = Money.toDbString(total);
  const suffix = dues.some(({ hasHistory }) => hasHistory)
    ? `:${createHash('sha256').update(bankReference).digest('hex')}`
    : '';
  const postingKey = `insurance-claim-settlement:${hospitalId}:${invoiceIds.join(',')}${suffix}`;
  const entry = await tx.accountingEntry.create({
    data: {
      hospitalId,
      entryDate,
      postingKey,
      description: `تحصيل تأمين - ${bankReference}`,
      sourceModule: 'CASHIER',
      sourceId: invoiceIds[0],
      createdById: userId,
      financialYearId: financialYear.id,
      financialPeriodId: period.id,
      lines: {
        create: [
          { accountId: bank.id, debit: amount, credit: '0.000' },
          ...[...credits].map(([accountId, credit]) => ({
            accountId,
            debit: '0.000',
            credit: Money.toDbString(credit),
          })),
        ],
      },
    },
  });
  const settlement = await tx.insuranceSettlement.create({
    data: {
      hospitalId,
      providerId,
      bankReference,
      amount,
      postingEntryId: entry.id,
      recordedById: userId,
      allocations: { create: allocations },
    },
    include: { allocations: { orderBy: { invoiceId: 'asc' } } },
  });
  for (const { invoice, amount, outstanding } of dues) {
    const patient = await adjustmentBalance(
      tx,
      hospitalId,
      invoice.id,
      invoice.patientShare,
      invoice.paidAmount,
    );
    const settled = amount.eq(outstanding);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        claimStatus: settled ? 'PAID' : 'PARTIALLY_PAID',
        status: settled && patient.balance.lte(0) ? 'PAID' : 'PARTIALLY_PAID',
      },
    });
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
      invoiceIds,
      allocations: dues.map(({ invoice, amount, outstanding }) => ({
        invoiceId: invoice.id,
        amount: Money.toDbString(amount),
        outstandingBefore: Money.toDbString(outstanding),
        remaining: Money.toDbString(outstanding.minus(amount)),
      })),
      accountingEntryId: entry.id,
    },
  });
  return settlement;
}
