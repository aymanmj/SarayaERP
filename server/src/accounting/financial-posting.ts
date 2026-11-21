import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma, SystemAccountKey } from '@prisma/client';
import { Money } from '../common/utils/money.util';

export const invoicePostingKey = (hospitalId: number, invoiceId: number) =>
  `invoice:${hospitalId}:${invoiceId}`;

export const insuranceReceivableLinePrefix = 'استحقاق تأمين (';

export async function lockFinancialInvoice(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  invoiceId: number,
) {
  const identity = await tx.invoice.findFirst({
    where: { id: invoiceId, hospitalId },
  });
  if (!identity)
    throw new NotFoundException('الفاتورة غير موجودة في هذه المنشأة');
  await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${identity.patientId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Encounter" WHERE "id" = ${identity.encounterId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
  const invoice = await tx.invoice.findFirstOrThrow({
    where: { id: invoiceId, hospitalId },
    include: {
      encounter: true,
      prepaidPrescription: { select: { preAuthorizationId: true } },
    },
  });
  if (
    invoice.patientId !== identity.patientId ||
    invoice.encounterId !== identity.encounterId ||
    invoice.encounter.hospitalId !== hospitalId ||
    invoice.encounter.patientId !== invoice.patientId
  )
    throw new BadRequestException('مراجع الفاتورة والحالة والمريض غير متسقة');
  return invoice;
}

export async function financialPeriod(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  at: Date,
) {
  const date = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  const years = await tx.financialYear.findMany({
    where: {
      hospitalId,
      status: 'OPEN',
      startDate: { lte: date },
      endDate: { gte: date },
    },
  });
  if (years.length !== 1)
    throw new BadRequestException(
      'يجب وجود سنة مالية مفتوحة واحدة لتاريخ العملية',
    );
  const year = years[0];
  await tx.$queryRaw`SELECT "id" FROM "FinancialYear" WHERE "id" = ${year.id} FOR SHARE`;
  const current = await tx.financialYear.findUniqueOrThrow({
    where: { id: year.id },
  });
  if (current.status !== 'OPEN')
    throw new BadRequestException('السنة المالية مغلقة');
  const periods = await tx.financialPeriod.findMany({
    where: {
      financialYearId: year.id,
      isOpen: true,
      monthStartDate: { lte: date },
      monthEndDate: { gte: date },
    },
  });
  if (periods.length !== 1)
    throw new BadRequestException(
      'يجب وجود فترة مالية مفتوحة واحدة لتاريخ العملية',
    );
  const period = periods[0];
  await tx.$queryRaw`SELECT "id" FROM "FinancialPeriod" WHERE "id" = ${period.id} FOR SHARE`;
  if (
    !(await tx.financialPeriod.findUniqueOrThrow({ where: { id: period.id } }))
      .isOpen
  )
    throw new BadRequestException('الفترة المالية مغلقة');
  return { financialYear: current, period };
}

export async function postPayment(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  paymentId: number,
  userId: number,
) {
  const payment = await tx.payment.findFirst({
    where: { id: paymentId, hospitalId },
    include: { invoice: true },
  });
  if (!payment || payment.invoice.hospitalId !== hospitalId)
    throw new NotFoundException('الدفعة غير موجودة');
  await lockFinancialInvoice(tx, hospitalId, payment.invoiceId);
  const postingKey = `payment:${hospitalId}:${paymentId}`;
  const existing = await tx.accountingEntry.findUnique({
    where: { postingKey },
  });
  if (existing) return existing;
  const legacy = await tx.accountingEntry.count({
    where: {
      hospitalId,
      sourceModule: 'BILLING',
      sourceId: paymentId,
      postingKey: null,
    },
  });
  if (legacy)
    throw new BadRequestException(
      'يوجد مرجع محاسبي قديم قد يخلط الفاتورة بالدفعة؛ يلزم التحقق منه قبل التسجيل',
    );
  if (!Money.isPositive(payment.amount))
    throw new BadRequestException('قيمة التحصيل المحاسبي يجب أن تكون موجبة');
  if (!['CASH', 'CARD', 'TRANSFER'].includes(payment.method))
    throw new BadRequestException('طريقة التحصيل غير مدعومة لهذا المسار');
  const { financialYear, period } = await financialPeriod(
    tx,
    hospitalId,
    payment.paidAt,
  );
  const account = async (key: SystemAccountKey) => {
    const mapping = await tx.systemAccountMapping.findFirst({
      where: {
        hospitalId,
        key,
        isActive: true,
        account: { hospitalId, isActive: true },
      },
    });
    if (!mapping)
      throw new BadRequestException(
        `الحساب النظامي ${key} غير مهيأ أو غير نشط في هذه المنشأة`,
      );
    return mapping.accountId;
  };
  const debit = await account(
    payment.method === PaymentMethod.CASH ? 'CASH_MAIN' : 'BANK_MAIN',
  );
  const credit = await account('RECEIVABLE_PATIENTS');
  return tx.accountingEntry.create({
    data: {
      hospitalId,
      postingKey,
      sourceModule: 'CASHIER',
      sourceId: paymentId,
      entryDate: payment.paidAt,
      financialYearId: financialYear.id,
      financialPeriodId: period.id,
      createdById: userId,
      description: `تحصيل دفعة #${paymentId} على فاتورة #${payment.invoiceId}`,
      lines: {
        create: [
          { accountId: debit, debit: payment.amount, credit: 0 },
          { accountId: credit, debit: 0, credit: payment.amount },
        ],
      },
    },
  });
}
