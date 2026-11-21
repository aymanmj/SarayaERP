import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/utils/money.util';
import {
  financialPeriod,
  lockFinancialInvoice,
} from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { adjustmentBalance } from './invoice-snapshot';
import {
  fullInsuredPrescriptionCredit,
  paidInvoiceStatuses,
  trackedInsuredInvoice,
} from './insured-prescription-cancellation';
import {
  cashSessionBalance,
  cashTransaction,
  evidence,
  guardCashierMovement,
  lockCashier,
  validAmount,
} from '../cashier/cash-control';

const RESERVED = ['PENDING', 'APPROVED', 'DISBURSING'];
@Injectable()
export class InvoiceRefundsService {
  constructor(private readonly prisma: PrismaService) {}
  worklist(hospitalId: number) {
    return this.prisma.invoiceRefund.findMany({
      where: { hospitalId, status: { in: RESERVED } },
      orderBy: { id: 'desc' },
      take: 100,
      include: {
        invoice: {
          select: { patient: { select: { fullName: true, mrn: true } } },
        },
      },
    });
  }
  private async capacity(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    invoiceId: number,
    adjustmentId: number,
    paymentId: number,
    excludeId?: number,
  ) {
    const invoice = await lockFinancialInvoice(tx, hospitalId, invoiceId);
    const adjustment = await tx.invoiceAdjustment.findFirst({
      where: {
        id: adjustmentId,
        hospitalId,
        invoiceId,
        status: 'POSTED',
        kind: 'CREDIT',
      },
      include: { charge: { select: { sourceId: true, sourceType: true } } },
    });
    const partial =
      adjustment?.partialDispense === true &&
      Money.lt(adjustment.delta, 0) &&
      paidInvoiceStatuses.includes(invoice.status);
    const insured =
      (invoice.status === 'CANCELLED' || partial) &&
      trackedInsuredInvoice(invoice);
    if (
      invoice.type !== 'INVOICE' ||
      (!insured &&
        (!paidInvoiceStatuses.includes(invoice.status) ||
          !Money.isZero(invoice.insuranceShare) ||
          invoice.insuranceProviderId)) ||
      !Money.isZero(invoice.discountAmount)
    )
      throw new BadRequestException(
        'هذه الدورة لاسترداد فواتير نقدية صحيحة دون تأمين أو خصم',
      );
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, hospitalId, invoiceId },
    });
    if (
      !adjustment?.postingEntryId ||
      !payment ||
      payment.isDepositApplication ||
      !['CASH', 'CARD', 'TRANSFER'].includes(payment.method)
    )
      throw new BadRequestException(
        'يلزم إشعار دائن معتمد وإيصال تحصيل أصلي مدعوم من الفاتورة نفسها',
      );
    if (
      insured &&
      ((!partial && !fullInsuredPrescriptionCredit(invoice, adjustment)) ||
        adjustment.charge.sourceType !== 'PHARMACY_PRESCRIPTION' ||
        !(await tx.prescription.findFirst({
          where: {
            id: adjustment.charge.sourceId ?? -1,
            prepaidInvoiceId: invoiceId,
            hospitalId,
            patientId: invoice.patientId,
            encounterId: invoice.encounterId,
            status: partial ? 'PARTIALLY_COMPLETED' : 'CANCELLED',
            dispenses: partial
              ? { some: { partialClosureReason: { not: null } } }
              : { none: {} },
          },
          select: { id: true },
        })))
    )
      throw new BadRequestException(
        'يلزم إشعار مؤمّن معتمد يطابق إلغاء الوصفة أو إقفال صرفها الجزئي',
      );
    const originalPosting = await tx.accountingEntry.findUnique({
      where: { postingKey: `payment:${hospitalId}:${paymentId}` },
    });
    if (
      !originalPosting ||
      (await tx.accountingEntry.count({
        where: {
          hospitalId,
          sourceModule: 'JOURNAL_REVERSAL',
          sourceId: { in: [originalPosting.id, adjustment.postingEntryId] },
        },
      }))
    )
      throw new BadRequestException(
        'قيد التحصيل أو الإشعار الدائن غير موثق أو سبق عكسه',
      );
    const totalReceipts = await tx.payment.aggregate({
      where: { hospitalId, invoiceId },
      _sum: { amount: true },
    });
    if (!Money.eq(totalReceipts._sum.amount, invoice.paidAmount))
      throw new BadRequestException(
        'المدفوعات لا تطابق رصيد الفاتورة؛ يلزم مطابقتها',
      );
    const adjusted = await adjustmentBalance(
      tx,
      hospitalId,
      invoiceId,
      invoice.patientShare,
      invoice.paidAmount,
    );
    const reservations = await tx.invoiceRefund.findMany({
      where: {
        hospitalId,
        invoiceId,
        status: { in: RESERVED },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { amount: true },
    });
    const noteRefunds = await tx.invoiceRefund.findMany({
      where: {
        hospitalId,
        adjustmentId,
        status: { in: [...RESERVED, 'EXECUTED'] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { amount: true },
    });
    const receiptRefunds = await tx.invoiceRefund.findMany({
      where: {
        hospitalId,
        paymentId,
        status: { in: [...RESERVED, 'EXECUTED'] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { amount: true },
    });
    const patient = adjusted.balance
      .negated()
      .minus(Money.sumDecimal(...reservations.map((row) => row.amount)));
    const note = Money.decimal(adjustment.delta)
      .negated()
      .minus(Money.sumDecimal(...noteRefunds.map((row) => row.amount)));
    const receipt = Money.decimal(payment.amount).minus(
      Money.sumDecimal(...receiptRefunds.map((row) => row.amount)),
    );
    const available = [patient, note, receipt].reduce((min, value) =>
      min.lt(value) ? min : value,
    );
    return {
      invoice,
      adjustment,
      payment,
      originalPosting,
      available: available.gt(0) ? available : Money.decimal(0),
    };
  }
  async list(hospitalId: number, invoiceId: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, hospitalId },
    });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    const items = await this.prisma.invoiceRefund.findMany({
      where: { hospitalId, invoiceId },
      orderBy: { id: 'desc' },
    });
    const payments = await this.prisma.payment.findMany({
      where: { hospitalId, invoiceId },
      orderBy: { id: 'asc' },
    });
    const credits = await this.prisma.invoiceAdjustment.findMany({
      where: { hospitalId, invoiceId, status: 'POSTED', kind: 'CREDIT' },
      select: { id: true, delta: true, reason: true },
    });
    const balance = await adjustmentBalance(
      this.prisma,
      hospitalId,
      invoiceId,
      invoice.patientShare,
      invoice.paidAmount,
    );
    const reserved = Money.sumDecimal(
      ...items
        .filter((item) => RESERVED.includes(item.status))
        .map((item) => item.amount),
    );
    const available = balance.balance.negated().minus(reserved);
    return {
      items,
      payments,
      credits,
      refundedAmount: Money.toDbString(balance.refunded),
      patientCredit: Money.toDbString(
        balance.balance.lt(0) ? balance.balance.negated() : 0,
      ),
      reservedAmount: Money.toDbString(reserved),
      availableAmount: Money.toDbString(available.gt(0) ? available : 0),
    };
  }
  async request(
    hospitalId: number,
    invoiceId: number,
    userId: number,
    dto: {
      adjustmentId: number;
      paymentId: number;
      amount: string;
      reason: string;
      requestId: string;
    },
  ) {
    const amount = validAmount(dto.amount);
    const reason = evidence(dto.reason);
    return cashTransaction(
      this.prisma,
      async (tx) => {
        await lockFinancialInvoice(tx, hospitalId, invoiceId);
        const requestKey = `refund:${hospitalId}:${invoiceId}:${dto.requestId}`;
        const previous = await tx.invoiceRefund.findUnique({
          where: { requestKey },
        });
        if (previous) {
          if (
            previous.requestedById !== userId ||
            previous.paymentId !== dto.paymentId ||
            previous.adjustmentId !== dto.adjustmentId ||
            !Money.eq(previous.amount, amount) ||
            previous.reason !== reason
          )
            throw new BadRequestException(
              'معرف الاسترداد مستعمل ببيانات مختلفة',
            );
          return previous;
        }
        const source = await this.capacity(
          tx,
          hospitalId,
          invoiceId,
          dto.adjustmentId,
          dto.paymentId,
        );
        if (source.available.lt(amount))
          throw new BadRequestException(
            'المبلغ يتجاوز الرصيد المتاح بعد حجوزات الاسترداد والإشعار والإيصال',
          );
        const row = await tx.invoiceRefund.create({
          data: {
            hospitalId,
            invoiceId,
            adjustmentId: dto.adjustmentId,
            paymentId: dto.paymentId,
            requestKey,
            requestedById: userId,
            amount,
            method: source.payment.method,
            reason,
            snapshot: {
              invoiceTotal: source.invoice.totalAmount.toString(),
              creditDelta: source.adjustment.delta.toString(),
              paymentAmount: source.payment.amount.toString(),
              paymentMethod: source.payment.method,
              paymentReference: source.payment.reference,
              paymentEntryId: source.originalPosting.id,
            },
          },
        });
        await this.audit(
          tx,
          hospitalId,
          userId,
          'REQUEST_INVOICE_REFUND',
          row.id,
          {
            invoiceId,
            amount,
            paymentId: dto.paymentId,
            adjustmentId: dto.adjustmentId,
            reason,
          },
        );
        return row;
      },
      { maxWait: 10000, timeout: 20000 },
    );
  }
  private audit(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    userId: number,
    action: string,
    id: number,
    details: Prisma.InputJsonObject,
  ) {
    return appendChainedAuditInTransaction(tx, {
      hospitalId,
      userId,
      action,
      entity: 'InvoiceRefund',
      entityId: id,
      details,
    });
  }
  private async locked(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    invoiceId: number,
    id: number,
  ) {
    await lockFinancialInvoice(tx, hospitalId, invoiceId);
    const row = await tx.invoiceRefund.findFirst({
      where: { id, hospitalId, invoiceId },
    });
    if (!row) throw new NotFoundException('طلب الاسترداد غير موجود');
    return row;
  }
  async review(
    hospitalId: number,
    invoiceId: number,
    id: number,
    userId: number,
    action: 'APPROVE' | 'REJECT' | 'CANCEL',
    reason: string,
  ) {
    reason = evidence(reason);
    return cashTransaction(
      this.prisma,
      async (tx) => {
        const row = await this.locked(tx, hospitalId, invoiceId, id);
        if (
          action === 'CANCEL'
            ? row.requestedById !== userId
            : row.requestedById === userId
        )
          throw new ForbiddenException(
            'الموافقة أو الرفض لموظف آخر، والإلغاء لمقدم الطلب',
          );
        const status =
          action === 'APPROVE'
            ? 'APPROVED'
            : action === 'REJECT'
              ? 'REJECTED'
              : 'CANCELLED';
        if (
          row.status === status &&
          (action === 'CANCEL' || row.reviewedById === userId)
        )
          return row;
        if (
          row.status !== 'PENDING' &&
          !(action === 'CANCEL' && row.status === 'APPROVED')
        )
          throw new BadRequestException('حالة الطلب لا تسمح بهذا الإجراء');
        if (
          action === 'APPROVE' &&
          (
            await this.capacity(
              tx,
              hospitalId,
              invoiceId,
              row.adjustmentId,
              row.paymentId,
              id,
            )
          ).available.lt(row.amount)
        )
          throw new BadRequestException('الرصيد المتاح لم يعد كافيًا');
        const updated = await tx.invoiceRefund.update({
          where: { id },
          data: {
            status,
            ...(action !== 'CANCEL'
              ? {
                  reviewedById: userId,
                  reviewReason: reason,
                  approvedAt: action === 'APPROVE' ? new Date() : null,
                }
              : {
                  snapshot: {
                    ...(row.snapshot as Prisma.JsonObject),
                    cancellationReason: reason,
                  },
                }),
          },
        });
        await this.audit(
          tx,
          hospitalId,
          userId,
          `INVOICE_REFUND_${status}`,
          id,
          { invoiceId, amount: row.amount.toString(), reason },
        );
        return updated;
      },
      { maxWait: 10000, timeout: 20000 },
    );
  }
  private async payoutAccounts(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    method: string,
    originalEntryId: number,
  ) {
    const cashKey = method === 'CASH' ? 'CASH_MAIN' : 'BANK_MAIN';
    const outgoing = await tx.systemAccountMapping.findFirst({
      where: {
        hospitalId,
        key: cashKey,
        isActive: true,
        account: { hospitalId, isActive: true },
      },
    });
    const ar = await tx.systemAccountMapping.findFirst({
      where: {
        hospitalId,
        key: 'RECEIVABLE_PATIENTS',
        isActive: true,
        account: { hospitalId, isActive: true },
      },
    });
    if (!outgoing || !ar)
      throw new BadRequestException('حساب الصندوق أو البنك أو الذمة غير صالح');
    const originalLines = await tx.accountingEntryLine.findMany({
      where: { entryId: originalEntryId },
    });
    if (
      !originalLines.some(
        (line) =>
          line.accountId === outgoing.accountId && Money.isPositive(line.debit),
      ) ||
      !originalLines.some(
        (line) =>
          line.accountId === ar.accountId && Money.isPositive(line.credit),
      )
    )
      throw new BadRequestException(
        'تغيرت حسابات التحصيل الأصلية؛ يلزم إجراء مطابقة قبل الاسترداد',
      );
    return { outgoing, ar };
  }
  async prepare(
    hospitalId: number,
    invoiceId: number,
    id: number,
    userId: number,
    requestId: string,
  ) {
    return cashTransaction(this.prisma, async (tx) => {
      const row = await this.locked(tx, hospitalId, invoiceId, id);
      if (row.status === 'DISBURSING' && row.assignedExecutorId === userId)
        return row;
      if (
        row.status !== 'APPROVED' ||
        !row.reviewedById ||
        row.reviewedById === userId
      )
        throw new ForbiddenException('يلزم اعتماد مستقل قبل حجز الصرف');
      const source = await this.capacity(
        tx,
        hospitalId,
        invoiceId,
        row.adjustmentId,
        row.paymentId,
        id,
      );
      if (source.available.lt(row.amount))
        throw new BadRequestException('الرصيد المتاح لم يعد كافيًا');
      const { session, at } = await guardCashierMovement(
        tx,
        hospitalId,
        userId,
        row.method === 'CASH',
      );
      if (
        row.method === 'CASH' &&
        (!session ||
          (await cashSessionBalance(tx, session.id)).available.lt(row.amount))
      )
        throw new BadRequestException('النقد المتاح لا يكفي لحجز الصرف');
      await financialPeriod(tx, hospitalId, at);
      await this.payoutAccounts(
        tx,
        hospitalId,
        row.method,
        source.originalPosting.id,
      );
      const updated = await tx.invoiceRefund.update({
        where: { id },
        data: {
          status: 'DISBURSING',
          assignedExecutorId: userId,
          claimedAt: at,
          claimRequestKey: `refund-claim:${hospitalId}:${requestId}`,
          sessionId: row.method === 'CASH' ? session!.id : null,
        },
      });
      await this.audit(tx, hospitalId, userId, 'PREPARE_INVOICE_REFUND', id, {
        invoiceId,
        sessionId: updated.sessionId,
        amount: row.amount.toString(),
      });
      return updated;
    });
  }
  async release(
    hospitalId: number,
    invoiceId: number,
    id: number,
    userId: number,
    reason: string,
    confirmedNotPaid: boolean,
  ) {
    reason = evidence(reason);
    if (confirmedNotPaid !== true)
      throw new BadRequestException(
        'يلزم التأكد من عدم صرف المبلغ قبل تحرير الحجز',
      );
    return cashTransaction(this.prisma, async (tx) => {
      const row = await this.locked(tx, hospitalId, invoiceId, id);
      if (row.reviewedById !== userId || row.assignedExecutorId === userId)
        throw new ForbiddenException('تحرير الحجز للمعتمد المستقل فقط');
      if (
        row.status === 'CANCELLED' &&
        row.releasedById === userId &&
        row.releaseReason === reason
      )
        return row;
      if (row.status !== 'DISBURSING' || !row.assignedExecutorId)
        throw new BadRequestException('لا يوجد حجز صرف جارٍ');
      await lockCashier(tx, hospitalId, row.assignedExecutorId, false);
      const updated = await tx.invoiceRefund.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          releasedById: userId,
          releaseReason: reason,
          releasedAt: new Date(),
        },
      });
      await this.audit(tx, hospitalId, userId, 'RELEASE_UNPAID_REFUND', id, {
        invoiceId,
        reason,
        confirmedNotPaid: true,
      });
      return updated;
    });
  }
  async execute(
    hospitalId: number,
    invoiceId: number,
    id: number,
    userId: number,
    dto: {
      reference: string;
      evidence: string;
      requestId: string;
      confirmedPaid: boolean;
    },
  ) {
    const reference = evidence(dto.reference);
    const proof = evidence(dto.evidence);
    if (dto.confirmedPaid !== true)
      throw new BadRequestException('يلزم تأكيد تنفيذ الدفع واستلام المستفيد');
    return cashTransaction(
      this.prisma,
      async (tx) => {
        const row = await this.locked(tx, hospitalId, invoiceId, id);
        if (row.status === 'EXECUTED') {
          if (
            row.executedById !== userId ||
            row.executionReference !== reference ||
            row.executionEvidence !== proof
          )
            throw new BadRequestException(
              'الاسترداد منفذ ولا يمكن تغيير إثباته',
            );
          return row;
        }
        if (
          row.status !== 'DISBURSING' ||
          row.assignedExecutorId !== userId ||
          !row.reviewedById ||
          row.reviewedById === userId
        )
          throw new ForbiddenException(
            'التنفيذ يحتاج طلبًا معتمدًا ومنفذًا غير المعتمد',
          );
        const source = await this.capacity(
          tx,
          hospitalId,
          invoiceId,
          row.adjustmentId,
          row.paymentId,
          id,
        );
        if (
          source.available.lt(row.amount) ||
          source.payment.method !== row.method
        )
          throw new BadRequestException(
            'تغير الرصيد أو طريقة التحصيل الأصلية؛ لا يمكن التنفيذ',
          );
        const { session, at } = await guardCashierMovement(
          tx,
          hospitalId,
          userId,
          row.method === 'CASH',
        );
        if (
          row.method === 'CASH' &&
          (!session ||
            session.id !== row.sessionId ||
            (await cashSessionBalance(tx, session.id)).available.lt(0))
        )
          throw new BadRequestException(
            'النقد المتاح في جلسة الصندوق لا يكفي للصرف',
          );
        const { financialYear, period } = await financialPeriod(
          tx,
          hospitalId,
          at,
        );
        const { outgoing, ar } = await this.payoutAccounts(
          tx,
          hospitalId,
          row.method,
          source.originalPosting.id,
        );
        const entry = await tx.accountingEntry.create({
          data: {
            hospitalId,
            postingKey: `refund:${hospitalId}:${id}`,
            sourceModule: 'PATIENT_REFUND',
            sourceId: id,
            entryDate: at,
            financialYearId: financialYear.id,
            financialPeriodId: period.id,
            createdById: userId,
            description: `استرداد مثبت #${id} — إيصال #${row.paymentId}`,
            lines: {
              create: [
                { accountId: ar.accountId, debit: row.amount, credit: 0 },
                { accountId: outgoing.accountId, debit: 0, credit: row.amount },
              ],
            },
          },
        });
        const updated = await tx.invoiceRefund.update({
          where: { id },
          data: {
            status: 'EXECUTED',
            executedById: userId,
            executedAt: at,
            executionReference: reference,
            executionEvidence: proof,
            executionKey: `refund-proof:${hospitalId}:${row.method}:${reference}`,
            executionRequestKey: `refund-execution:${hospitalId}:${dto.requestId}`,
            postingEntryId: entry.id,
            sessionId: row.method === 'CASH' ? session!.id : null,
          },
        });
        await this.audit(tx, hospitalId, userId, 'EXECUTE_INVOICE_REFUND', id, {
          invoiceId,
          paymentId: row.paymentId,
          adjustmentId: row.adjustmentId,
          amount: row.amount.toString(),
          method: row.method,
          reference,
          evidence: proof,
          postingEntryId: entry.id,
          sessionId: updated.sessionId,
        });
        return updated;
      },
      { maxWait: 10000, timeout: 20000 },
    );
  }
}
