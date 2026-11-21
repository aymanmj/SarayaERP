import { BadRequestException } from '@nestjs/common';
import { type Invoice, type InvoiceAdjustment, Prisma } from '@prisma/client';
import { financialPeriod } from '../accounting/financial-posting';
import { originalInsuranceReceivable } from '../accounting/insurance-receivable';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import { readInvoiceSnapshot } from './invoice-snapshot';

export async function partialPrescriptionQuote(
  tx: Prisma.TransactionClient,
  invoice: Invoice,
) {
  const prescription = await tx.prescription.findFirst({
    where: {
      hospitalId: invoice.hospitalId,
      patientId: invoice.patientId,
      encounterId: invoice.encounterId,
      prepaidInvoiceId: invoice.id,
      status: 'PARTIALLY_COMPLETED',
    },
    include: { items: true, dispenses: { include: { items: true } } },
  });
  const snapshot = readInvoiceSnapshot(invoice.lineSnapshot);
  const line = snapshot?.lines[0];
  const record = prescription?.dispenses[0];
  if (
    !prescription ||
    prescription.dispenses.length !== 1 ||
    !record?.partialClosureReason ||
    record.hospitalId !== invoice.hospitalId ||
    !record.items.length ||
    !snapshot ||
    snapshot.invoiceId !== invoice.id ||
    snapshot.lines.length !== 1 ||
    line?.sourceType !== 'PHARMACY_PRESCRIPTION' ||
    line.sourceId !== prescription.id ||
    !Money.eq(line.totalAmount, invoice.totalAmount) ||
    !Money.eq(snapshot.totalAmount, invoice.totalAmount) ||
    !Money.eq(snapshot.insuranceShare, invoice.insuranceShare) ||
    !Money.eq(snapshot.patientShare, invoice.patientShare)
  )
    return null;
  const originals = new Map(prescription.items.map((item) => [item.id, item]));
  if (
    record.items.some((item) => {
      const issued = originals.get(item.prescriptionItemId ?? -1);
      return (
        !issued ||
        issued.prepaidUnitPrice == null ||
        issued.productId !== item.productId ||
        !Money.eq(issued.prepaidUnitPrice, item.unitPrice) ||
        item.quantity.lte(0)
      );
    })
  )
    return null;
  const quantities = prescription.items.map((item) => {
    const dispensed = record.items.filter(
      (row) => row.prescriptionItemId === item.id,
    );
    const quantity = Money.sumDecimal(...dispensed.map((row) => row.quantity));
    return {
      itemId: item.id,
      prescribed: item.quantity,
      dispensed: quantity.toString(),
      issuedAmount: Money.decimal(item.prepaidUnitPrice).times(item.quantity),
      actualAmount: Money.decimal(item.prepaidUnitPrice).times(quantity),
      recordedAmount: Money.sumDecimal(
        ...dispensed.map((row) => row.totalAmount),
      ),
    };
  });
  if (
    prescription.items.some((item) => item.prepaidUnitPrice == null) ||
    quantities.some(
      (item) =>
        Money.gt(item.dispensed, item.prescribed) ||
        !Money.eq(item.actualAmount, item.recordedAmount),
    ) ||
    !Money.eq(
      Money.sumPosted(...quantities.map((item) => item.issuedAmount)),
      invoice.totalAmount,
    )
  )
    return null;
  const total = Money.sumPosted(...quantities.map((item) => item.actualAmount));
  if (!total.gt(0) || !total.lt(invoice.totalAmount)) return null;
  const insurerShare = Money.decimal(
    Money.toDbString(
      total.times(invoice.insuranceShare).div(invoice.totalAmount),
    ),
  );
  const patientShare = total.minus(insurerShare);
  if (
    patientShare.lt(0) ||
    patientShare.gt(invoice.patientShare) ||
    insurerShare.gt(invoice.insuranceShare)
  )
    return null;
  return {
    line,
    recordId: record.id,
    closureReason: record.partialClosureReason,
    quantities: quantities.map(({ itemId, prescribed, dispensed }) => ({
      itemId,
      prescribed,
      dispensed,
    })),
    total,
    insurerShare,
    patientShare,
  };
}

