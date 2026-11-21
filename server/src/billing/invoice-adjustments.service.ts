import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  financialPeriod,
  invoicePostingKey,
  lockFinancialInvoice,
} from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { Money } from '../common/utils/money.util';
import { allocateRoomDays } from '../admission/room-allocation';
import { parseRoomRateSnapshot } from '../admission/room-rate-snapshot';
import {
  partialPrescriptionQuote,
  postPartialPrescriptionCredit,
  requestPartialPrescriptionCredit,
} from './partial-prescription-credit';
import {
  insuranceCreditCollection,
  postInsuranceServiceCredit,
  requestInsuranceServiceCredit,
} from './insurance-service-credit';
import {
  adjustmentBalance,
  effectiveInsuranceShare,
  readInvoiceSnapshot,
} from './invoice-snapshot';
import {
  assertPrescriptionClaimUnsubmitted,
  originalInsurerReceivable,
  paidInvoiceStatuses,
  trackedInsuredInvoice,
} from './insured-prescription-cancellation';

@Injectable()
export class InvoiceAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async validate(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    invoiceId: number,
    chargeId: number,
  ) {
    const invoice = await lockFinancialInvoice(tx, hospitalId, invoiceId);
    if (
      invoice.type !== 'INVOICE' ||
      !paidInvoiceStatuses.includes(invoice.status)
    )
      throw new BadRequestException('الفاتورة لا تسمح بالتسوية');
    const insured =
      !!invoice.prepaidPrescription && trackedInsuredInvoice(invoice);
    if (
      !Money.isZero(invoice.discountAmount) ||
      (!insured &&
        (!Money.isZero(invoice.insuranceShare) ||
          invoice.insuranceProviderId ||
          !Money.eq(invoice.patientShare, invoice.totalAmount)))
    )
      throw new BadRequestException(
        'هذه الدورة مخصصة للفواتير المؤهلة دون تأمين أو خصم',
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
        'الفاتورة لها تسويات قديمة؛ يلزم مطابقتها أولًا',
      );
    const snapshot = readInvoiceSnapshot(invoice.lineSnapshot);
    if (
      !snapshot ||
      snapshot.invoiceId !== invoice.id ||
      !Money.eq(snapshot.totalAmount, invoice.totalAmount) ||
      (insured &&
        (!Money.eq(snapshot.patientShare, invoice.patientShare) ||
          !Money.eq(snapshot.insuranceShare, invoice.insuranceShare)))
    )
      throw new BadRequestException(
        'يلزم أصل موثق لبنود الفاتورة؛ لن تُنشأ نسخة تاريخية بالتخمين',
      );
    const line = snapshot.lines.find((item) => item.id === chargeId);
    if (!line || !['BED', 'PHARMACY_PRESCRIPTION'].includes(line.sourceType))
      throw new BadRequestException('البند غير مؤهل للتصحيح من أصل الفاتورة');
    if (insured && line.sourceType !== 'PHARMACY_PRESCRIPTION')
      throw new BadRequestException('إلغاء التأمين متاح للوصفة قبل الصرف');
    const charge = await tx.encounterCharge.findFirst({
      where: {
        id: chargeId,
        hospitalId,
        invoiceId,
        encounterId: invoice.encounterId,
      },
    });
    if (
      !charge ||
      charge.sourceType !== line.sourceType ||
      charge.sourceId !== line.sourceId ||
      !Money.eq(charge.totalAmount, line.totalAmount)
    )
      throw new BadRequestException(
        'تغير ارتباط البند أو مبلغه الأصلي؛ يلزم التحقق',
      );
    const entry = await tx.accountingEntry.findUnique({
      where: { postingKey: invoicePostingKey(hospitalId, invoiceId) },
      include: { lines: true },
    });
    if (
      !entry ||
      entry.hospitalId !== hospitalId ||
      !entry.lines.some(
        (item) =>
          item.accountId === line.revenueAccountId &&
          Money.isPositive(item.credit),
      )
    )
      throw new BadRequestException('القيد الأصلي غير موثق أو لا يطابق البند');
    if (
      await tx.accountingEntry.count({
        where: {
          hospitalId,
          sourceModule: 'JOURNAL_REVERSAL',
          sourceId: entry.id,
        },
      })
    )
      throw new BadRequestException('القيد الأصلي معكوس ولا يسمح بهذه التسوية');
    const posted = await tx.invoiceAdjustment.findMany({
      where: { hospitalId, invoiceId, chargeId, status: 'POSTED' },
      select: { delta: true, insuranceDelta: true },
    });
    const previous = Money.sumDecimal(
      line.totalAmount,
      ...posted.map((item) =>
        Money.sumDecimal(item.delta, item.insuranceDelta),
      ),
    );
    let prescriptionId: number | null = null;
    if (line.sourceType === 'PHARMACY_PRESCRIPTION') {
      const prescription = await tx.prescription.findFirst({
        where: {
          prepaidInvoiceId: invoice.id,
          hospitalId,
          patientId: invoice.patientId,
          encounterId: invoice.encounterId,
          status: 'ACTIVE',
          dispenses: { none: {} },
        },
        select: { id: true },
      });
      if (
        !prescription ||
        prescription.id !== line.sourceId ||
        snapshot.lines.length !== 1 ||
        !Money.eq(line.totalAmount, invoice.totalAmount) ||
        posted.length ||
        !Money.isPositive(invoice.paidAmount) ||
        (insured && Money.gt(invoice.paidAmount, invoice.patientShare))
      )
        throw new BadRequestException(
          'يلزم أصل فاتورة مدفوعة لوصفة نشطة لم تُصرف ولم تُسوّ سابقًا',
        );
      if (insured) await assertPrescriptionClaimUnsubmitted(tx, invoice);
      const receipts = await tx.payment.findMany({
        where: { hospitalId, invoiceId },
        select: {
          id: true,
          amount: true,
          method: true,
          isDepositApplication: true,
        },
      });
      if (
        receipts.some(
          (receipt) =>
            receipt.isDepositApplication ||
            !['CASH', 'CARD', 'TRANSFER'].includes(receipt.method),
        ) ||
        !Money.eq(
          Money.sumDecimal(...receipts.map((receipt) => receipt.amount)),
          invoice.paidAmount,
        )
      )
        throw new BadRequestException(
          'تحتاج وسائل تحصيل الوصفة إلى مطابقة واسترداد مدعوم',
        );
      const receiptEntries = await tx.accountingEntry.findMany({
        where: {
          hospitalId,
          postingKey: {
            in: receipts.map(
              (receipt) => `payment:${hospitalId}:${receipt.id}`,
            ),
          },
        },
        select: { id: true },
      });
      if (
        receiptEntries.length !== receipts.length ||
        (await tx.accountingEntry.count({
          where: {
            hospitalId,
            sourceModule: 'JOURNAL_REVERSAL',
            sourceId: { in: receiptEntries.map((receipt) => receipt.id) },
          },
        }))
      )
        throw new BadRequestException('قيد تحصيل الوصفة غير موثق أو سبق عكسه');
      prescriptionId = prescription.id;
    }
    let computedAmount = charge.totalAmount.toString();
    if (line.sourceType === 'BED' && charge.roomBillingKey) {
      const admission = await tx.admission.findFirst({
        where: { hospitalId, encounterId: invoice.encounterId },
      });
      if (!admission)
        throw new BadRequestException('سجل الدخول غير متاح لحساب رسم الإقامة');
      const stays = await tx.bedAssignment.findMany({
        where: { hospitalId, encounterId: invoice.encounterId },
      });
      const allocations = allocateRoomDays(
        admission.actualAdmissionDate,
        admission.dischargeDate ?? new Date(),
        admission.roomBillingPolicy,
        admission.roomBillingTimeZone,
        stays.map((stay) => ({
          ...stay,
          rate: parseRoomRateSnapshot(stay.roomRateSnapshot),
        })),
      );
      computedAmount =
        allocations.find(
          (item) =>
            `room:v1:${hospitalId}:${invoice.encounterId}:${item.periodIndex}:${item.assignmentId}` ===
            charge.roomBillingKey,
        )?.amount ?? '0.000';
    }
    return { invoice, line, previous, computedAmount, prescriptionId, insured };
  }

  async list(hospitalId: number, invoiceId: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, hospitalId },
      include: {
        prepaidPrescription: {
          select: {
            id: true,
            status: true,
            _count: { select: { dispenses: true } },
            replacesPrescription: { select: { prepaidInvoiceId: true } },
            replacement: { select: { prepaidInvoiceId: true } },
          },
        },
        payments: { select: { method: true, isDepositApplication: true } },
        _count: { select: { claims: true } },
        claimWithdrawal: { select: { id: true } },
      },
    });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    const snapshot = readInvoiceSnapshot(invoice.lineSnapshot);
    const items = await this.prisma.invoiceAdjustment.findMany({
      where: { hospitalId, invoiceId },
      orderBy: { id: 'desc' },
    });
    const balance = await adjustmentBalance(
      this.prisma,
      hospitalId,
      invoiceId,
      invoice.patientShare,
      invoice.paidAmount,
    );
    const prescription = invoice.prepaidPrescription;
    const partial =
      prescription?.status === 'PARTIALLY_COMPLETED' &&
      !items.some((item) => ['PENDING', 'POSTED'].includes(item.status))
        ? await partialPrescriptionQuote(this.prisma, invoice)
        : null;
    const insured = !!prescription && trackedInsuredInvoice(invoice);
    const completedInsured =
      insured &&
      prescription?.status === 'COMPLETED' &&
      prescription._count.dispenses > 0;
    const settlement = completedInsured
      ? await insuranceCreditCollection(this.prisma, invoice)
      : null;
    const lines =
      snapshot?.lines.filter((line) =>
        prescription
          ? line.sourceType === 'PHARMACY_PRESCRIPTION' &&
            line.sourceId === prescription.id
          : line.sourceType === 'BED',
      ) ?? [];
    const canCancelPrescription =
      prescription?.status === 'ACTIVE' &&
      prescription._count.dispenses === 0 &&
      Money.isPositive(invoice.paidAmount) &&
      invoice.payments.every(
        (payment) =>
          !payment.isDepositApplication &&
          ['CASH', 'CARD', 'TRANSFER'].includes(payment.method),
      ) &&
      items.every((item) => !['PENDING', 'POSTED'].includes(item.status));
    return {
      items,
      lines,
      partialDispenseQuote: partial
        ? {
            correctedAmount: Money.toDbString(partial.total),
            patientShare: Money.toDbString(partial.patientShare),
            insurerShare: Money.toDbString(partial.insurerShare),
            closureReason: partial.closureReason,
          }
        : null,
      eligibleInsuranceCredit:
        !!settlement &&
        (!settlement.claim ||
          (invoice.claimStatus === 'WITHDRAWN'
            ? settlement.claim.status === 'VOID'
            : [
                'SUBMITTED',
                'ACCEPTED',
                'APPEAL_ACCEPTED',
                'PAID',
                'PARTIALLY_PAID',
              ].includes(settlement.claim.status))) &&
        lines.length === 1 &&
        invoice.type === 'INVOICE' &&
        paidInvoiceStatuses.includes(invoice.status) &&
        (invoice.claimStatus === 'WITHDRAWN' ||
          ['SUBMITTED', 'PARTIALLY_PAID', 'PAID'].includes(
            invoice.claimStatus ?? '',
          )) &&
        Money.isZero(invoice.discountAmount) &&
        !items.some((item) => item.status === 'PENDING') &&
        settlement.net.lt(
          Money.sumDecimal(invoice.insuranceShare, balance.insuranceDelta),
        ),
      insuranceNetCollected: settlement
        ? Money.toDbString(settlement.net)
        : null,
      claimWithdrawn: invoice.claimStatus === 'WITHDRAWN',
      prescriptionId: prescription?.id ?? null,
      originalPrescriptionInvoiceId:
        prescription?.replacesPrescription?.prepaidInvoiceId ?? null,
      replacementPrescriptionInvoiceId:
        prescription?.replacement?.prepaidInvoiceId ?? null,
      eligible:
        lines.length > 0 &&
        (!prescription || canCancelPrescription) &&
        invoice.type === 'INVOICE' &&
        paidInvoiceStatuses.includes(invoice.status) &&
        (insured
          ? (invoice._count.claims === 0 &&
              (invoice.claimStatus == null ||
                invoice.claimStatus === 'PENDING')) ||
            (invoice.claimStatus === 'WITHDRAWN' && !!invoice.claimWithdrawal)
          : Money.isZero(invoice.insuranceShare) &&
            !invoice.insuranceProviderId) &&
        Money.isZero(invoice.discountAmount),
      insuredPrescription: insured,
      effectiveInsuranceShare: Money.toDbString(
        effectiveInsuranceShare({
          ...invoice,
          adjustments: items.filter(({ status }) => status === 'POSTED'),
        }),
      ),
      effectivePatientShare: Money.toDbString(balance.liability),
      amountDue: Money.toDbString(balance.balance.gt(0) ? balance.balance : 0),
      patientCredit: Money.toDbString(
        balance.balance.lt(0) ? balance.balance.negated() : 0,
      ),
    };
  }

  async request(
    hospitalId: number,
    invoiceId: number,
    userId: number,
    dto: {
      chargeId: number;
      correctedAmount: string;
      reason: string;
      requestId: string;
      insuranceOnly?: boolean;
      partialDispense?: boolean;
    },
  ) {
    const committedAudits: Record<string, unknown>[] = [];
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;
        const locked = await lockFinancialInvoice(tx, hospitalId, invoiceId);
        if (dto.reason.trim().length < 5)
          throw new BadRequestException('يلزم سبب واضح لا يقل عن خمسة أحرف');
        const requestKey = `adjustment:${hospitalId}:${invoiceId}:${dto.requestId}`;
        if (dto.partialDispense && dto.insuranceOnly)
          throw new BadRequestException('اختر نوع تصحيح واحد');
        const existing = await tx.invoiceAdjustment.findUnique({
          where: { requestKey },
        });
        if (existing) {
          if (
            existing.requestedById !== userId ||
            existing.chargeId !== dto.chargeId ||
            existing.insuranceOnly !== (dto.insuranceOnly === true) ||
            existing.partialDispense !== (dto.partialDispense === true) ||
            !Money.eq(
              existing.insuranceOnly
                ? existing.correctedAmount.minus(locked.patientShare)
                : existing.correctedAmount,
              dto.correctedAmount,
            ) ||
            existing.reason !== dto.reason.trim()
          )
            throw new BadRequestException(
              'أعيد استخدام معرف الطلب ببيانات مختلفة',
            );
          return existing;
        }
        if (dto.partialDispense === true)
          return requestPartialPrescriptionCredit(
            tx,
            locked,
            dto.chargeId,
            dto.correctedAmount,
            userId,
            requestKey,
            dto.reason.trim(),
          );
        if (dto.insuranceOnly === true)
          return requestInsuranceServiceCredit(
            tx,
            locked,
            userId,
            dto.chargeId,
            requestKey,
            dto.correctedAmount,
            dto.reason.trim(),
          );
        const {
          invoice,
          line,
          previous,
          computedAmount,
          prescriptionId,
          insured,
        } = await this.validate(tx, hospitalId, invoiceId, dto.chargeId);
        if (
          await tx.invoiceAdjustment.count({
            where: {
              hospitalId,
              invoiceId,
              chargeId: dto.chargeId,
              status: 'PENDING',
            },
          })
        )
          throw new BadRequestException('يوجد طلب معلق لهذا البند');
        const corrected = Money.decimal(dto.correctedAmount);
        if (prescriptionId !== null && !corrected.isZero())
          throw new BadRequestException(
            'إلغاء الوصفة يتطلب تصفير الرسم كاملًا',
          );
        const delta = corrected.minus(previous);
        if (corrected.lt(0) || corrected.decimalPlaces() > 3 || delta.isZero())
          throw new BadRequestException(
            'المبلغ المصحح غير صالح أو لا يغيّر الرسم',
          );
        const adjustment = await tx.invoiceAdjustment.create({
          data: {
            hospitalId,
            invoiceId,
            chargeId: dto.chargeId,
            requestKey,
            requestedById: userId,
            reason: dto.reason.trim(),
            kind: delta.lt(0) ? 'CREDIT' : 'DEBIT',
            previousAmount: Money.toDbString(previous),
            correctedAmount: Money.toDbString(corrected),
            delta: Money.toDbString(
              insured ? invoice.patientShare.negated() : delta,
            ),
            ...(insured && {
              insuranceDelta: Money.toDbString(
                invoice.insuranceShare.negated(),
              ),
            }),
            snapshot: {
              computedAmount,
              invoiceTotal: Money.toDbString(invoice.totalAmount),
              line,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        const auditEntry = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId,
          action: 'REQUEST_INVOICE_ADJUSTMENT',
          entity: 'InvoiceAdjustment',
          entityId: adjustment.id,
          newValues: {
            invoiceId,
            chargeId: line.id,
            previousAmount: adjustment.previousAmount.toString(),
            correctedAmount: adjustment.correctedAmount.toString(),
            reason: adjustment.reason,
          },
        });
        committedAudits.push(auditEntry);
        return adjustment;
      },
      { maxWait: 10000, timeout: 20000 },
    );
    for (const entry of committedAudits) publishCommittedCriticalAudit(entry);
    return result;
  }

  async review(
    hospitalId: number,
    invoiceId: number,
    adjustmentId: number,
    userId: number,
    action: 'POST' | 'REJECT' | 'CANCEL',
    reason: string,
  ) {
    const committedAudits: Record<string, unknown>[] = [];
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;
        const locked = await lockFinancialInvoice(tx, hospitalId, invoiceId);
        await tx.$queryRaw`SELECT "id" FROM "InvoiceAdjustment" WHERE "id" = ${adjustmentId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        const adjustment = await tx.invoiceAdjustment.findFirst({
          where: { id: adjustmentId, hospitalId, invoiceId },
        });
        if (!adjustment) throw new NotFoundException('طلب التسوية غير موجود');
        if (
          action === 'CANCEL'
            ? adjustment.requestedById !== userId
            : adjustment.requestedById === userId
        )
          throw new ForbiddenException(
            'الإلغاء لمقدم الطلب فقط، والاعتماد أو الرفض يتطلب موظفًا آخر',
          );
        if (reason.trim().length < 5)
          throw new BadRequestException('يلزم توثيق سبب المراجعة');
        const status =
          action === 'POST'
            ? 'POSTED'
            : action === 'REJECT'
              ? 'REJECTED'
              : 'CANCELLED';
        if (
          adjustment.status === status &&
          (action === 'CANCEL' || adjustment.reviewedById === userId)
        )
          return adjustment;
        if (adjustment.status !== 'PENDING')
          throw new BadRequestException('الطلب ليس معلقًا');
        if (action === 'POST' && adjustment.insuranceOnly)
          return postInsuranceServiceCredit(
            tx,
            locked,
            adjustment,
            userId,
            reason.trim(),
          );
        if (action === 'POST' && adjustment.partialDispense)
          return postPartialPrescriptionCredit(
            tx,
            locked,
            adjustment,
            userId,
            reason.trim(),
          );
        let postingEntryId: number | null = null;
        if (action === 'POST') {
          const {
            invoice,
            line,
            previous,
            computedAmount,
            prescriptionId,
            insured,
          } = await this.validate(
            tx,
            hospitalId,
            invoiceId,
            adjustment.chargeId,
          );
          const requestedCalculation = (
            adjustment.snapshot as { computedAmount?: string }
          ).computedAmount;
          if (
            !requestedCalculation ||
            !Money.eq(requestedCalculation, computedAmount)
          )
            throw new BadRequestException(
              'تغير حساب الرسم منذ تقديم الطلب؛ يلزم طلب جديد',
            );
          if (!Money.eq(previous, adjustment.previousAmount))
            throw new BadRequestException(
              'تغير مبلغ البند منذ تقديم الطلب؛ يلزم طلب جديد',
            );
          if (!insured && !Money.isZero(adjustment.insuranceDelta))
            throw new BadRequestException('حصة التأمين غير مؤهلة للتصحيح');
          if (
            prescriptionId !== null &&
            (adjustment.kind !== 'CREDIT' ||
              !Money.isZero(adjustment.correctedAmount) ||
              !Money.eq(
                Money.sumDecimal(adjustment.delta, adjustment.insuranceDelta),
                previous.negated(),
              ) ||
              !Money.eq(
                adjustment.insuranceDelta,
                insured ? invoice.insuranceShare.negated() : 0,
              ) ||
              (insured &&
                !Money.eq(adjustment.delta, invoice.patientShare.negated())))
          )
            throw new BadRequestException('إشعار إلغاء الوصفة غير متسق');
          const entryDate = new Date();
          const { financialYear, period } = await financialPeriod(
            tx,
            hospitalId,
            entryDate,
          );
          const ar = await tx.systemAccountMapping.findFirst({
            where: {
              hospitalId,
              key: 'RECEIVABLE_PATIENTS',
              isActive: true,
              account: { hospitalId, isActive: true },
            },
          });
          const revenue = await tx.account.findFirst({
            where: {
              id: line.revenueAccountId,
              hospitalId,
              isActive: true,
              type: 'REVENUE',
            },
          });
          if (!ar || !revenue)
            throw new BadRequestException(
              'حساب الذمة أو الإيراد الأصلي غير صالح',
            );
          const originalEntry = await tx.accountingEntry.findUniqueOrThrow({
            where: { postingKey: invoicePostingKey(hospitalId, invoiceId) },
            include: { lines: true },
          });
          if (
            !originalEntry.lines.some(
              (item) =>
                item.accountId === ar.accountId && Money.isPositive(item.debit),
            )
          )
            throw new BadRequestException(
              'تغير حساب الذمة الأصلي؛ يلزم مطابقة معتمدة',
            );
          const balance = await adjustmentBalance(
            tx,
            hospitalId,
            invoiceId,
            invoice.patientShare,
            invoice.paidAmount,
          );
          const reservedRefunds = await tx.invoiceRefund.aggregate({
            where: {
              hospitalId,
              invoiceId,
              status: { in: ['PENDING', 'APPROVED', 'DISBURSING'] },
            },
            _sum: { amount: true },
          });
          if (
            Money.isPositive(reservedRefunds._sum.amount) &&
            balance.netPaid
              .minus(balance.liability.plus(adjustment.delta))
              .lt(Money.decimal(reservedRefunds._sum.amount))
          )
            throw new BadRequestException(
              'يلزم حسم حجوزات الاسترداد قبل تقليل الرصيد المتاح لها',
            );
          if (balance.liability.plus(adjustment.delta).lt(0))
            throw new BadRequestException('التصحيح يتجاوز إجمالي الاستحقاق');
          const patientAdjustment = Money.toDbString(adjustment.delta.abs());
          const insurerAdjustment = Money.toDbString(
            adjustment.insuranceDelta.abs(),
          );
          const amount = Money.toDbString(
            Money.sumDecimal(adjustment.delta, adjustment.insuranceDelta).abs(),
          );
          const insurerAccountId = insured
            ? await originalInsurerReceivable(
                tx,
                invoice,
                originalEntry.lines,
                ar.accountId,
                revenue.id,
              )
            : null;
          const credit = adjustment.kind === 'CREDIT';
          const entry = await tx.accountingEntry.create({
            data: {
              hospitalId,
              postingKey: `adjustment:${hospitalId}:${adjustment.id}`,
              sourceModule: 'BILLING',
              sourceId: invoiceId,
              entryDate,
              financialYearId: financialYear.id,
              financialPeriodId: period.id,
              createdById: userId,
              description: `${adjustment.kind} #${adjustment.id} — فاتورة #${invoiceId}`,
              lines: {
                create: [
                  {
                    accountId: revenue.id,
                    debit: credit ? amount : '0',
                    credit: credit ? '0' : amount,
                  },
                  {
                    accountId: ar.accountId,
                    debit: credit ? '0' : patientAdjustment,
                    credit: credit ? patientAdjustment : '0',
                  },
                  ...(insurerAccountId != null
                    ? [
                        {
                          accountId: insurerAccountId,
                          debit: '0',
                          credit: insurerAdjustment,
                        },
                      ]
                    : []),
                ],
              },
            },
          });
          postingEntryId = entry.id;
          if (prescriptionId !== null) {
            await tx.prescription.update({
              where: { id: prescriptionId },
              data: { status: 'CANCELLED' },
            });
            if (insured) {
              await tx.invoice.update({
                where: { id: invoiceId, hospitalId },
                data: { status: 'CANCELLED' },
              });
            }
            const prescriptionAudit = await appendChainedAuditInTransaction(
              tx,
              {
                hospitalId,
                userId,
                action: 'CANCEL_PREPAID_PRESCRIPTION',
                entity: 'Prescription',
                entityId: prescriptionId,
                newValues: { invoiceId, adjustmentId, postingEntryId },
              },
            );
            committedAudits.push(prescriptionAudit);
          }
        }
        const updated = await tx.invoiceAdjustment.update({
          where: { id: adjustment.id },
          data: {
            status,
            ...(action !== 'CANCEL'
              ? {
                  reviewedById: userId,
                  reviewedAt: new Date(),
                  reviewReason: reason.trim(),
                }
              : { reviewReason: reason.trim() }),
            postingEntryId,
            ...(action === 'POST'
              ? {
                  snapshot: {
                    ...(adjustment.snapshot as Prisma.JsonObject),
                    calculationOffset: Money.toDbString(
                      Money.subtractDecimal(
                        adjustment.correctedAmount,
                        (adjustment.snapshot as { computedAmount: string })
                          .computedAmount,
                      ),
                    ),
                  },
                }
              : {}),
          },
        });
        const reviewAudit = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId,
          action: `INVOICE_ADJUSTMENT_${status}`,
          entity: 'InvoiceAdjustment',
          entityId: adjustment.id,
          oldValues: { status: adjustment.status },
          newValues: {
            status,
            postingEntryId,
            reviewReason: reason.trim(),
            delta: adjustment.delta.toString(),
            insuranceDelta: adjustment.insuranceDelta.toString(),
          },
        });
        committedAudits.push(reviewAudit);
        return updated;
      },
      { maxWait: 10000, timeout: 20000 },
    );
    for (const entry of committedAudits) publishCommittedCriticalAudit(entry);
    return result;
  }
}
