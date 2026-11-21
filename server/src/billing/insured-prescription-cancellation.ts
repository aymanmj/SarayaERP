import { BadRequestException } from '@nestjs/common';
import { Prisma, type Invoice } from '@prisma/client';
import { Money } from '../common/utils/money.util';

export const paidInvoiceStatuses = ['ISSUED', 'PARTIALLY_PAID', 'PAID'];

export function trackedInsuredInvoice(
  invoice: Pick<
    Invoice,
    | 'insuranceShare'
    | 'patientShare'
    | 'totalAmount'
    | 'coveragePolicyId'
    | 'insuranceProviderId'
  >,
) {
  return (
    invoice.coveragePolicyId != null &&
    invoice.insuranceProviderId != null &&
    Money.isPositive(invoice.insuranceShare) &&
    Money.isPositive(invoice.patientShare) &&
    Money.eq(
      Money.sumDecimal(invoice.insuranceShare, invoice.patientShare),
      invoice.totalAmount,
    )
  );
}

export function fullInsuredPrescriptionCredit(
  invoice: Parameters<typeof trackedInsuredInvoice>[0],
  adjustment: {
    delta: Prisma.Decimal;
    insuranceDelta: Prisma.Decimal;
    correctedAmount: Prisma.Decimal;
  },
) {
  return (
    trackedInsuredInvoice(invoice) &&
    Money.isZero(adjustment.correctedAmount) &&
    Money.eq(adjustment.delta.negated(), invoice.patientShare) &&
    Money.eq(adjustment.insuranceDelta.negated(), invoice.insuranceShare)
  );
}

export async function assertPrescriptionClaimUnsubmitted(
  db: Prisma.TransactionClient,
  invoice: Pick<Invoice, 'id' | 'hospitalId' | 'claimStatus'>,
) {
  if (invoice.claimStatus === 'WITHDRAWN') {
    const evidence = await db.insuranceClaimWithdrawal.findFirst({
      where: { hospitalId: invoice.hospitalId, invoiceId: invoice.id },
      select: { id: true },
    });
    if (
      evidence &&
      !(await db.claim.count({
        where: {
          hospitalId: invoice.hospitalId,
          invoiceId: invoice.id,
          status: { not: 'VOID' },
        },
      }))
    )
      return;
  }
  if (
    (invoice.claimStatus != null && invoice.claimStatus !== 'PENDING') ||
    (await db.claim.count({
      where: { hospitalId: invoice.hospitalId, invoiceId: invoice.id },
    }))
  )
    throw new BadRequestException(
      'يلزم تسوية المطالبة التأمينية قبل إلغاء الوصفة',
    );
}

export async function originalInsurerReceivable(
  tx: Prisma.TransactionClient,
  invoice: Invoice,
  lines: { accountId: number; debit: Prisma.Decimal; credit: Prisma.Decimal }[],
  patientAccountId: number,
  revenueAccountId: number,
) {
  const insurerLine = lines.find(
    (line) =>
      line.accountId !== patientAccountId &&
      line.accountId !== revenueAccountId,
  );
  if (
    lines.length !== 3 ||
    !lines.some(
      (line) =>
        line.accountId === patientAccountId &&
        Money.eq(line.debit, invoice.patientShare) &&
        Money.isZero(line.credit),
    ) ||
    !lines.some(
      (line) =>
        line.accountId === revenueAccountId &&
        Money.isZero(line.debit) &&
        Money.eq(line.credit, invoice.totalAmount),
    ) ||
    !insurerLine ||
    !Money.eq(insurerLine.debit, invoice.insuranceShare) ||
    !Money.isZero(insurerLine.credit)
  )
    throw new BadRequestException(
      'قيد الوصفة المؤمّنة لا يطابق الذمم الأصلية؛ يلزم إجراء مطابقة',
    );
  const insurerAccount = await tx.account.findFirst({
    where: {
      id: insurerLine.accountId,
      hospitalId: invoice.hospitalId,
      isActive: true,
      type: 'ASSET',
    },
    select: { id: true },
  });
  if (!insurerAccount)
    throw new BadRequestException('حساب ذمة التأمين الأصلي غير صالح');
  return insurerAccount.id;
}