async function requirePartialQuote(
  tx: Prisma.TransactionClient,
  invoice: Invoice,
  chargeId: number,
) {
  const quote = await partialPrescriptionQuote(tx, invoice);
  if (
    !quote ||
    quote.line.id !== chargeId ||
    invoice.type !== 'INVOICE' ||
    !['PAID', 'PARTIALLY_PAID'].includes(invoice.status) ||
    !invoice.coveragePolicyId ||
    !invoice.insuranceProviderId ||
    !Money.isZero(invoice.discountAmount) ||
    !Money.eq(
      invoice.patientShare.plus(invoice.insuranceShare),
      invoice.totalAmount,
    ) ||
    !Money.eq(invoice.paidAmount, invoice.patientShare) ||
    ![null, 'PENDING'].includes(invoice.claimStatus) ||
    !(await tx.encounterCharge.findFirst({
      where: {
        id: chargeId,
        hospitalId: invoice.hospitalId,
        invoiceId: invoice.id,
        encounterId: invoice.encounterId,
        sourceType: 'PHARMACY_PRESCRIPTION',
        sourceId: quote.line.sourceId,
        totalAmount: invoice.totalAmount,
      },
      select: { id: true },
    })) ||
    (await tx.claim.count({
      where: { hospitalId: invoice.hospitalId, invoiceId: invoice.id },
    })) ||
    (await tx.insuranceSettlementAllocation.count({
      where: { invoiceId: invoice.id },
    })) ||
    (await tx.invoiceAdjustment.count({
      where: {
        hospitalId: invoice.hospitalId,
        invoiceId: invoice.id,
        status: 'POSTED',
      },
    }))
  )
    throw new BadRequestException(
      'يلزم صرف جزئي نهائي مثبت وفاتورة مؤمّنة مسددة دون مطالبة أو تصحيح مرحّل',
    );
  return quote;
}

export async function requestPartialPrescriptionCredit(
  tx: Prisma.TransactionClient,
  invoice: Invoice,
  chargeId: number,
  correctedAmount: string,
  userId: number,
  requestKey: string,
  reason: string,
) {
  const quote = await requirePartialQuote(tx, invoice, chargeId);
  if (
    !Money.eq(quote.total, correctedAmount) ||
    (await tx.invoiceAdjustment.count({
      where: {
        hospitalId: invoice.hospitalId,
        invoiceId: invoice.id,
        status: 'PENDING',
      },
    }))
  )
    throw new BadRequestException('تغيّر الصرف المثبت أو توجد تسوية معلقة');
  const result = await tx.invoiceAdjustment.create({
    data: {
      hospitalId: invoice.hospitalId,
      invoiceId: invoice.id,
      chargeId,
      requestKey,
      reason,
      requestedById: userId,
      kind: 'CREDIT',
      partialDispense: true,
      previousAmount: invoice.totalAmount,
      correctedAmount: Money.toDbString(quote.total),
      delta: Money.toDbString(quote.patientShare.minus(invoice.patientShare)),
      insuranceDelta: Money.toDbString(
        quote.insurerShare.minus(invoice.insuranceShare),
      ),
      snapshot: {
        dispenseRecordId: quote.recordId,
        quantities: quote.quantities,
        closureReason: quote.closureReason,
      },
    },
  });
  await appendChainedAuditInTransaction(tx, {
    hospitalId: invoice.hospitalId,
    userId,
    action: 'REQUEST_PARTIAL_PRESCRIPTION_CREDIT',
    entity: 'InvoiceAdjustment',
    entityId: result.id,
    details: {
      invoiceId: invoice.id,
      dispenseRecordId: quote.recordId,
      quantities: quote.quantities,
      reason,
    },
  });
  return result;
}

