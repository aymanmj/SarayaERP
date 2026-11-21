import { BadRequestException } from '@nestjs/common';
import { type Invoice, type InvoiceAdjustment, Prisma } from '@prisma/client';
import {
  financialPeriod,
  type lockFinancialInvoice,
} from '../accounting/financial-posting';
import { originalInsuranceReceivable } from '../accounting/insurance-receivable';
import {
  assertClaimReceivableJournals,
  claimCollectionBalance,
} from '../rcm/claim-collection-balance';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import {
  readSettlementBalance,
  settledClaimStatus,
  trackedInsuranceShare,
} from '../insurance/insurance-settlement-balance';
import { adjustmentBalance, readInvoiceSnapshot } from './invoice-snapshot';
import {
  paidInvoiceStatuses,
  trackedInsuredInvoice,
} from './insured-prescription-cancellation';

type LockedInvoice = Awaited<ReturnType<typeof lockFinancialInvoice>>;

export async function insuranceCreditCollection(
  tx: Prisma.TransactionClient,
  invoice: Pick<Invoice, 'id' | 'hospitalId' | 'insuranceShare'>,
) {
  const { id: invoiceId, hospitalId } = invoice;
  const claims = await tx.claim.findMany({
    where: { hospitalId, invoiceId },
    take: 2,
  });
  const grouped = await readSettlementBalance(tx, hospitalId, invoiceId);
  if (!claims.length)
    return grouped.hasHistory ? { net: grouped.net, claim: null } : null;
  const [claim] = claims;
  if (
    claims.length !== 1 ||
    grouped.hasHistory ||
    claim.batchId != null ||
    !Money.eq(claim.claimedAmount, invoice.insuranceShare) ||
    !Money.isZero(claim.adjustmentAmount)
  )
    return null;
  const collection = await claimCollectionBalance(tx, hospitalId, claim.id);
  if (!collection.gross.gt(0) || !Money.eq(collection.net, claim.paidAmount))
    return null;
  return { net: collection.net, claim };
}

async function assertActiveActor(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  userId: number,
) {
  if (
    !(await tx.user.findFirst({
      where: { id: userId, hospitalId, isActive: true, isDeleted: false },
      select: { id: true },
    }))
  )
    throw new BadRequestException('المستخدم غير متاح ضمن المنشأة');
}