export async function postPartialPrescriptionCredit(
  tx: Prisma.TransactionClient,
  invoice: Invoice,
  adjustment: InvoiceAdjustment,
  userId: number,
  reason: string,
) {
  const quote = await requirePartialQuote(tx, invoice, adjustment.chargeId);
  if (
    !Money.eq(adjustment.correctedAmount, quote.total) ||
    !Money.eq(
      adjustment.delta,
      quote.patientShare.minus(invoice.patientShare),
    ) ||
    !Money.eq(
      adjustment.insuranceDelta,
      quote.insurerShare.minus(invoice.insuranceShare),
    )
  )
    throw new BadRequestException('تغيرت قيم الصرف منذ الطلب');
  const { journal, receivable } = await originalInsuranceReceivable(
    tx,
    invoice,
  );
  const revenue = journal.lines.find(
    (line) => line.accountId === quote.line.revenueAccountId,
  );
  const patient = journal.lines.find(
    (line) => line.id !== receivable.id && line.id !== revenue?.id,
  );
  if (
    journal.lines.length !== 3 ||
    !revenue ||
    !patient ||
    !Money.eq(revenue.credit, invoice.totalAmount) ||
    !Money.isZero(revenue.debit) ||
    !Money.eq(patient.debit, invoice.patientShare) ||
    !Money.isZero(patient.credit) ||
    revenue.account.type !== 'REVENUE' ||
    patient.account.type !== 'ASSET' ||
    [patient, revenue].some(
      ({ account }) =>
        !account.isActive || account.hospitalId !== invoice.hospitalId,
    )
  )
    throw new BadRequestException(
      'يلزم مطابقة الإيراد والذمتين مع قيد الإصدار',
    );
  const entryDate = new Date();
  const { financialYear, period } = await financialPeriod(
    tx,
    invoice.hospitalId,
    entryDate,
  );
  const entry = await tx.accountingEntry.create({
    data: {
      hospitalId: invoice.hospitalId,
      sourceId: invoice.id,
      sourceModule: 'BILLING',
      entryDate,
      createdById: userId,
      financialYearId: financialYear.id,
      financialPeriodId: period.id,
      postingKey: `adjustment:${invoice.hospitalId}:${adjustment.id}`,
      description: `تصحيح كمية وصفة مصروفة جزئيًا #${adjustment.id}`,
      lines: {
        create: [
          {
            accountId: revenue.accountId,
            debit: Money.toDbString(invoice.totalAmount.minus(quote.total)),
            credit: '0.000',
          },
          ...[
            { accountId: patient.accountId, amount: adjustment.delta },
            {
              accountId: receivable.accountId,
              amount: adjustment.insuranceDelta,
            },
          ]
            .filter(({ amount }) => amount.lt(0))
            .map(({ accountId, amount }) => ({
              accountId,
              debit: '0.000',
              credit: Money.toDbString(amount.negated()),
            })),
        ],
      },
    },
  });
  const result = await tx.invoiceAdjustment.update({
    where: { id: adjustment.id },
    data: {
      status: 'POSTED',
      reviewedById: userId,
      reviewedAt: entryDate,
      reviewReason: reason,
      postingEntryId: entry.id,
    },
  });
  const zeroShare = quote.insurerShare.isZero();
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      claimStatus: zeroShare ? 'PAID' : 'PENDING',
      status: zeroShare ? 'PAID' : 'PARTIALLY_PAID',
    },
  });
  await appendChainedAuditInTransaction(tx, {
    hospitalId: invoice.hospitalId,
    userId,
    action: 'POST_PARTIAL_PRESCRIPTION_CREDIT',
    entity: 'InvoiceAdjustment',
    entityId: adjustment.id,
    details: {
      invoiceId: invoice.id,
      dispenseRecordId: quote.recordId,
      postingEntryId: entry.id,
      coveragePolicyId: invoice.coveragePolicyId,
      coverageReleased: invoice.releaseCoverageOnPartialDispense
        ? Money.toDbString(adjustment.insuranceDelta.negated())
        : '0.000',
      reason,
    },
  });
  return result;
}