async function validateCredit(
  tx: Prisma.TransactionClient,
  invoice: LockedInvoice,
  chargeId: number,
  correctedShare: Prisma.Decimal,
) {
  const { id: invoiceId, hospitalId } = invoice;
  const snapshot = readInvoiceSnapshot(invoice.lineSnapshot);
  const line = snapshot?.lines[0];
  const prescription = await tx.prescription.findFirst({
    where: {
      hospitalId,
      patientId: invoice.patientId,
      encounterId: invoice.encounterId,
      prepaidInvoiceId: invoiceId,
      status: 'COMPLETED',
      dispenses: { some: {} },
    },
    select: { id: true },
  });
  const charge = await tx.encounterCharge.findFirst({
    where: {
      id: chargeId,
      hospitalId,
      invoiceId,
      encounterId: invoice.encounterId,
    },
  });
  if (
    invoice.type !== 'INVOICE' ||
    !paidInvoiceStatuses.includes(invoice.status) ||
    !trackedInsuredInvoice(invoice) ||
    !Money.isZero(invoice.discountAmount) ||
    !snapshot ||
    snapshot.invoiceId !== invoiceId ||
    snapshot.lines.length !== 1 ||
    !Money.eq(snapshot.insuranceShare, invoice.insuranceShare) ||
    !Money.eq(snapshot.patientShare, invoice.patientShare) ||
    !Money.eq(snapshot.totalAmount, invoice.totalAmount) ||
    !line ||
    line.id !== chargeId ||
    line.sourceType !== 'PHARMACY_PRESCRIPTION' ||
    !prescription ||
    line.sourceId !== prescription.id ||
    !charge ||
    charge.sourceType !== line.sourceType ||
    charge.sourceId !== line.sourceId ||
    !Money.eq(charge.totalAmount, line.totalAmount) ||
    !Money.eq(line.totalAmount, invoice.totalAmount)
  )
    throw new BadRequestException(
      'يلزم أصل فاتورة مؤمّنة موثقة لوصفة صُرفت بالكامل',
    );
  if (
    await tx.invoice.count({
      where: {
        hospitalId,
        originalInvoiceId: invoiceId,
        status: { not: 'CANCELLED' },
      },
    })
  )
    throw new BadRequestException(
      'المطالبة أو الفاتورة تحتاج إلى مطابقة مالية مستقلة',
    );

  const collection = await insuranceCreditCollection(tx, invoice);
  if (!collection)
    throw new BadRequestException('يلزم سجل تحصيل تأميني قابل للمطابقة');
  const { net, claim } = collection;
  const pendingRefund = claim
    ? await tx.claimReceiptRefund.count({
        where: {
          hospitalId,
          status: 'PENDING',
          receipt: { claimId: claim.id, hospitalId },
        },
      })
    : await tx.insuranceSettlementRefundLine.count({
        where: {
          allocation: { invoiceId },
          refund: { hospitalId, status: 'PENDING' },
        },
      });
  if (pendingRefund)
    throw new BadRequestException(
      'يلزم حسم طلبات الرد المعلقة قبل تصحيح حصة التأمين',
    );
  const currentShare = await trackedInsuranceShare(tx, invoice);
  const withdrawn = invoice.claimStatus === 'WITHDRAWN';
  if (
    net.lt(0) ||
    net.gt(currentShare) ||
    (withdrawn
      ? !net.isZero() ||
        !correctedShare.isZero() ||
        !(await tx.insuranceClaimWithdrawal.count({
          where: { hospitalId, invoiceId, claimId: claim?.id ?? null },
        }))
      : invoice.claimStatus !== settledClaimStatus(net, currentShare))
  )
    throw new BadRequestException(
      'يلزم رصيد مطابق لحوالات التأمين؛ وتصحيح المطالبة المسحوبة يتطلب تصفير حصتها',
    );
  if (correctedShare.lt(0) || correctedShare.gte(currentShare))
    throw new BadRequestException('أدخل حصة تأمين مصححة أقل من الحصة الحالية');
  if (correctedShare.lt(net))
    throw new BadRequestException(
      'الحصة المصححة أقل من صافي التحصيل؛ وثّق رد الفرق إلى شركة التأمين أولًا',
    );
  if (
    claim &&
    (withdrawn
      ? claim.status !== 'VOID'
      : ![
          'SUBMITTED',
          'ACCEPTED',
          'APPEAL_ACCEPTED',
          'PAID',
          'PARTIALLY_PAID',
        ].includes(claim.status) ||
        (!net.isZero() &&
          claim.status !== settledClaimStatus(net, currentShare)))
  )
    throw new BadRequestException(
      'حالة المطالبة الفردية تحتاج إلى مطابقة قبل التصحيح',
    );
  const { journal, receivable } = await originalInsuranceReceivable(
    tx,
    invoice,
  );
  if (claim)
    await assertClaimReceivableJournals(
      tx,
      hospitalId,
      claim.id,
      receivable.accountId,
    );
  return { line, net, currentShare, claim, journal, receivable };
}

export async function requestInsuranceServiceCredit(
  tx: Prisma.TransactionClient,
  invoice: LockedInvoice,
  userId: number,
  chargeId: number,
  requestKey: string,
  amount: string,
  reason: string,
) {
  if (!/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(amount))
    throw new BadRequestException('أدخل حصة التأمين المصححة بدقة مالية');
  await assertActiveActor(tx, invoice.hospitalId, userId);
  const correctedShare = Money.decimal(amount);
  const { line, currentShare, net } = await validateCredit(
    tx,
    invoice,
    chargeId,
    correctedShare,
  );
  const { id: invoiceId, hospitalId } = invoice;
  if (
    await tx.invoiceAdjustment.count({
      where: { hospitalId, invoiceId, status: 'PENDING' },
    })
  )
    throw new BadRequestException('توجد تسوية معلقة على الفاتورة');
  const result = await tx.invoiceAdjustment.create({
    data: {
      hospitalId,
      invoiceId,
      chargeId,
      requestKey,
      reason,
      requestedById: userId,
      kind: 'CREDIT',
      insuranceOnly: true,
      previousAmount: Money.toDbString(invoice.patientShare.plus(currentShare)),
      correctedAmount: Money.toDbString(
        invoice.patientShare.plus(correctedShare),
      ),
      delta: '0.000',
      insuranceDelta: Money.toDbString(correctedShare.minus(currentShare)),
      snapshot: {
        previousInsuranceShare: Money.toDbString(currentShare),
        correctedInsuranceShare: Money.toDbString(correctedShare),
        originalRevenueAccountId: line.revenueAccountId,
      },
    },
  });
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    action: 'REQUEST_INSURANCE_SERVICE_CREDIT',
    entity: 'InvoiceAdjustment',
    entityId: result.id,
    details: {
      invoiceId,
      reason,
      currentShare: Money.toDbString(currentShare),
      correctedShare: Money.toDbString(correctedShare),
      netCollected: Money.toDbString(net),
    },
  });
  return result;
}

export async function postInsuranceServiceCredit(
  tx: Prisma.TransactionClient,
  invoice: LockedInvoice,
  adjustment: InvoiceAdjustment,
  userId: number,
  reason: string,
) {
  const { id: invoiceId, hospitalId } = invoice;
  await assertActiveActor(tx, hospitalId, userId);
  const correctedShare = adjustment.correctedAmount.minus(invoice.patientShare);
  const { line, currentShare, net, claim, journal, receivable } =
    await validateCredit(tx, invoice, adjustment.chargeId, correctedShare);
  if (
    !Money.eq(
      adjustment.previousAmount,
      invoice.patientShare.plus(currentShare),
    ) ||
    !Money.eq(adjustment.insuranceDelta, correctedShare.minus(currentShare))
  )
    throw new BadRequestException(
      'تغيّرت حصة التأمين منذ الطلب؛ يلزم طلب جديد',
    );
  const revenue = journal.lines.find(
    (item) => item.accountId === line.revenueAccountId,
  );
  if (
    !revenue ||
    receivable.accountId === revenue.accountId ||
    receivable.account.type !== 'ASSET' ||
    revenue.account.type !== 'REVENUE' ||
    [receivable, revenue].some(
      ({ account }) => !account.isActive || account.hospitalId !== hospitalId,
    ) ||
    !Money.eq(receivable.debit, invoice.insuranceShare) ||
    !Money.isZero(receivable.credit) ||
    !Money.eq(revenue.credit, invoice.totalAmount) ||
    !Money.isZero(revenue.debit)
  )
    throw new BadRequestException(
      'قيد الذمة أو الإيراد الأصلي يحتاج إلى مطابقة',
    );
  const entryDate = new Date();
  const { financialYear, period } = await financialPeriod(
    tx,
    hospitalId,
    entryDate,
  );
  const amount = Money.toDbString(adjustment.insuranceDelta.negated());
  const entry = await tx.accountingEntry.create({
    data: {
      hospitalId,
      entryDate,
      postingKey: `adjustment:${hospitalId}:${adjustment.id}`,
      sourceModule: 'BILLING',
      sourceId: invoiceId,
      financialYearId: financialYear.id,
      financialPeriodId: period.id,
      createdById: userId,
      description: `إشعار دائن لحصة التأمين #${adjustment.id}`,
      lines: {
        create: [
          { accountId: revenue.accountId, debit: amount, credit: '0.000' },
          { accountId: receivable.accountId, debit: '0.000', credit: amount },
        ],
      },
    },
  });
  const result = await tx.invoiceAdjustment.update({
    where: { id: adjustment.id },
    data: {
      status: 'POSTED',
      postingEntryId: entry.id,
      reviewedById: userId,
      reviewedAt: entryDate,
      reviewReason: reason,
    },
  });
  if (invoice.claimStatus !== 'WITHDRAWN') {
    const patient = await adjustmentBalance(
      tx,
      hospitalId,
      invoiceId,
      invoice.patientShare,
      invoice.paidAmount,
    );
    const claimStatus = settledClaimStatus(net, correctedShare);
    if (claim) {
      await tx.claim.update({
        where: { id: claim.id },
        data: {
          status: claimStatus,
          paidAt: claimStatus === 'PAID' ? (claim.paidAt ?? entryDate) : null,
        },
      });
      await tx.claimHistory.create({
        data: {
          claimId: claim.id,
          fromStatus: claim.status,
          toStatus: claimStatus,
          changedById: userId,
          notes: `إشعار دائن لحصة التأمين #${adjustment.id}`,
        },
      });
    }
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        claimStatus,
        status:
          claimStatus === 'PAID' && patient.balance.lte(0)
            ? 'PAID'
            : 'PARTIALLY_PAID',
      },
    });
  }
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    action: 'POST_INSURANCE_SERVICE_CREDIT',
    entity: 'InvoiceAdjustment',
    entityId: adjustment.id,
    details: {
      invoiceId,
      amount,
      netCollected: Money.toDbString(net),
      postingEntryId: entry.id,
      reason,
    },
  });
  return result;
}
