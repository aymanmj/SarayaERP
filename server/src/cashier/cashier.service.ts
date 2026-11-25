import { financialPeriod } from '../accounting/financial-posting';
import { guardCashierMovement, lockCashier } from './cash-control';
import {
  adjustmentBalance,
  effectivePatientShare,
  effectiveInsuranceShare,
  totalInvoiceAdjustment,
  netPaidAmount,
} from '../billing/invoice-snapshot';
import { lockFinancialInvoice } from '../accounting/financial-posting';
import { Money, type FinancialDecimal } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  assertPrescriptionCollectionAvailable,
  currentPrescriptionAuthorization,
  pendingPrescriptionCancellation,
} from '../pharmacy/prescription-prepayment';
// src/cashier/cashier.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Invoice,
  InvoiceStatus,
  PaymentMethod,
  ChargeSource,
  SystemAccountKey,
  AccountingSourceModule,
  Prisma,
  PaymentStatus,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';

// ... (نفس الـ Types السابقة تماماً) ...
type PharmacyInvoiceItemDto = {
  id: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  isSubstitute: boolean;
  dispensedDrug: {
    id: number;
    code: string | null;
    name: string;
    strength: string | null;
    form: string | null;
  } | null;
  originalDrug: {
    id: number;
    code: string | null;
    name: string;
    strength: string | null;
    form: string | null;
  } | null;
};

type InvoiceLineDetailDto = {
  id: number;
  description: string;
  serviceCode: string | null;
  serviceType: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  pharmacyItems?: PharmacyInvoiceItemDto[];
};

export type PaymentReceiptDto = {
  payment: {
    id: number;
    amount: number;
    method: PaymentMethod;
    paidAt: Date;
    reference: string | null;
  } | null;
  invoice: {
    id: number;
    status: InvoiceStatus;
    totalAmount: number;
    discountAmount: number;
    paidAmount: number;
    remainingAmount: number;
    currency: string;
    createdAt: Date;
  };
  patient: { id: number; fullName: string; mrn: string } | null;
  encounter: { id: number; type: string } | null;
};

@Injectable()
export class CashierService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  private mapInvoiceToWorklistDto(
    inv: Pick<
      Invoice,
      | 'id'
      | 'status'
      | 'totalAmount'
      | 'discountAmount'
      | 'paidAmount'
      | 'patientShare'
      | 'insuranceShare'
      | 'claimStatus'
      | 'createdAt'
    > & {
      prepaidPrescription?: { id: number } | null;
      adjustments?: {
        delta: Prisma.Decimal;
        insuranceDelta?: Prisma.Decimal;
      }[];
      refunds?: { amount: Prisma.Decimal }[];
      patient: {
        id: number;
        fullName: string;
        mrn: string;
        insurancePolicy?: { name: string; provider: { name: string } } | null;
      } | null;
      encounter: { id: number; type: string } | null;
    },
  ) {
    const totalAmount = Money.fromPrisma(inv.totalAmount);
    const discountAmount = Money.fromPrisma(inv.discountAmount);
    const paidAmount = Money.fromPrisma(inv.paidAmount);
    const refunded = Money.sumDecimal(
      ...(inv.refunds ?? []).map((item) => item.amount),
    );
    const correction = totalInvoiceAdjustment(inv.adjustments ?? []);
    return {
      id: inv.id,
      ...(inv.prepaidPrescription && {
        prescriptionId: inv.prepaidPrescription.id,
      }),
      status: inv.status,
      totalAmount,
      discountAmount,
      paidAmount,
      refundedAmount: Money.toDb(refunded),
      netPaidAmount: Money.toDb(Money.decimal(paidAmount).minus(refunded)),
      remainingAmount: Money.toDb(
        Money.sumDecimal(totalAmount, correction)
          .minus(discountAmount)
          .minus(paidAmount)
          .plus(refunded),
      ),
      originalPatientShare: Money.fromPrisma(inv.patientShare),
      adjustmentAmount: Money.toDb(correction),
      patientShare: Money.toDb(effectivePatientShare(inv)),
      insuranceShare: Money.toDb(effectiveInsuranceShare(inv)),
      claimStatus: inv.claimStatus,
      createdAt: inv.createdAt,
      patient: inv.patient,
      encounter: inv.encounter,
    };
  }

  async getWorklist(hospitalId: number) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        hospitalId,
        adjustments: { none: pendingPrescriptionCancellation },
        OR: [
          { prepaidPrescription: null },
          { prepaidPrescription: { preAuthorizationId: null } },
          {
            prepaidPrescription: {
              preAuthorization: {
                hospitalId,
                ...currentPrescriptionAuthorization(),
              },
            },
          },
        ],
        status: {
          in: [
            InvoiceStatus.DRAFT,
            InvoiceStatus.ISSUED,
            InvoiceStatus.PARTIALLY_PAID,
            InvoiceStatus.PAID,
          ],
        },
      },
      include: {
        prepaidPrescription: { select: { id: true } },
        patient: {
          select: {
            id: true,
            fullName: true,
            mrn: true,
            insurancePolicy: {
              select: {
                name: true,
                provider: { select: { name: true } },
              },
            },
          },
        },
        adjustments: {
          where: { status: 'POSTED' },
          select: { delta: true, insuranceDelta: true },
        },
        refunds: { where: { status: 'EXECUTED' }, select: { amount: true } },
        encounter: { select: { id: true, type: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const result: ReturnType<CashierService['mapInvoiceToWorklistDto']>[] = [];

    for (const inv of invoices) {
      const dto = this.mapInvoiceToWorklistDto(inv);

      const patientRemaining = effectivePatientShare(inv).minus(
        netPaidAmount(inv),
      );

      if (patientRemaining.gt(0)) {
        result.push(dto);
      }
      // حالة خاصة: إذا كانت حصة المريض 0 (مغطى بالكامل) وحالة الفاتورة DRAFT أو ISSUED
      // نعرضها لكي يقوم الكاشير بتأكيدها (Zero Payment)
      else if (
        dto.patientShare === 0 &&
        (inv.status === InvoiceStatus.DRAFT ||
          inv.status === InvoiceStatus.ISSUED)
      ) {
        result.push(dto);
      }
    }

    return result;
  }

  async recordPayment(params: {
    hospitalId: number;
    invoiceId: number;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    requestId?: string;
    userId: number;
    ipAddress?: string;
    clientName?: string;
  }) {
    const {
      hospitalId,
      invoiceId,
      amount,
      method,
      reference,
      requestId,
      userId,
      ipAddress,
      clientName,
    } = params;
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      Money.decimal(amount).decimalPlaces() > 3
    )
      throw new BadRequestException(
        'قيمة التحصيل يجب أن تكون غير سالبة وبدقة ثلاث منازل كحد أقصى',
      );
    if (!['CASH', 'CARD', 'TRANSFER'].includes(method))
      throw new BadRequestException('طريقة التحصيل غير مدعومة');
    if (
      requestId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestId,
      )
    )
      throw new BadRequestException('معرف طلب التحصيل غير صالح');
    let committedAudit: Record<string, unknown> | null = null;
    const result = await this.prisma.$transaction(
      async (tx) => {
        committedAudit = null;
        const invoice = await lockFinancialInvoice(tx, hospitalId, invoiceId);
        const response = (
          paid: {
            id: number;
            status: InvoiceStatus;
            totalAmount: Prisma.Decimal;
            discountAmount: Prisma.Decimal;
            paidAmount: Prisma.Decimal;
          },
          paymentId: number | null,
        ) => ({
          id: paid.id,
          status: paid.status,
          totalAmount: Money.fromPrisma(paid.totalAmount),
          discountAmount: Money.fromPrisma(paid.discountAmount),
          paidAmount: Money.fromPrisma(paid.paidAmount),
          paymentId,
        });
        const requestKey = requestId
          ? 'payment:' + hospitalId + ':' + invoiceId + ':' + requestId
          : null;
        if (requestKey) {
          const existing = await tx.payment.findUnique({
            where: { requestKey },
          });
          if (existing) {
            if (
              !Money.eq(existing.amount, amount) ||
              existing.method !== method ||
              existing.reference !== (reference ?? null)
            )
              throw new BadRequestException(
                'أعيد استخدام معرف التحصيل ببيانات مختلفة',
              );
            return response(invoice, existing.id);
          }
        }
        if (
          invoice.type !== 'INVOICE' ||
          !['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status)
        )
          throw new BadRequestException(
            'حالة الفاتورة أو نوعها لا يسمحان بالتحصيل',
          );
        await assertPrescriptionCollectionAvailable(tx, invoice);
        if (
          await tx.invoice.count({
            where: {
              hospitalId,
              originalInvoiceId: invoiceId,
              type: 'CREDIT_NOTE',
              status: { not: 'CANCELLED' },
            },
          })
        )
          throw new BadRequestException(
            'الفاتورة مرتبطة بإشعار دائن؛ يجب مطابقة التسوية قبل التحصيل',
          );
        const stored = await tx.payment.aggregate({
          where: { hospitalId, invoiceId },
          _sum: { amount: true },
        });
        if (!Money.eq(stored._sum.amount ?? 0, invoice.paidAmount))
          throw new BadRequestException(
            'رصيد المدفوعات لا يطابق سجل التحصيل؛ يلزم إجراء مطابقة',
          );
        const total = Money.subtractDecimal(
          invoice.totalAmount,
          invoice.discountAmount,
        );
        const shares = Money.sumDecimal(
          invoice.patientShare,
          invoice.insuranceShare,
        );
        if (
          total.isNegative() ||
          !Money.eq(total, shares) ||
          Money.isNegative(invoice.patientShare) ||
          Money.isNegative(invoice.insuranceShare)
        )
          throw new BadRequestException(
            'حصص الفاتورة أو الخصم غير متسقة؛ يلزم تصحيح معتمد',
          );
        const adjusted = await adjustmentBalance(
          tx,
          hospitalId,
          invoiceId,
          invoice.patientShare,
          invoice.paidAmount,
        );
        const remaining = adjusted.balance;
        if (remaining.isNegative() || Money.gt(amount, remaining))
          throw new BadRequestException(
            'قيمة التحصيل تتجاوز المستحق على المريض',
          );
        if (amount === 0 && remaining.gt(0))
          throw new BadRequestException(
            'لا يمكن تأكيد سداد صفري مع وجود رصيد على المريض',
          );
        let sessionId: number | null = null;
        let paidAt = new Date();
        if (amount > 0) {
          const movement = await guardCashierMovement(
            tx,
            hospitalId,
            userId,
            method === 'CASH' ? 'IF_CONTROLLED' : false,
          );
          sessionId = method === 'CASH' ? (movement.session?.id ?? null) : null;
          paidAt = movement.at;
        }
        await this.accounting.recordInvoiceEntry({
          invoiceId,
          hospitalId,
          userId,
          prisma: tx,
        });
        const newPaid = Money.sumDecimal(invoice.paidAmount, amount);
        const newNetPaid = newPaid.minus(adjusted.refunded);
        const status = Money.eq(newNetPaid, total.plus(adjusted.delta))
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID;
        const payment =
          amount === 0
            ? null
            : await tx.payment.create({
                data: {
                  hospitalId,
                  invoiceId,
                  amount: Money.toDbString(amount),
                  method,
                  reference: reference ?? null,
                  requestKey,
                  sessionId,
                  paidAt,
                  cashierId: userId,
                },
              });
        const updated = await tx.invoice.update({
          where: { id: invoiceId, hospitalId },
          data: { paidAmount: Money.toDbString(newPaid), status },
        });
        if (payment)
          await this.accounting.recordPaymentEntry({
            paymentId: payment.id,
            hospitalId,
            userId,
            prisma: tx,
          });
        if (Money.gte(newNetPaid, adjusted.liability))
          await this.updateRelatedOrdersPaymentStatus(tx, invoiceId);
        const auditFields = {
          hospitalId,
          userId,
          action: 'RECORD_PATIENT_PAYMENT',
          entity: 'Invoice',
          entityId: invoiceId,
          ipAddress: ipAddress ?? null,
          clientName: clientName ?? null,
          details: {
            invoiceId,
            paymentId: payment?.id ?? null,
            amount: Money.toDbString(amount),
            method,
            reference: reference ?? null,
            requestKey,
            status: updated.status,
          },
        };
        await appendChainedAuditInTransaction(tx, auditFields);
        committedAudit = auditFields;
        return response(updated, payment?.id ?? null);
      },
      { maxWait: 10000, timeout: 20000 },
    );
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
  }

  async getInvoiceDetails(hospitalId: number, invoiceId: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, hospitalId },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            mrn: true,
            insurancePolicy: { include: { provider: true } },
          },
        },
        adjustments: {
          where: { status: 'POSTED' },
          select: { delta: true, insuranceDelta: true },
        },
        refunds: { where: { status: 'EXECUTED' }, select: { amount: true } },
        encounter: { select: { id: true, type: true } },
        charges: {
          include: { serviceItem: true },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة.');

    const totalAmount = Money.toDb(invoice.totalAmount);
    const discountAmount = Money.toDb(invoice.discountAmount);
    const paidAmount = Money.toDb(invoice.paidAmount);
    const correctedShare = effectivePatientShare(invoice);
    const correctedInsuranceShare = effectiveInsuranceShare(invoice);
    const remainingAmount = Money.toDb(
      correctedShare
        .plus(correctedInsuranceShare)
        .minus(netPaidAmount(invoice)),
    );

    // --- Pharmacy breakdown ---
    const dispenseIds = invoice.charges
      .filter((ch) => ch.sourceType === ChargeSource.PHARMACY && ch.sourceId)
      .map((c) => c.sourceId as number);

    type DispenseItemWithProducts = Prisma.DispenseItemGetPayload<{
      include: {
        product: true;
        prescriptionItem: { include: { product: true } };
      };
    }>;

    const itemsByDispense = new Map<number, DispenseItemWithProducts[]>();

    if (dispenseIds.length > 0) {
      const dispenseItems = await this.prisma.dispenseItem.findMany({
        where: { dispenseRecordId: { in: dispenseIds } },
        include: {
          product: true,
          prescriptionItem: { include: { product: true } },
        },
      });

      for (const it of dispenseItems) {
        const list = itemsByDispense.get(it.dispenseRecordId) ?? [];
        list.push(it);
        itemsByDispense.set(it.dispenseRecordId, list);
      }
    }

    const lines: InvoiceLineDetailDto[] = invoice.charges.map((ch) => {
      const line: InvoiceLineDetailDto = {
        id: ch.id,
        description:
          ch.sourceType === ChargeSource.PHARMACY_PRESCRIPTION
            ? `وصفة صيدلية #${ch.sourceId}`
            : (ch.serviceItem?.name ?? 'خدمة'),
        serviceCode: ch.serviceItem?.code ?? null,
        serviceType: ch.serviceItem?.type ?? null,
        quantity: Number(ch.quantity ?? 1),
        unitPrice: Money.toDb(ch.unitPrice ?? 0),
        totalAmount: Money.toDb(ch.totalAmount ?? 0),
      };

      if (ch.sourceType === ChargeSource.PHARMACY && ch.sourceId) {
        const dItems = itemsByDispense.get(ch.sourceId) ?? [];
        line.pharmacyItems = dItems.map(
          (it): PharmacyInvoiceItemDto => ({
            id: it.id,
            quantity: Number(it.quantity),
            unitPrice: Money.toDb(it.unitPrice ?? 0),
            totalAmount: Money.toDb(it.totalAmount ?? 0),
            isSubstitute: Boolean(
              it.prescriptionItem &&
                it.productId !== it.prescriptionItem.productId,
            ),
            dispensedDrug: it.product,
            originalDrug: it.prescriptionItem?.product ?? null,
          }),
        );
      }
      return line;
    });

    return {
      invoice: {
        id: invoice.id,
        status: invoice.status,
        totalAmount,
        discountAmount,
        paidAmount,
        remainingAmount,
        currency: invoice.currency,
        createdAt: invoice.createdAt,
        refundedAmount: Money.toDb(
          Money.sumDecimal(
            ...(invoice.refunds ?? []).map((item) => item.amount),
          ),
        ),
        netPaidAmount: Money.toDb(netPaidAmount(invoice)),
        originalPatientShare: Money.toDb(invoice.patientShare),
        adjustmentAmount: Money.toDb(
          totalInvoiceAdjustment(invoice.adjustments ?? []),
        ),
        patientShare: Money.toDb(correctedShare),
        insuranceShare: Money.toDb(correctedInsuranceShare),
        patient: invoice.patient,
        encounter: invoice.encounter
          ? { id: invoice.encounter.id, type: invoice.encounter.type }
          : null,
      },
      lines,
    };
  }

  // ... (بقية الدوال: getPatientStatement, getPaymentReceipt, getDailyReport, listCashierUsers, getCashierUserReport, closeCashierShift, listCashierShifts)
  async getPatientStatement(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId },
      select: { id: true, fullName: true, mrn: true },
    });
    if (!patient) throw new NotFoundException('المريض غير موجود.');

    const invoices = await this.prisma.invoice.findMany({
      where: { hospitalId, patientId },
      include: {
        adjustments: {
          where: { status: 'POSTED' },
          select: { delta: true, insuranceDelta: true },
        },
        refunds: { where: { status: 'EXECUTED' }, select: { amount: true } },
        encounter: { select: { id: true, type: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const payments = await this.prisma.payment.findMany({
      where: { hospitalId, invoice: { patientId } },
      include: { invoice: { select: { id: true, createdAt: true } } },
      orderBy: { paidAt: 'asc' },
    });

    const refundRows = await this.prisma.invoiceRefund.findMany({
      where: { hospitalId, invoice: { patientId }, status: 'EXECUTED' },
      select: {
        id: true,
        invoiceId: true,
        paymentId: true,
        amount: true,
        method: true,
        executedAt: true,
        executionReference: true,
      },
      orderBy: { executedAt: 'asc' },
    });
    const invoiceDtos = invoices.map((inv) => {
      const correction = totalInvoiceAdjustment(inv.adjustments ?? []);
      const totalDec = Money.sumDecimal(inv.totalAmount, correction);
      const discountDec = Money.decimal(inv.discountAmount ?? 0);
      const paidDec = netPaidAmount(inv);
      const remainingDec = Money.subtractDecimal(
        Money.subtractDecimal(totalDec, discountDec),
        paidDec,
      );
      return {
        id: inv.id,
        status: inv.status,
        totalAmount: Money.toDb(totalDec),
        originalTotalAmount: Money.toDb(inv.totalAmount),
        adjustmentAmount: Money.toDb(correction),
        discountAmount: Money.toDb(discountDec),
        paidAmount: Money.toDb(paidDec),
        remainingAmount: Money.toDb(remainingDec),
        createdAt: inv.createdAt,
        encounter: inv.encounter,
      };
    });

    const paymentDtos = payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      amount: Money.toDb(p.amount),
      method: p.method,
      reference: p.reference,
      paidAt: p.paidAt,
      invoice: p.invoice,
    }));

    // حساب الإجماليات بدقة Money
    const totalInvoicedDec = Money.sumDecimal(
      ...invoiceDtos.map((i) => i.totalAmount),
    );
    const totalDiscountDec = Money.sumDecimal(
      ...invoiceDtos.map((i) => i.discountAmount),
    );
    const totalPaidDec = Money.sumDecimal(
      ...invoiceDtos.map((i) => i.paidAmount),
    );
    const remainingDec = Money.subtractDecimal(
      Money.subtractDecimal(totalInvoicedDec, totalDiscountDec),
      totalPaidDec,
    );

    return {
      patient,
      summary: {
        totalInvoiced: Money.toDb(totalInvoicedDec),
        totalDiscount: Money.toDb(totalDiscountDec),
        totalPaid: Money.toDb(totalPaidDec),
        grossCollected: Money.toDb(
          Money.sumDecimal(...payments.map((p) => p.amount)),
        ),
        totalRefunded: Money.toDb(
          Money.sumDecimal(...refundRows.map((p) => p.amount)),
        ),
        remaining: Money.toDb(remainingDec),
      },
      invoices: invoiceDtos,
      payments: paymentDtos,
      refunds: refundRows,
    };
  }

  async getPaymentReceipt(hospitalId: number, paymentId: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, hospitalId },
      include: {
        invoice: {
          include: {
            patient: { select: { id: true, fullName: true, mrn: true } },
            adjustments: {
              where: { status: 'POSTED' },
              select: { delta: true },
            },
            refunds: {
              where: { status: 'EXECUTED' },
              select: { amount: true },
            },
            encounter: { select: { id: true, type: true } },
          },
        },
      },
    });

    if (!payment) throw new NotFoundException('الدفعة غير موجودة.');
    const inv = payment.invoice;

    const correction = totalInvoiceAdjustment(inv.adjustments ?? []);
    const refunded = Money.sumDecimal(
      ...(inv.refunds ?? []).map((item) => item.amount),
    );
    const totalAmountDec = Money.sumDecimal(inv.totalAmount, correction);
    const discountAmountDec = Money.decimal(inv.discountAmount ?? 0);
    const netPaidDec = netPaidAmount(inv);
    const remainingAmountDec = Money.subtractDecimal(
      Money.subtractDecimal(totalAmountDec, discountAmountDec),
      netPaidDec,
    );

    return {
      payment: {
        id: payment.id,
        amount: Money.toDb(payment.amount),
        method: payment.method,
        paidAt: payment.paidAt,
        reference: payment.reference ?? null,
      },
      invoice: {
        id: inv.id,
        status: inv.status,
        totalAmount: Money.toDb(totalAmountDec),
        originalTotalAmount: Money.toDb(inv.totalAmount),
        adjustmentAmount: Money.toDb(correction),
        discountAmount: Money.toDb(discountAmountDec),
        paidAmount: Money.toDb(netPaidDec),
        refundedAmount: Money.toDb(refunded),
        remainingAmount: Money.toDb(remainingAmountDec),
        currency: inv.currency,
        createdAt: inv.createdAt,
      },
      patient: inv.patient,
      encounter: inv.encounter,
    };
  }

  async getDailyReport(hospitalId: number, params: { start: Date; end: Date }) {
    const { start, end } = params;

    const paymentsAgg = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { hospitalId, paidAt: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const refundRows = await this.prisma.invoiceRefund.findMany({
      where: {
        hospitalId,
        status: 'EXECUTED',
        executedAt: { gte: start, lte: end },
      },
      orderBy: { executedAt: 'asc' },
    });
    const refunded = Money.sumDecimal(...refundRows.map((row) => row.amount));
    const refundedCash = Money.sumDecimal(
      ...refundRows
        .filter((row) => row.method === 'CASH')
        .map((row) => row.amount),
    );
    const totalPaymentsAmountDec = Money.sumDecimal(
      ...paymentsAgg.map((r) => r._sum.amount ?? 0),
    );
    const totalPaymentsCount = paymentsAgg.reduce(
      (s, r) => s + (r._count._all ?? 0),
      0,
    );

    const paymentsByMethod = paymentsAgg.map((row) => ({
      method: row.method,
      totalAmount: Money.toDb(row._sum.amount ?? 0),
      count: row._count._all ?? 0,
    }));

    const invoicesAgg = await this.prisma.invoice.aggregate({
      where: { hospitalId, createdAt: { gte: start, lte: end } },
      _sum: { totalAmount: true, discountAmount: true, paidAmount: true },
      _count: { _all: true },
    });

    const tInvDec = Money.decimal(invoicesAgg._sum.totalAmount ?? 0);
    const tDiscDec = Money.decimal(invoicesAgg._sum.discountAmount ?? 0);
    const tPaidDec = Money.decimal(invoicesAgg._sum.paidAmount ?? 0);
    const tRemDec = Money.subtractDecimal(
      Money.subtractDecimal(tInvDec, tDiscDec),
      tPaidDec,
    );

    return {
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
      paymentsSummary: {
        totalAmount: Money.toDb(totalPaymentsAmountDec),
        totalCount: totalPaymentsCount,
      },
      paymentsByMethod,
      refunds: refundRows,
      refundsSummary: {
        totalAmount: Money.toDb(refunded),
        cashAmount: Money.toDb(refundedCash),
        totalCount: refundRows.length,
      },
      netPaymentsSummary: {
        totalAmount: Money.toDb(
          Money.subtractDecimal(totalPaymentsAmountDec, refunded),
        ),
      },
      invoicesSummary: {
        invoiceCount: invoicesAgg._count._all,
        totalInvoiced: Money.toDb(tInvDec),
        totalDiscount: Money.toDb(tDiscDec),
        totalPaid: Money.toDb(tPaidDec),
        totalRemaining: Money.toDb(tRemDec),
      },
    };
  }

  async listCashierUsers(hospitalId: number) {
    return this.prisma.user.findMany({
      where: { hospitalId, isActive: true },
      select: { id: true, fullName: true, username: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async getCashierUserReport(
    hospitalId: number,
    cashierId: number,
    params: { start: Date; end: Date },
  ) {
    const { start, end } = params;
    const cashier = await this.prisma.user.findFirst({
      where: { id: cashierId, hospitalId, isActive: true },
      select: { id: true, fullName: true, username: true },
    });
    if (!cashier) throw new NotFoundException('الكاشير غير موجود.');

    const payments = await this.prisma.payment.findMany({
      where: { hospitalId, cashierId, paidAt: { gte: start, lte: end } },
      include: {
        invoice: {
          select: {
            id: true,
            patient: { select: { id: true, fullName: true, mrn: true } },
          },
        },
      },
      orderBy: { paidAt: 'asc' },
    });

    const refundRows = await this.prisma.invoiceRefund.findMany({
      where: {
        hospitalId,
        executedById: cashierId,
        status: 'EXECUTED',
        executedAt: { gte: start, lte: end },
      },
      orderBy: { executedAt: 'asc' },
    });
    const refunded = Money.sumDecimal(...refundRows.map((row) => row.amount));
    const refundedCash = Money.sumDecimal(
      ...refundRows
        .filter((row) => row.method === 'CASH')
        .map((row) => row.amount),
    );
    let totalAmountDec: FinancialDecimal = Money.decimal(0);
    let cashAmountDec: FinancialDecimal = Money.decimal(0);
    const byMethod = new Map<
      PaymentMethod,
      { totalAmount: FinancialDecimal; count: number }
    >();

    for (const p of payments) {
      const amtDec = Money.decimal(p.amount ?? 0);
      totalAmountDec = Money.addDecimal(totalAmountDec, amtDec);
      if (p.method === PaymentMethod.CASH) {
        cashAmountDec = Money.addDecimal(cashAmountDec, amtDec);
      }

      const current = byMethod.get(p.method) ?? {
        totalAmount: Money.decimal(0),
        count: 0,
      };
      current.totalAmount = Money.addDecimal(current.totalAmount, amtDec);
      current.count += 1;
      byMethod.set(p.method, current);
    }

    const paymentsByMethod = Array.from(byMethod.entries()).map(
      ([method, agg]) => ({
        method,
        totalAmount: Money.toDb(agg.totalAmount),
        count: agg.count,
      }),
    );

    const paymentRows = payments.map((p) => ({
      id: p.id,
      amount: Money.toDb(p.amount),
      method: p.method,
      paidAt: p.paidAt,
      reference: p.reference,
      invoiceId: p.invoiceId,
      patient: p.invoice?.patient ?? null,
    }));

    return {
      cashier,
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
      paymentsSummary: {
        totalAmount: Money.toDb(totalAmountDec),
        totalCount: payments.length,
        cashAmount: Money.toDb(cashAmountDec),
      },
      paymentsByMethod,
      refunds: refundRows,
      refundsSummary: {
        totalAmount: Money.toDb(refunded),
        cashAmount: Money.toDb(refundedCash),
        totalCount: refundRows.length,
      },
      netPaymentsSummary: {
        totalAmount: Money.toDb(
          Money.subtractDecimal(totalAmountDec, refunded),
        ),
        cashAmount: Money.toDb(
          Money.subtractDecimal(cashAmountDec, refundedCash),
        ),
      },
      payments: paymentRows,
    };
  }

  async closeCashierShift(
    hospitalId: number,
    cashierId: number,
    params: { start: Date; end: Date; actualCash: number; note?: string },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await lockCashier(tx, hospitalId, cashierId);
        const { start, end, actualCash, note } = params;

        const rangeStart = start;
        let rangeEnd = end;
        if (rangeEnd <= rangeStart) {
          rangeEnd = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);
        }

        if (
          !Number.isFinite(start.getTime()) ||
          !Number.isFinite(rangeEnd.getTime()) ||
          rangeEnd.getTime() > Date.now()
        )
          throw new BadRequestException(
            'فترة الإقفال غير صالحة أو تنتهي في المستقبل',
          );
        if (
          !Number.isFinite(actualCash) ||
          Money.decimal(actualCash).decimalPlaces() > 3 ||
          actualCash < 0
        )
          throw new BadRequestException('المبلغ لا يمكن أن يكون سالباً.');

        if (
          await tx.cashierSession.count({
            where: {
              hospitalId,
              cashierId,
              openedAt: { lte: rangeEnd },
              OR: [
                { closedAt: null, status: { in: ['OPEN', 'CLOSING'] } },
                { closedAt: { gte: rangeStart } },
              ],
            },
          })
        )
          throw new BadRequestException(
            'هذه الفترة لها جلسة صندوق؛ استخدم العد الفعلي واعتماد الإقفال',
          );
        const overlapping = await tx.cashierShiftClosing.findFirst({
          where: {
            hospitalId,
            cashierId,
            rangeStart: { lt: rangeEnd },
            rangeEnd: { gt: rangeStart },
          },
        });
        if (overlapping)
          throw new BadRequestException('يوجد شفت مغلق يتداخل مع هذه الفترة.');

        const payments = await tx.payment.findMany({
          where: {
            hospitalId,
            cashierId,
            paidAt: { gte: rangeStart, lt: rangeEnd },
          },
        });

        const cashRefunds = await tx.invoiceRefund.findMany({
          where: {
            hospitalId,
            executedById: cashierId,
            status: 'EXECUTED',
            method: PaymentMethod.CASH,
            executedAt: { gte: rangeStart, lt: rangeEnd },
          },
          select: { amount: true },
        });

        const grossCashDec = Money.sumDecimal(
          ...payments
            .filter((p) => p.method === PaymentMethod.CASH)
            .map((p) => p.amount ?? 0),
        );
        const cashRefundsDec = Money.sumDecimal(
          ...cashRefunds.map((r) => r.amount ?? 0),
        );
        const systemCashTotalDec = Money.subtractDecimal(
          grossCashDec,
          cashRefundsDec,
        );

        const actualDec = Money.decimal(actualCash);
        const differenceDec = Money.subtractDecimal(
          actualDec,
          systemCashTotalDec,
        );
        const absDiffDb = Money.toDbString(differenceDec.abs());

        const result = await (async () => {
          const shift = await tx.cashierShiftClosing.create({
            data: {
              hospitalId,
              cashierId,
              rangeStart,
              rangeEnd,
              systemCashTotal: Money.toDbString(systemCashTotalDec),
              actualCashTotal: Money.toDbString(actualDec),
              difference: Money.toDbString(differenceDec),
              note: note ?? null,
            },
          });

          let accountingEntryId: number | null = null;
          if (!Money.isZero(differenceDec)) {
            const cashMapping = await tx.systemAccountMapping.findFirst({
              where: {
                hospitalId,
                key: SystemAccountKey.CASH_MAIN,
                isActive: true,
              },
              include: { account: true },
            });
            const diffMapping = await tx.systemAccountMapping.findFirst({
              where: {
                hospitalId,
                key: SystemAccountKey.CASH_SHORT_OVER,
                isActive: true,
              },
              include: { account: true },
            });

            if (
              !cashMapping?.account.isActive ||
              cashMapping.account.hospitalId !== hospitalId ||
              !diffMapping?.account.isActive ||
              diffMapping.account.hospitalId !== hospitalId
            )
              throw new BadRequestException('حسابات فروق الصندوق غير صالحة');
            const { financialYear, period } = await financialPeriod(
              tx,
              hospitalId,
              rangeEnd,
            );
            if (cashMapping.account && diffMapping.account) {
              const lines: Prisma.AccountingEntryLineCreateWithoutEntryInput[] =
                differenceDec.gt(0)
                  ? [
                      {
                        account: { connect: { id: cashMapping.account.id } },
                        debit: absDiffDb,
                        credit: '0.000',
                        description: `زيادة صندوق - شفت #${shift.id}`,
                      },
                      {
                        account: { connect: { id: diffMapping.account.id } },
                        debit: '0.000',
                        credit: absDiffDb,
                        description: `زيادة صندوق - شفت #${shift.id}`,
                      },
                    ]
                  : [
                      {
                        account: { connect: { id: diffMapping.account.id } },
                        debit: absDiffDb,
                        credit: '0.000',
                        description: `عجز صندوق - شفت #${shift.id}`,
                      },
                      {
                        account: { connect: { id: cashMapping.account.id } },
                        debit: '0.000',
                        credit: absDiffDb,
                        description: `عجز صندوق - شفت #${shift.id}`,
                      },
                    ];

              const entry = await tx.accountingEntry.create({
                data: {
                  hospitalId,
                  entryDate: rangeEnd,
                  financialYearId: financialYear.id,
                  financialPeriodId: period.id,
                  postingKey: `legacy-shift:${hospitalId}:${shift.id}`,
                  description: `فروق صندوق - شفت كاشير #${cashierId}`,
                  sourceModule: AccountingSourceModule.CASHIER,
                  sourceId: shift.id,
                  lines: { create: lines },
                },
              });
              accountingEntryId = entry.id;

              await tx.cashierShiftClosing.update({
                where: { id: shift.id },
                data: { accountingEntryId },
              });
            }
          }
          return { shift, accountingEntryId };
        })();

        return {
          id: result.shift.id,
          rangeStart: result.shift.rangeStart,
          rangeEnd: result.shift.rangeEnd,
          systemCashTotal: Money.toDb(systemCashTotalDec),
          actualCashTotal: Money.toDb(actualDec),
          difference: Money.toDb(differenceDec),
          note: result.shift.note,
          accountingEntryId: result.accountingEntryId,
        };
      },
      { maxWait: 10000, timeout: 20000 },
    );
  }

  async listCashierShifts(
    hospitalId: number,
    params: { start: Date; end: Date; cashierId?: number },
  ) {
    const { start, end, cashierId } = params;
    const where: Prisma.CashierShiftClosingWhereInput = {
      hospitalId,
      rangeStart: { gte: start },
      rangeEnd: { lte: end },
    };
    if (cashierId) where.cashierId = cashierId;

    return this.prisma.cashierShiftClosing.findMany({
      where,
      include: {
        cashier: { select: { id: true, fullName: true, username: true } },
      },
      orderBy: { rangeStart: 'desc' },
    });
  }

  // ✅ [HELPER] Update connected orders when invoice is PAID
  private async updateRelatedOrdersPaymentStatus(
    tx: Prisma.TransactionClient,
    invoiceId: number,
  ) {
    const charges = await tx.encounterCharge.findMany({
      where: { invoiceId },
      select: { sourceType: true, sourceId: true },
    });

    for (const charge of charges) {
      if (charge.sourceType === ChargeSource.LAB_ORDER && charge.sourceId) {
        // Lab Order SourceId is Order.id
        // Lab Order SourceId is LabOrder.id, need to find orderId first
        const labOrder = await tx.labOrder.findUnique({
          where: { id: charge.sourceId },
          select: { orderId: true },
        });
        if (labOrder) {
          await tx.order.update({
            where: { id: labOrder.orderId },
            data: { paymentStatus: PaymentStatus.PAID },
          });
        }
      } else if (
        charge.sourceType === ChargeSource.RADIOLOGY_ORDER &&
        charge.sourceId
      ) {
        // Radiology Order SourceId is RadiologyOrder.id
        const radOrder = await tx.radiologyOrder.findUnique({
          where: { id: charge.sourceId },
          select: { orderId: true },
        });
        if (radOrder) {
          await tx.order.update({
            where: { id: radOrder.orderId },
            data: { paymentStatus: PaymentStatus.PAID },
          });
        }
      }
    }
  }
}

// // src/cashier/cashier.service.ts

// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   InvoiceStatus,
//   PaymentMethod,
//   ChargeSource,
//   ServiceType,
//   SystemAccountKey,
//   AccountingSourceModule,
//   Prisma,
// } from '@prisma/client';
// import { AccountingService } from '../accounting/accounting.service';

// type PharmacyInvoiceItemDto = {
//   id: number;
//   quantity: number;
//   unitPrice: number;
//   totalAmount: number;
//   isSubstitute: boolean;
//   dispensedDrug: {
//     id: number;
//     code: string | null;
//     name: string;
//     strength: string | null;
//     form: string | null;
//   } | null;
//   originalDrug: {
//     id: number;
//     code: string | null;
//     name: string;
//     strength: string | null;
//     form: string | null;
//   } | null;
// };

// type InvoiceLineDetailDto = {
//   id: number;
//   description: string;
//   serviceCode: string | null;
//   serviceType: string | null;
//   quantity: number;
//   unitPrice: number;
//   totalAmount: number;
//   pharmacyItems?: PharmacyInvoiceItemDto[];
// };

// export type PaymentReceiptDto = {
//   payment: {
//     id: number;
//     amount: number;
//     method: PaymentMethod;
//     paidAt: Date;
//     reference: string | null;
//   } | null; // ✅ Nullable for Zero Payment
//   invoice: {
//     id: number;
//     status: InvoiceStatus;
//     totalAmount: number;
//     discountAmount: number;
//     paidAmount: number;
//     remainingAmount: number;
//     currency: string;
//     createdAt: Date;
//   };
//   patient: { id: number; fullName: string; mrn: string } | null;
//   encounter: { id: number; type: string } | null;
// };

// @Injectable()
// export class CashierService {
//   constructor(
//     private prisma: PrismaService,
//     private accounting: AccountingService,
//   ) {}

//   private mapInvoiceToWorklistDto(inv: any) {
//     const totalAmount = Number(inv.totalAmount);
//     const discountAmount = Number(inv.discountAmount);
//     const paidAmount = Number(inv.paidAmount);
//     const remainingAmount = totalAmount - discountAmount - paidAmount;

//     return {
//       id: inv.id as number,
//       status: inv.status as InvoiceStatus,
//       totalAmount,
//       discountAmount,
//       paidAmount,
//       remainingAmount,

//       // الحقول الجديدة
//       patientShare: Number(inv.patientShare ?? 0),
//       insuranceShare: Number(inv.insuranceShare ?? 0),
//       claimStatus: inv.claimStatus,

//       createdAt: inv.createdAt as Date,
//       patient: inv.patient as {
//         id: number;
//         fullName: string;
//         mrn: string;
//         insurancePolicy?: {
//           name: string;
//           provider: { name: string };
//         } | null;
//       } | null,
//       encounter: inv.encounter as {
//         id: number;
//         type: string;
//       } | null,
//     };
//   }

//   async getWorklist(hospitalId: number) {
//     const invoices = await this.prisma.invoice.findMany({
//       where: {
//         hospitalId,
//         status: {
//           in: [
//             InvoiceStatus.DRAFT,
//             InvoiceStatus.ISSUED,
//             InvoiceStatus.PARTIALLY_PAID,
//           ],
//         },
//       },
//       include: {
//         patient: {
//           select: {
//             id: true,
//             fullName: true,
//             mrn: true,
//             insurancePolicy: {
//               select: {
//                 name: true,
//                 provider: { select: { name: true } },
//               },
//             },
//           },
//         },
//         adjustments: { where: { status: 'POSTED' }, select: { delta: true } },
//         encounter: { select: { id: true, type: true } },
//       },
//       orderBy: { createdAt: 'asc' },
//     });

//     const result: ReturnType<CashierService['mapInvoiceToWorklistDto']>[] = [];
//     for (const inv of invoices) {
//       const dto = this.mapInvoiceToWorklistDto(inv);
//       // اعرض الفاتورة إذا لم تكن مدفوعة بالكامل أو ملغاة
//       if (
//         inv.status !== InvoiceStatus.PAID &&
//         inv.status !== InvoiceStatus.CANCELLED
//       ) {
//         result.push(dto);
//       }
//     }
//     return result;
//   }

//   async recordPayment(params: {
//     hospitalId: number;
//     invoiceId: number;
//     amount: number;
//     method: PaymentMethod;
//     reference?: string;
//     userId: number;
//   }) {
//     const { hospitalId, invoiceId, amount, method, reference, userId } = params;

//     // ✅ التعديل: السماح بـ 0، ومنع السالب فقط
//     if (amount < 0) {
//       throw new BadRequestException('قيمة الدفعة لا يمكن أن تكون سالبة.');
//     }

//     const { updatedInvoice, payment } = await this.prisma.$transaction(
//       async (tx) => {
//         const invoice = await tx.invoice.findUnique({
//           where: { id: invoiceId },
//         });

//         if (!invoice) throw new NotFoundException('الفاتورة غير موجودة.');
//         if (invoice.hospitalId !== hospitalId)
//           throw new BadRequestException('هذه الفاتورة لا تنتمي لهذه المنشأة.');

//         const totalAmount = Number(invoice.totalAmount);
//         const discountAmount = Number(invoice.discountAmount);
//         const paidAmount = Number(invoice.paidAmount);

//         const patientShare = Number(invoice.patientShare);
//         const insuranceShare = Number(invoice.insuranceShare);

//         // تحديد المستحق على المريض
//         let patientLiability = patientShare;
//         // تصحيح للبيانات القديمة
//         if (insuranceShare === 0 && patientShare === 0 && totalAmount > 0) {
//           patientLiability = totalAmount;
//         }

//         const remainingPatientLiability = Math.max(
//           0,
//           patientLiability - paidAmount,
//         );

//         // ✅ التحقق من تجاوز المبلغ المستحق (مع تسامح بسيط للكسور)
//         if (amount > remainingPatientLiability + 0.001) {
//           throw new BadRequestException(
//             `المبلغ المدخل (${amount}) أكبر من المستحق على المريض (${remainingPatientLiability.toFixed(3)}).`,
//           );
//         }

//         // ✅ معالجة الدفعة الصفرية (Zero Payment)
//         if (amount === 0) {
//           // إذا كان المبلغ 0 (تأمين كامل مثلاً)، فقط نحدث الحالة ولا ننشئ سجل دفع
//           // نتحقق أولاً هل تستحق الإغلاق؟
//           const totalRemaining = totalAmount - discountAmount - paidAmount;
//           let newStatus = invoice.status;

//           // إذا كان المتبقي هو فقط حصة التأمين (أو أقل)، والفاتورة ليست PAID، يمكننا اعتبار جزء المريض "مدفوع" (هو 0 أصلاً)
//           // لكن الحالة العامة للفاتورة تعتمد على سداد التأمين أيضاً.
//           // في نظامنا، الفاتورة تظل PARTIALLY_PAID حتى يدفع التأمين، إلا إذا كان التأمين 0.

//           if (totalRemaining <= 0.001) {
//             newStatus = InvoiceStatus.PAID;
//           } else {
//             // إذا كان هناك متبقي للتأمين، تظل كما هي (أو PARTIALLY_PAID)
//             // لكن لغرض تجربة المستخدم، سنعتبر أن "عملية الكاشير" تمت.
//             newStatus = InvoiceStatus.PARTIALLY_PAID;
//           }

//           const updated = await tx.invoice.update({
//             where: { id: invoiceId },
//             data: { status: newStatus }, // تحديث الحالة فقط لو لزم الأمر
//           });

//           return { updatedInvoice: updated, payment: null };
//         }

//         // --- الدفع الطبيعي (مبلغ > 0) ---
//         const newPayment = await tx.payment.create({
//           data: {
//             hospitalId,
//             invoiceId,
//             amount,
//             method,
//             reference: reference ?? null,
//             cashierId: userId,
//           },
//         });

//         const newPaid = paidAmount + amount;
//         const totalRemaining = totalAmount - discountAmount - newPaid;

//         let newStatus: InvoiceStatus = InvoiceStatus.PARTIALLY_PAID;
//         if (totalRemaining <= 0.001) {
//           newStatus = InvoiceStatus.PAID;
//         }

//         const updatedInvoice = await tx.invoice.update({
//           where: { id: invoiceId },
//           data: { paidAmount: newPaid, status: newStatus },
//         });

//         return { updatedInvoice, payment: newPayment };
//       },
//     );

//     // ✅ تسجيل القيد المحاسبي فقط إذا كان هناك دفعة مالية حقيقية
//     if (payment) {
//       await this.accounting.recordPaymentEntry({
//         paymentId: payment.id,
//         hospitalId,
//         userId,
//       });
//     }

//     return {
//       id: updatedInvoice.id,
//       status: updatedInvoice.status,
//       totalAmount: Number(updatedInvoice.totalAmount),
//       discountAmount: Number(updatedInvoice.discountAmount),
//       paidAmount: Number(updatedInvoice.paidAmount),
//       paymentId: payment?.id ?? null,
//     };
//   }

//   async getInvoiceDetails(hospitalId: number, invoiceId: number) {
//     const invoice = await this.prisma.invoice.findFirst({
//       where: { id: invoiceId, hospitalId },
//       include: {
//         patient: {
//           select: {
//             id: true,
//             fullName: true,
//             mrn: true,
//             insurancePolicy: { include: { provider: true } },
//           },
//         },
//         adjustments: { where: { status: 'POSTED' }, select: { delta: true } },
//         encounter: { select: { id: true, type: true } },
//         charges: {
//           include: { serviceItem: true },
//           orderBy: { id: 'asc' },
//         },
//       },
//     });

//     if (!invoice) throw new NotFoundException('الفاتورة غير موجودة.');

//     const totalAmount = Number(invoice.totalAmount);
//     const discountAmount = Number(invoice.discountAmount);
//     const paidAmount = Number(invoice.paidAmount);
//     const remainingAmount = totalAmount - discountAmount - paidAmount;

//     // --- Pharmacy breakdown ---
//     const pharmacyCharges = invoice.charges.filter(
//       (ch) =>
//         ch.serviceItem?.type === ServiceType.PHARMACY &&
//         ch.sourceType === ChargeSource.PHARMACY &&
//         ch.sourceId != null,
//     );

//     const dispenseIds = pharmacyCharges
//       .map((ch) => ch.sourceId as number)
//       .filter((id) => !!id);

//     let itemsByDispense = new Map<number, any[]>();

//     if (dispenseIds.length > 0) {
//       const dispenseItems = await this.prisma.dispenseItem.findMany({
//         where: { dispenseRecordId: { in: dispenseIds } },
//         include: {
//           product: true,
//           prescriptionItem: {
//             include: {
//               product: true,
//             },
//           },
//         },
//       });

//       for (const it of dispenseItems) {
//         const list = itemsByDispense.get(it.dispenseRecordId) ?? [];
//         list.push(it);
//         itemsByDispense.set(it.dispenseRecordId, list);
//       }
//     }

//     const lines: InvoiceLineDetailDto[] = invoice.charges.map((ch: any) => {
//       const line: InvoiceLineDetailDto = {
//         id: ch.id,
//         description: ch.serviceItem?.name ?? 'خدمة',
//         serviceCode: ch.serviceItem?.code ?? null,
//         serviceType: ch.serviceItem?.type ?? null,
//         quantity: Number(ch.quantity ?? 1),
//         unitPrice: Number(ch.unitPrice),
//         totalAmount: Number(ch.totalAmount),
//       };

//       if (
//         ch.serviceItem?.type === ServiceType.PHARMACY &&
//         ch.sourceType === ChargeSource.PHARMACY &&
//         ch.sourceId != null
//       ) {
//         const dItems = itemsByDispense.get(ch.sourceId as number) ?? [];

//         line.pharmacyItems = dItems.map((it: any): PharmacyInvoiceItemDto => {
//           const originalProd = it.prescriptionItem?.product ?? null;
//           const dispProd = it.product;
//           const isSubstitute =
//             !!originalProd && originalProd.id !== it.productId;

//           return {
//             id: it.id,
//             quantity: Number(it.quantity),
//             unitPrice: Number(it.unitPrice),
//             totalAmount: Number(it.totalAmount),
//             isSubstitute,
//             dispensedDrug: dispProd
//               ? {
//                   id: dispProd.id,
//                   code: dispProd.code,
//                   name: dispProd.name,
//                   strength: dispProd.strength,
//                   form: dispProd.form,
//                 }
//               : null,
//             originalDrug: originalProd
//               ? {
//                   id: originalProd.id,
//                   code: originalProd.code,
//                   name: originalProd.name,
//                   strength: originalProd.strength,
//                   form: originalProd.form,
//                 }
//               : null,
//           };
//         });
//       }

//       return line;
//     });

//     return {
//       invoice: {
//         id: invoice.id,
//         status: invoice.status,
//         totalAmount,
//         discountAmount,
//         paidAmount,
//         remainingAmount,
//         currency: invoice.currency,
//         createdAt: invoice.createdAt,
//         patientShare: Number(invoice.patientShare),
//         insuranceShare: Number(invoice.insuranceShare),
//         patient: invoice.patient,
//         encounter: invoice.encounter
//           ? { id: invoice.encounter.id, type: invoice.encounter.type }
//           : null,
//       },
//       lines,
//     };
//   }

//   async getPatientStatement(hospitalId: number, patientId: number) {
//     const patient = await this.prisma.patient.findFirst({
//       where: { id: patientId, hospitalId },
//       select: { id: true, fullName: true, mrn: true },
//     });
//     if (!patient) throw new NotFoundException('المريض غير موجود.');

//     const invoices = await this.prisma.invoice.findMany({
//       where: { hospitalId, patientId },
//       include: { encounter: { select: { id: true, type: true } } },
//       orderBy: { createdAt: 'asc' },
//     });

//     const payments = await this.prisma.payment.findMany({
//       where: { hospitalId, invoice: { patientId } },
//       include: { invoice: { select: { id: true, createdAt: true } } },
//       orderBy: { paidAt: 'asc' },
//     });

//     const invoiceDtos = invoices.map((inv) => {
//       const t = Number(inv.totalAmount);
//       const d = Number(inv.discountAmount);
//       const p = Number(inv.paidAmount);
//       return {
//         id: inv.id,
//         status: inv.status,
//         totalAmount: t,
//         discountAmount: d,
//         paidAmount: p,
//         remainingAmount: t - d - p,
//         createdAt: inv.createdAt,
//         encounter: inv.encounter,
//       };
//     });

//     const paymentDtos = payments.map((p) => ({
//       id: p.id,
//       invoiceId: p.invoiceId,
//       amount: Number(p.amount),
//       method: p.method,
//       reference: p.reference,
//       paidAt: p.paidAt,
//       invoice: p.invoice,
//     }));

//     const totalInvoiced = invoiceDtos.reduce((s, i) => s + i.totalAmount, 0);
//     const totalDiscount = invoiceDtos.reduce((s, i) => s + i.discountAmount, 0);
//     const totalPaid = invoiceDtos.reduce((s, i) => s + i.paidAmount, 0);

//     return {
//       patient,
//       summary: {
//         totalInvoiced,
//         totalDiscount,
//         totalPaid,
//         remaining: totalInvoiced - totalDiscount - totalPaid,
//       },
//       invoices: invoiceDtos,
//       payments: paymentDtos,
//     };
//   }

//   async getPaymentReceipt(hospitalId: number, paymentId: number) {
//     const payment = await this.prisma.payment.findFirst({
//       where: { id: paymentId, hospitalId },
//       include: {
//         invoice: {
//           include: {
//             patient: { select: { id: true, fullName: true, mrn: true } },
//             adjustments: { where: { status: 'POSTED' }, select: { delta: true } },
//         encounter: { select: { id: true, type: true } },
//           },
//         },
//       },
//     });

//     if (!payment) throw new NotFoundException('الدفعة غير موجودة.');
//     const inv = payment.invoice;

//     const totalAmount = Number(inv.totalAmount);
//     const discountAmount = Number(inv.discountAmount);
//     const paidAmount = Number(inv.paidAmount);
//     const remainingAmount = totalAmount - discountAmount - paidAmount;

//     return {
//       payment: {
//         id: payment.id,
//         amount: Number(payment.amount),
//         method: payment.method,
//         paidAt: payment.paidAt,
//         reference: payment.reference ?? null,
//       },
//       invoice: {
//         id: inv.id,
//         status: inv.status,
//         totalAmount,
//         discountAmount,
//         paidAmount,
//         remainingAmount,
//         currency: inv.currency,
//         createdAt: inv.createdAt,
//       },
//       patient: inv.patient,
//       encounter: inv.encounter,
//     };
//   }

//   async getDailyReport(hospitalId: number, params: { start: Date; end: Date }) {
//     const { start, end } = params;

//     const paymentsAgg = await this.prisma.payment.groupBy({
//       by: ['method'],
//       where: { hospitalId, paidAt: { gte: start, lte: end } },
//       _sum: { amount: true },
//       _count: { _all: true },
//     });

//     const totalPaymentsAmount = paymentsAgg.reduce(
//       (s, r) => s + Number(r._sum.amount ?? 0),
//       0,
//     );
//     const totalPaymentsCount = paymentsAgg.reduce(
//       (s, r) => s + (r._count._all ?? 0),
//       0,
//     );

//     const paymentsByMethod = paymentsAgg.map((row) => ({
//       method: row.method,
//       totalAmount: Number(row._sum.amount ?? 0),
//       count: row._count._all ?? 0,
//     }));

//     const invoicesAgg = await this.prisma.invoice.aggregate({
//       where: { hospitalId, createdAt: { gte: start, lte: end } },
//       _sum: { totalAmount: true, discountAmount: true, paidAmount: true },
//       _count: { _all: true },
//     });

//     const tInv = Number(invoicesAgg._sum.totalAmount ?? 0);
//     const tDisc = Number(invoicesAgg._sum.discountAmount ?? 0);
//     const tPaid = Number(invoicesAgg._sum.paidAmount ?? 0);

//     return {
//       dateFrom: start.toISOString(),
//       dateTo: end.toISOString(),
//       paymentsSummary: {
//         totalAmount: totalPaymentsAmount,
//         totalCount: totalPaymentsCount,
//       },
//       paymentsByMethod,
//       invoicesSummary: {
//         invoiceCount: invoicesAgg._count._all,
//         totalInvoiced: tInv,
//         totalDiscount: tDisc,
//         totalPaid: tPaid,
//         totalRemaining: tInv - tDisc - tPaid,
//       },
//     };
//   }

//   async listCashierUsers(hospitalId: number) {
//     return this.prisma.user.findMany({
//       where: { hospitalId, isActive: true },
//       select: { id: true, fullName: true, username: true },
//       orderBy: { fullName: 'asc' },
//     });
//   }

//   async getCashierUserReport(
//     hospitalId: number,
//     cashierId: number,
//     params: { start: Date; end: Date },
//   ) {
//     const { start, end } = params;
//     const cashier = await this.prisma.user.findFirst({
//       where: { id: cashierId, hospitalId, isActive: true },
//       select: { id: true, fullName: true, username: true },
//     });
//     if (!cashier) throw new NotFoundException('الكاشير غير موجود.');

//     const payments = await this.prisma.payment.findMany({
//       where: { hospitalId, cashierId, paidAt: { gte: start, lte: end } },
//       include: {
//         invoice: {
//           select: {
//             id: true,
//             patient: { select: { id: true, fullName: true, mrn: true } },
//           },
//         },
//       },
//       orderBy: { paidAt: 'asc' },
//     });

//     let totalAmount = 0;
//     let cashAmount = 0;
//     const byMethod = new Map<
//       PaymentMethod,
//       { totalAmount: number; count: number }
//     >();

//     for (const p of payments) {
//       const amt = Number(p.amount);
//       totalAmount += amt;
//       if (p.method === PaymentMethod.CASH) cashAmount += amt;

//       const current = byMethod.get(p.method) ?? { totalAmount: 0, count: 0 };
//       current.totalAmount += amt;
//       current.count += 1;
//       byMethod.set(p.method, current);
//     }

//     const paymentsByMethod = Array.from(byMethod.entries()).map(
//       ([method, agg]) => ({ method, ...agg }),
//     );

//     const paymentRows = payments.map((p) => ({
//       id: p.id,
//       amount: Number(p.amount),
//       method: p.method,
//       paidAt: p.paidAt,
//       reference: p.reference,
//       invoiceId: p.invoiceId,
//       patient: p.invoice?.patient ?? null,
//     }));

//     return {
//       cashier,
//       dateFrom: start.toISOString(),
//       dateTo: end.toISOString(),
//       paymentsSummary: {
//         totalAmount,
//         totalCount: payments.length,
//         cashAmount,
//       },
//       paymentsByMethod,
//       payments: paymentRows,
//     };
//   }

//   async closeCashierShift(
//     hospitalId: number,
//     cashierId: number,
//     params: { start: Date; end: Date; actualCash: number; note?: string },
//   ) {
//     const { start, end, actualCash, note } = params;

//     let rangeStart = start;
//     let rangeEnd = end;
//     if (rangeEnd <= rangeStart) {
//       rangeEnd = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);
//     }

//     if (actualCash < 0)
//       throw new BadRequestException('المبلغ لا يمكن أن يكون سالباً.');

//     const overlapping = await this.prisma.cashierShiftClosing.findFirst({
//       where: {
//         hospitalId,
//         cashierId,
//         rangeStart: { lt: rangeEnd },
//         rangeEnd: { gt: rangeStart },
//       },
//     });
//     if (overlapping)
//       throw new BadRequestException('يوجد شفت مغلق يتداخل مع هذه الفترة.');

//     const payments = await this.prisma.payment.findMany({
//       where: {
//         hospitalId,
//         cashierId,
//         paidAt: { gte: rangeStart, lte: rangeEnd },
//       },
//     });

//     const systemCashTotalDec = payments
//       .filter((p) => p.method === PaymentMethod.CASH)
//       .reduce((sum, p) => sum.plus(p.amount ?? 0), new Prisma.Decimal(0));

//     const actualDec = new Prisma.Decimal(actualCash);
//     const difference = actualDec.minus(systemCashTotalDec);
//     const absDiff = difference.abs();

//     const result = await this.prisma.$transaction(async (tx) => {
//       const shift = await tx.cashierShiftClosing.create({
//         data: {
//           hospitalId,
//           cashierId,
//           rangeStart,
//           rangeEnd,
//           systemCashTotal: systemCashTotalDec,
//           actualCashTotal: actualDec,
//           difference,
//           note: note ?? null,
//         },
//       });

//       let accountingEntryId: number | null = null;
//       if (!difference.isZero()) {
//         const cashMapping = await tx.systemAccountMapping.findFirst({
//           where: {
//             hospitalId,
//             key: SystemAccountKey.CASH_MAIN,
//             isActive: true,
//           },
//           include: { account: true },
//         });
//         const diffMapping = await tx.systemAccountMapping.findFirst({
//           where: {
//             hospitalId,
//             key: SystemAccountKey.CASH_SHORT_OVER,
//             isActive: true,
//           },
//           include: { account: true },
//         });

//         if (cashMapping?.account && diffMapping?.account) {
//           const lines: Prisma.AccountingEntryLineCreateWithoutEntryInput[] =
//             difference.greaterThan(0)
//               ? [
//                   {
//                     account: { connect: { id: cashMapping.account.id } },
//                     debit: absDiff,
//                     credit: 0,
//                     description: `زيادة صندوق - شفت #${shift.id}`,
//                   },
//                   {
//                     account: { connect: { id: diffMapping.account.id } },
//                     debit: 0,
//                     credit: absDiff,
//                     description: `زيادة صندوق - شفت #${shift.id}`,
//                   },
//                 ]
//               : [
//                   {
//                     account: { connect: { id: diffMapping.account.id } },
//                     debit: absDiff,
//                     credit: 0,
//                     description: `عجز صندوق - شفت #${shift.id}`,
//                   },
//                   {
//                     account: { connect: { id: cashMapping.account.id } },
//                     debit: 0,
//                     credit: absDiff,
//                     description: `عجز صندوق - شفت #${shift.id}`,
//                   },
//                 ];

//           const entry = await tx.accountingEntry.create({
//             data: {
//               hospitalId,
//               entryDate: rangeEnd,
//               description: `فروق صندوق - شفت كاشير #${cashierId}`,
//               sourceModule: AccountingSourceModule.CASHIER,
//               sourceId: shift.id,
//               lines: { create: lines },
//             },
//           });
//           accountingEntryId = entry.id;

//           await tx.cashierShiftClosing.update({
//             where: { id: shift.id },
//             data: { accountingEntryId },
//           });
//         }
//       }
//       return { shift, accountingEntryId };
//     });

//     return {
//       id: result.shift.id,
//       rangeStart: result.shift.rangeStart,
//       rangeEnd: result.shift.rangeEnd,
//       systemCashTotal: Number(systemCashTotalDec.toFixed(3)),
//       actualCashTotal: Number(actualDec.toFixed(3)),
//       difference: Number(difference.toFixed(3)),
//       note: result.shift.note,
//       accountingEntryId: result.accountingEntryId,
//     };
//   }

//   async listCashierShifts(
//     hospitalId: number,
//     params: { start: Date; end: Date; cashierId?: number },
//   ) {
//     const { start, end, cashierId } = params;
//     const where: any = {
//       hospitalId,
//       rangeStart: { gte: start },
//       rangeEnd: { lte: end },
//     };
//     if (cashierId) where.cashierId = cashierId;

//     return this.prisma.cashierShiftClosing.findMany({
//       where,
//       include: {
//         cashier: { select: { id: true, fullName: true, username: true } },
//       },
//       orderBy: { rangeStart: 'desc' },
//     });
//   }
// }

// // src/cashier/cashier.service.ts

// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   InvoiceStatus,
//   PaymentMethod,
//   ChargeSource,
//   ServiceType,
//   SystemAccountKey,
//   AccountingSourceModule,
//   Prisma,
// } from '@prisma/client';
// import { AccountingService } from '../accounting/accounting.service';

// type PharmacyInvoiceItemDto = {
//   id: number;
//   quantity: number;
//   unitPrice: number;
//   totalAmount: number;
//   isSubstitute: boolean;
//   dispensedDrug: {
//     id: number;
//     code: string | null;
//     name: string;
//     strength: string | null;
//     form: string | null;
//   } | null;
//   originalDrug: {
//     id: number;
//     code: string | null;
//     name: string;
//     strength: string | null;
//     form: string | null;
//   } | null;
// };

// type InvoiceLineDetailDto = {
//   id: number;
//   description: string;
//   serviceCode: string | null;
//   serviceType: string | null;
//   quantity: number;
//   unitPrice: number;
//   totalAmount: number;
//   pharmacyItems?: PharmacyInvoiceItemDto[];
// };

// export type PaymentReceiptDto = {
//   payment: {
//     id: number;
//     amount: number;
//     method: PaymentMethod;
//     paidAt: Date;
//     reference: string | null;
//   } | null;
//   invoice: {
//     id: number;
//     status: InvoiceStatus;
//     totalAmount: number;
//     discountAmount: number;
//     paidAmount: number;
//     remainingAmount: number;
//     currency: string;
//     createdAt: Date;
//   };
//   patient: { id: number; fullName: string; mrn: string } | null;
//   encounter: { id: number; type: string } | null;
// };

// @Injectable()
// export class CashierService {
//   constructor(
//     private prisma: PrismaService,
//     private accounting: AccountingService,
//   ) {}

//   private mapInvoiceToWorklistDto(inv: any) {
//     const totalAmount = Number(inv.totalAmount);
//     const discountAmount = Number(inv.discountAmount);
//     const paidAmount = Number(inv.paidAmount);
//     const remainingAmount = totalAmount - discountAmount - paidAmount;

//     // ✅ تصحيح: تمرير حصص التأمين والمريض للفرونت إند
//     return {
//       id: inv.id as number,
//       status: inv.status as InvoiceStatus,
//       totalAmount,
//       discountAmount,
//       paidAmount,
//       remainingAmount,

//       // الحقول الجديدة
//       patientShare: Number(inv.patientShare ?? 0),
//       insuranceShare: Number(inv.insuranceShare ?? 0),
//       claimStatus: inv.claimStatus, // حالة مطالبة التأمين

//       createdAt: inv.createdAt as Date,
//       patient: inv.patient as {
//         id: number;
//         fullName: string;
//         mrn: string;
//         // ✅ إضافة تفاصيل التأمين للعرض
//         insurancePolicy?: {
//           name: string;
//           provider: { name: string };
//         } | null;
//       } | null,
//       encounter: inv.encounter as {
//         id: number;
//         type: string;
//       } | null,
//     };
//   }

//   async getWorklist(hospitalId: number) {
//     const invoices = await this.prisma.invoice.findMany({
//       where: {
//         hospitalId,
//         status: {
//           in: [
//             InvoiceStatus.DRAFT,
//             InvoiceStatus.ISSUED,
//             InvoiceStatus.PARTIALLY_PAID,
//           ],
//         },
//       },
//       include: {
//         patient: {
//           select: {
//             id: true,
//             fullName: true,
//             mrn: true,
//             // ✅ جلب اسم الشركة والبوليصة للعرض في القائمة
//             insurancePolicy: {
//               select: {
//                 name: true,
//                 provider: { select: { name: true } },
//               },
//             },
//           },
//         },
//         adjustments: { where: { status: 'POSTED' }, select: { delta: true } },
//         encounter: { select: { id: true, type: true } },
//       },
//       orderBy: { createdAt: 'asc' },
//     });

//     const result: ReturnType<CashierService['mapInvoiceToWorklistDto']>[] = [];
//     for (const inv of invoices) {
//       const dto = this.mapInvoiceToWorklistDto(inv);
//       // ✅ نعرض الفاتورة إذا كان هناك متبقي على "المريض"
//       // أو إذا كان هناك متبقي إجمالي ولم تسدد بعد

//       // المنطق المعدل: نعرضها للكاشير إذا لم تكن مدفوعة بالكامل
//       // الكاشير سيرى التفاصيل (كم على المريض وكم على التأمين)
//       if (
//         inv.status !== InvoiceStatus.PAID &&
//         inv.status !== InvoiceStatus.CANCELLED
//       ) {
//         result.push(dto);
//       }
//     }
//     return result;
//   }

//   // ... (باقي الدوال recordPayment, getInvoiceDetails... تبقى كما هي في ملفك الأصلي)
//   // سأعيد نسخها هنا لضمان الملف الكامل الصحيح

//   async recordPayment(params: {
//     hospitalId: number;
//     invoiceId: number;
//     amount: number;
//     method: PaymentMethod;
//     reference?: string;
//     userId: number;
//   }) {
//     const { hospitalId, invoiceId, amount, method, reference, userId } = params;

//     if (!amount || amount <= 0) {
//       throw new BadRequestException('قيمة الدفعة يجب أن تكون أكبر من الصفر.');
//     }

//     const { updatedInvoice, payment } = await this.prisma.$transaction(
//       async (tx) => {
//         const invoice = await tx.invoice.findUnique({
//           where: { id: invoiceId },
//         });

//         if (!invoice) throw new NotFoundException('الفاتورة غير موجودة.');
//         if (invoice.hospitalId !== hospitalId)
//           throw new BadRequestException('هذه الفاتورة لا تنتمي لهذه المنشأة.');

//         const totalAmount = Number(invoice.totalAmount);
//         const discountAmount = Number(invoice.discountAmount);
//         const paidAmount = Number(invoice.paidAmount);

//         // ✅ تحديد المبلغ المتبقي على "المريض" تحديداً
//         const patientShare = Number(invoice.patientShare);
//         const insuranceShare = Number(invoice.insuranceShare);

//         // إذا كان التأمين 0، فالمريض يتحمل كل شيء (نقدي)
//         // إذا كان هناك تأمين، نحسب المتبقي من حصة المريض فقط
//         let patientLiability = patientShare;

//         // في حالة البيانات القديمة (قبل التحديث)، قد يكون patientShare=0 رغم أنه نقدي
//         // لذا نعتبره نقدي إذا كان التأمين 0
//         if (insuranceShare === 0 && patientShare === 0 && totalAmount > 0) {
//           patientLiability = totalAmount;
//         }

//         // المبلغ الذي دفعه المريض سابقاً (نفترض أن المدفوعات السابقة تغطي حصة المريض أولاً)
//         // ملاحظة: هذا تبسيط، في نظام معقد نفصل سجلات دفع المريض عن دفع الشركة
//         // لكن بما أننا نسجل دفعات الشركة كـ "سداد مطالبة" (تحديث حالة)،
//         // فالدفعات المسجلة هنا (Payments) هي عادة من المريض.

//         const remainingPatientLiability = Math.max(
//           0,
//           patientLiability - paidAmount,
//         );

//         // ✅ السماح بدفع المتبقي على المريض فقط
//         if (amount > remainingPatientLiability + 0.001) {
//           // 0.001 للتسامح مع الكسور
//           throw new BadRequestException(
//             `المبلغ المدخل (${amount}) أكبر من المستحق على المريض (${remainingPatientLiability.toFixed(3)}).`,
//           );
//         }

//         const payment = await tx.payment.create({
//           data: {
//             hospitalId,
//             invoiceId,
//             amount,
//             method,
//             reference: reference ?? null,
//             cashierId: userId,
//           },
//         });

//         const newPaid = paidAmount + amount;

//         // ✅ تحديث حالة الفاتورة
//         // الفاتورة تصبح PAID إذا تم سداد كامل المبلغ (مريض + تأمين)
//         // أو إذا سدد المريض حصته والتأمين سدد حصته (عبر المطالبات)
//         // في واجهة الكاشير، إذا سدد المريض حصته بالكامل، قد تظل الفاتورة PARTIALLY_PAID
//         // بانتظار سداد التأمين.

//         const isInsurancePaid =
//           invoice.claimStatus === 'PAID' || insuranceShare === 0;
//         const totalRemaining = totalAmount - discountAmount - newPaid;

//         // إذا سدد المريض حصته، وكانت حصة التأمين مدفوعة (أو صفر)، فهي خالصة
//         // أما إذا بقي جزء التأمين، فهي مدفوعة جزئياً
//         let newStatus: InvoiceStatus = InvoiceStatus.PARTIALLY_PAID;

//         if (totalRemaining <= 0.001) {
//           newStatus = InvoiceStatus.PAID;
//         }

//         const updatedInvoice = await tx.invoice.update({
//           where: { id: invoiceId },
//           data: { paidAmount: newPaid, status: newStatus },
//         });

//         return { updatedInvoice, payment };
//       },
//     );

//     // تسجيل القيد المحاسبي
//     await this.accounting.recordPaymentEntry({
//       paymentId: payment.id,
//       hospitalId,
//       userId,
//     });

//     return {
//       id: updatedInvoice.id,
//       status: updatedInvoice.status,
//       totalAmount: Number(updatedInvoice.totalAmount),
//       discountAmount: Number(updatedInvoice.discountAmount),
//       paidAmount: Number(updatedInvoice.paidAmount),
//       paymentId: payment.id,
//     };
//   }

//   async getInvoiceDetails(hospitalId: number, invoiceId: number) {
//     const invoice = await this.prisma.invoice.findFirst({
//       where: { id: invoiceId, hospitalId },
//       include: {
//         patient: {
//           select: {
//             id: true,
//             fullName: true,
//             mrn: true,
//             insurancePolicy: { include: { provider: true } },
//           },
//         },
//         adjustments: { where: { status: 'POSTED' }, select: { delta: true } },
//         encounter: { select: { id: true, type: true } },
//         charges: {
//           include: { serviceItem: true },
//           orderBy: { id: 'asc' },
//         },
//       },
//     });

//     if (!invoice) throw new NotFoundException('الفاتورة غير موجودة.');

//     const totalAmount = Number(invoice.totalAmount);
//     const discountAmount = Number(invoice.discountAmount);
//     const paidAmount = Number(invoice.paidAmount);
//     const remainingAmount = totalAmount - discountAmount - paidAmount;

//     // --- Pharmacy breakdown ---
//     const pharmacyCharges = invoice.charges.filter(
//       (ch) =>
//         ch.serviceItem?.type === ServiceType.PHARMACY &&
//         ch.sourceType === ChargeSource.PHARMACY &&
//         ch.sourceId != null,
//     );

//     // const dispenseIds = pharmacyCharges
//     //   .map((ch) => ch.sourceId as number)
//     //   .filter((id) => !!id);

//     // let itemsByDispense = new Map<number, any[]>();

//     // if (dispenseIds.length > 0) {
//     //   const dispenseItems = await this.prisma.dispenseItem.findMany({
//     //     where: { dispenseRecordId: { in: dispenseIds } },
//     //     include: {
//     //       product: true,
//     //       prescriptionItem: {
//     //         include: {
//     //           product: true,
//     //         },
//     //       },
//     //     },
//     //   });

//     //   itemsByDispense = new Map<number, any[]>();
//     //   for (const it of dispenseItems) {
//     //     const list = itemsByDispense.get(it.dispenseRecordId) ?? [];
//     //     list.push(it);
//     //     itemsByDispense.set(it.dispenseRecordId, list);
//     //   }
//     // }

//     const dispenseIds = invoice.charges
//       .filter(
//         (ch) => ch.serviceItem.type === ServiceType.PHARMACY && ch.sourceId,
//       )
//       .map((c) => c.sourceId as number);
//     let itemsByDispense = new Map<number, any[]>();
//     if (dispenseIds.length > 0) {
//       const dItems = await this.prisma.dispenseItem.findMany({
//         where: { dispenseRecordId: { in: dispenseIds } },
//         include: {
//           product: true,
//           prescriptionItem: { include: { product: true } },
//         },
//       });
//       for (const it of dItems) {
//         const l = itemsByDispense.get(it.dispenseRecordId) ?? [];
//         l.push(it);
//         itemsByDispense.set(it.dispenseRecordId, l);
//       }
//     }

//     const lines: InvoiceLineDetailDto[] = invoice.charges.map((ch: any) => {
//       const line: InvoiceLineDetailDto = {
//         id: ch.id,
//         description: ch.serviceItem?.name ?? 'خدمة',
//         serviceCode: ch.serviceItem?.code ?? null,
//         serviceType: ch.serviceItem?.type ?? null,
//         quantity: Number(ch.quantity ?? 1),
//         unitPrice: Number(ch.unitPrice),
//         totalAmount: Number(ch.totalAmount),
//       };

//       if (
//         ch.serviceItem?.type === ServiceType.PHARMACY &&
//         ch.sourceType === ChargeSource.PHARMACY &&
//         ch.sourceId != null
//       ) {
//         const dItems = itemsByDispense.get(ch.sourceId as number) ?? [];

//         line.pharmacyItems = dItems.map((it: any): PharmacyInvoiceItemDto => {
//           const originalProd = it.prescriptionItem?.product ?? null;
//           const dispProd = it.product;

//           const isSubstitute =
//             !!originalProd && originalProd.id !== it.productId;

//           return {
//             id: it.id,
//             quantity: Number(it.quantity),
//             unitPrice: Number(it.unitPrice),
//             totalAmount: Number(it.totalAmount),
//             isSubstitute,
//             dispensedDrug: dispProd
//               ? {
//                   id: dispProd.id,
//                   code: dispProd.code,
//                   name: dispProd.name,
//                   strength: dispProd.strength,
//                   form: dispProd.form,
//                 }
//               : null,
//             originalDrug: originalProd
//               ? {
//                   id: originalProd.id,
//                   code: originalProd.code,
//                   name: originalProd.name,
//                   strength: originalProd.strength,
//                   form: originalProd.form,
//                 }
//               : null,
//           };
//         });
//       }

//       return line;
//     });

//     return {
//       invoice: {
//         id: invoice.id,
//         status: invoice.status,
//         totalAmount,
//         discountAmount,
//         paidAmount,
//         remainingAmount,
//         currency: invoice.currency,
//         createdAt: invoice.createdAt,
//         patientShare: Number(invoice.patientShare),
//         insuranceShare: Number(invoice.insuranceShare),
//         patient: invoice.patient,
//         encounter: invoice.encounter
//           ? { id: invoice.encounter.id, type: invoice.encounter.type }
//           : null,
//       },
//       lines,
//     };
//   }

//   async getPatientStatement(hospitalId: number, patientId: number) {
//     const patient = await this.prisma.patient.findFirst({
//       where: { id: patientId, hospitalId },
//       select: { id: true, fullName: true, mrn: true },
//     });
//     if (!patient) throw new NotFoundException('المريض غير موجود.');

//     const invoices = await this.prisma.invoice.findMany({
//       where: { hospitalId, patientId },
//       include: { encounter: { select: { id: true, type: true } } },
//       orderBy: { createdAt: 'asc' },
//     });

//     const payments = await this.prisma.payment.findMany({
//       where: { hospitalId, invoice: { patientId } },
//       include: { invoice: { select: { id: true, createdAt: true } } },
//       orderBy: { paidAt: 'asc' },
//     });

//     const invoiceDtos = invoices.map((inv) => {
//       const t = Number(inv.totalAmount);
//       const d = Number(inv.discountAmount);
//       const p = Number(inv.paidAmount);
//       return {
//         id: inv.id,
//         status: inv.status,
//         totalAmount: t,
//         discountAmount: d,
//         paidAmount: p,
//         remainingAmount: t - d - p,
//         createdAt: inv.createdAt,
//         encounter: inv.encounter,
//       };
//     });

//     const paymentDtos = payments.map((p) => ({
//       id: p.id,
//       invoiceId: p.invoiceId,
//       amount: Number(p.amount),
//       method: p.method,
//       reference: p.reference,
//       paidAt: p.paidAt,
//       invoice: p.invoice,
//     }));

//     // حساب الإجماليات
//     const totalInvoiced = invoiceDtos.reduce((s, i) => s + i.totalAmount, 0);
//     const totalDiscount = invoiceDtos.reduce((s, i) => s + i.discountAmount, 0);
//     const totalPaid = invoiceDtos.reduce((s, i) => s + i.paidAmount, 0);

//     return {
//       patient,
//       summary: {
//         totalInvoiced,
//         totalDiscount,
//         totalPaid,
//         remaining: totalInvoiced - totalDiscount - totalPaid,
//       },
//       invoices: invoiceDtos,
//       payments: paymentDtos,
//     };
//   }

//   // ... (باقي الدوال مثل getPaymentReceipt, getDailyReport... لا تحتاج تعديل كبير، اتركها كما في ملفك الأصلي)
//   // تأكد من نسخها كاملة لكي لا تفقدها.

//   async getPaymentReceipt(hospitalId: number, paymentId: number) {
//     // (نفس الكود السابق)
//     const payment = await this.prisma.payment.findFirst({
//       where: { id: paymentId, hospitalId },
//       include: {
//         invoice: {
//           include: {
//             patient: { select: { id: true, fullName: true, mrn: true } },
//             adjustments: { where: { status: 'POSTED' }, select: { delta: true } },
//         encounter: { select: { id: true, type: true } },
//           },
//         },
//       },
//     });

//     if (!payment) throw new NotFoundException('الدفعة غير موجودة.');
//     const inv = payment.invoice;

//     return {
//       payment: {
//         id: payment.id,
//         amount: Number(payment.amount),
//         method: payment.method,
//         paidAt: payment.paidAt,
//         reference: payment.reference ?? null,
//       },
//       invoice: {
//         id: inv.id,
//         status: inv.status,
//         totalAmount: Number(inv.totalAmount),
//         discountAmount: Number(inv.discountAmount),
//         paidAmount: Number(inv.paidAmount),
//         remainingAmount:
//           Number(inv.totalAmount) -
//           Number(inv.discountAmount) -
//           Number(inv.paidAmount),
//         currency: inv.currency,
//         createdAt: inv.createdAt,
//       },
//       patient: inv.patient,
//       encounter: inv.encounter,
//     };
//   }

//   async getDailyReport(hospitalId: number, params: { start: Date; end: Date }) {
//     // (نفس الكود السابق)
//     const { start, end } = params;

//     const paymentsAgg = await this.prisma.payment.groupBy({
//       by: ['method'],
//       where: { hospitalId, paidAt: { gte: start, lte: end } },
//       _sum: { amount: true },
//       _count: { _all: true },
//     });

//     const totalPaymentsAmount = paymentsAgg.reduce(
//       (s, r) => s + Number(r._sum.amount ?? 0),
//       0,
//     );
//     const totalPaymentsCount = paymentsAgg.reduce(
//       (s, r) => s + (r._count._all ?? 0),
//       0,
//     );

//     const paymentsByMethod = paymentsAgg.map((row) => ({
//       method: row.method,
//       totalAmount: Number(row._sum.amount ?? 0),
//       count: row._count._all ?? 0,
//     }));

//     const invoicesAgg = await this.prisma.invoice.aggregate({
//       where: { hospitalId, createdAt: { gte: start, lte: end } },
//       _sum: { totalAmount: true, discountAmount: true, paidAmount: true },
//       _count: { _all: true },
//     });

//     const tInv = Number(invoicesAgg._sum.totalAmount ?? 0);
//     const tDisc = Number(invoicesAgg._sum.discountAmount ?? 0);
//     const tPaid = Number(invoicesAgg._sum.paidAmount ?? 0);

//     return {
//       dateFrom: start.toISOString(),
//       dateTo: end.toISOString(),
//       paymentsSummary: {
//         totalAmount: totalPaymentsAmount,
//         totalCount: totalPaymentsCount,
//       },
//       paymentsByMethod,
//       invoicesSummary: {
//         invoiceCount: invoicesAgg._count._all,
//         totalInvoiced: tInv,
//         totalDiscount: tDisc,
//         totalPaid: tPaid,
//         totalRemaining: tInv - tDisc - tPaid,
//       },
//     };
//   }

//   async listCashierUsers(hospitalId: number) {
//     return this.prisma.user.findMany({
//       where: { hospitalId, isActive: true },
//       select: { id: true, fullName: true, username: true },
//       orderBy: { fullName: 'asc' },
//     });
//   }

//   async getCashierUserReport(
//     hospitalId: number,
//     cashierId: number,
//     params: { start: Date; end: Date },
//   ) {
//     // (نفس الكود السابق)
//     const { start, end } = params;
//     const cashier = await this.prisma.user.findFirst({
//       where: { id: cashierId, hospitalId, isActive: true },
//       select: { id: true, fullName: true, username: true },
//     });
//     if (!cashier) throw new NotFoundException('الكاشير غير موجود.');

//     const payments = await this.prisma.payment.findMany({
//       where: { hospitalId, cashierId, paidAt: { gte: start, lte: end } },
//       include: {
//         invoice: {
//           select: {
//             id: true,
//             patient: { select: { id: true, fullName: true, mrn: true } },
//           },
//         },
//       },
//       orderBy: { paidAt: 'asc' },
//     });

//     let totalAmount = 0;
//     let cashAmount = 0;
//     const byMethod = new Map<
//       PaymentMethod,
//       { totalAmount: number; count: number }
//     >();

//     for (const p of payments) {
//       const amt = Number(p.amount);
//       totalAmount += amt;
//       if (p.method === PaymentMethod.CASH) cashAmount += amt;

//       const current = byMethod.get(p.method) ?? { totalAmount: 0, count: 0 };
//       current.totalAmount += amt;
//       current.count += 1;
//       byMethod.set(p.method, current);
//     }

//     const paymentsByMethod = Array.from(byMethod.entries()).map(
//       ([method, agg]) => ({ method, ...agg }),
//     );

//     const paymentRows = payments.map((p) => ({
//       id: p.id,
//       amount: Number(p.amount),
//       method: p.method,
//       paidAt: p.paidAt,
//       reference: p.reference,
//       invoiceId: p.invoiceId,
//       patient: p.invoice?.patient ?? null,
//     }));

//     return {
//       cashier,
//       dateFrom: start.toISOString(),
//       dateTo: end.toISOString(),
//       paymentsSummary: {
//         totalAmount,
//         totalCount: payments.length,
//         cashAmount,
//       },
//       paymentsByMethod,
//       payments: paymentRows,
//     };
//   }

//   async closeCashierShift(
//     hospitalId: number,
//     cashierId: number,
//     params: { start: Date; end: Date; actualCash: number; note?: string },
//   ) {
//     // (نفس الكود السابق - لا تغيير)
//     const { start, end, actualCash, note } = params;

//     let rangeStart = start;
//     let rangeEnd = end;
//     if (rangeEnd <= rangeStart) {
//       rangeEnd = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);
//     }

//     if (actualCash < 0)
//       throw new BadRequestException('المبلغ لا يمكن أن يكون سالباً.');

//     // تحقق من التداخل
//     const overlapping = await this.prisma.cashierShiftClosing.findFirst({
//       where: {
//         hospitalId,
//         cashierId,
//         rangeStart: { lt: rangeEnd },
//         rangeEnd: { gt: rangeStart },
//       },
//     });
//     if (overlapping)
//       throw new BadRequestException('يوجد شفت مغلق يتداخل مع هذه الفترة.');

//     const payments = await this.prisma.payment.findMany({
//       where: {
//         hospitalId,
//         cashierId,
//         paidAt: { gte: rangeStart, lte: rangeEnd },
//       },
//     });

//     const systemCashTotalDec = payments
//       .filter((p) => p.method === PaymentMethod.CASH)
//       .reduce((sum, p) => sum.plus(p.amount ?? 0), new Prisma.Decimal(0));

//     const actualDec = new Prisma.Decimal(actualCash);
//     const difference = actualDec.minus(systemCashTotalDec);
//     const absDiff = difference.abs();

//     const result = await this.prisma.$transaction(async (tx) => {
//       const shift = await tx.cashierShiftClosing.create({
//         data: {
//           hospitalId,
//           cashierId,
//           rangeStart,
//           rangeEnd,
//           systemCashTotal: systemCashTotalDec,
//           actualCashTotal: actualDec,
//           difference,
//           note: note ?? null,
//         },
//       });

//       let accountingEntryId: number | null = null;
//       if (!difference.isZero()) {
//         const cashMapping = await tx.systemAccountMapping.findFirst({
//           where: {
//             hospitalId,
//             key: SystemAccountKey.CASH_MAIN,
//             isActive: true,
//           },
//           include: { account: true },
//         });
//         const diffMapping = await tx.systemAccountMapping.findFirst({
//           where: {
//             hospitalId,
//             key: SystemAccountKey.CASH_SHORT_OVER,
//             isActive: true,
//           },
//           include: { account: true },
//         });

//         if (cashMapping?.account && diffMapping?.account) {
//           const lines: Prisma.AccountingEntryLineCreateWithoutEntryInput[] =
//             difference.greaterThan(0)
//               ? [
//                   {
//                     account: { connect: { id: cashMapping.account.id } },
//                     debit: absDiff,
//                     credit: 0,
//                     description: `زيادة صندوق - شفت #${shift.id}`,
//                   },
//                   {
//                     account: { connect: { id: diffMapping.account.id } },
//                     debit: 0,
//                     credit: absDiff,
//                     description: `زيادة صندوق - شفت #${shift.id}`,
//                   },
//                 ]
//               : [
//                   {
//                     account: { connect: { id: diffMapping.account.id } },
//                     debit: absDiff,
//                     credit: 0,
//                     description: `عجز صندوق - شفت #${shift.id}`,
//                   },
//                   {
//                     account: { connect: { id: cashMapping.account.id } },
//                     debit: 0,
//                     credit: absDiff,
//                     description: `عجز صندوق - شفت #${shift.id}`,
//                   },
//                 ];

//           const entry = await tx.accountingEntry.create({
//             data: {
//               hospitalId,
//               entryDate: rangeEnd,
//               description: `فروق صندوق - شفت كاشير #${cashierId}`,
//               sourceModule: AccountingSourceModule.CASHIER,
//               sourceId: shift.id,
//               lines: { create: lines },
//             },
//           });
//           accountingEntryId = entry.id;

//           await tx.cashierShiftClosing.update({
//             where: { id: shift.id },
//             data: { accountingEntryId },
//           });
//         }
//       }
//       return { shift, accountingEntryId };
//     });

//     return {
//       id: result.shift.id,
//       rangeStart: result.shift.rangeStart,
//       rangeEnd: result.shift.rangeEnd,
//       systemCashTotal: Number(systemCashTotalDec.toFixed(3)),
//       actualCashTotal: Number(actualDec.toFixed(3)),
//       difference: Number(difference.toFixed(3)),
//       note: result.shift.note,
//       accountingEntryId: result.accountingEntryId,
//     };
//   }

//   async listCashierShifts(
//     hospitalId: number,
//     params: { start: Date; end: Date; cashierId?: number },
//   ) {
//     // (نفس الكود السابق - لا تغيير)
//     const { start, end, cashierId } = params;
//     const where: any = {
//       hospitalId,
//       rangeStart: { gte: start },
//       rangeEnd: { lte: end },
//     };
//     if (cashierId) where.cashierId = cashierId;

//     return this.prisma.cashierShiftClosing.findMany({
//       where,
//       include: {
//         cashier: { select: { id: true, fullName: true, username: true } },
//       },
//       orderBy: { rangeStart: 'desc' },
//     });
//   }
// }

// // src/cashier/cashier.service.ts

// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   InvoiceStatus,
//   PaymentMethod,
//   ChargeSource,
//   ServiceType,
//   SystemAccountKey,
//   AccountingSourceModule,
//   Prisma,
// } from '@prisma/client';
// import { AccountingService } from '../accounting/accounting.service';

// type PharmacyInvoiceItemDto = {
//   id: number;
//   quantity: number;
//   unitPrice: number;
//   totalAmount: number;
//   isSubstitute: boolean;
//   dispensedDrug: {
//     id: number;
//     code: string | null;
//     name: string;
//     strength: string | null;
//     form: string | null;
//   } | null;
//   originalDrug: {
//     id: number;
//     code: string | null;
//     name: string;
//     strength: string | null;
//     form: string | null;
//   } | null;
// };

// type InvoiceLineDetailDto = {
//   id: number;
//   description: string;
//   serviceCode: string | null;
//   serviceType: string | null;
//   quantity: number;
//   unitPrice: number;
//   totalAmount: number;
//   pharmacyItems?: PharmacyInvoiceItemDto[];
// };

// export type PaymentReceiptDto = {
//   payment: {
//     id: number;
//     amount: number;
//     method: PaymentMethod;
//     paidAt: Date;
//     reference: string | null;
//   };
//   invoice: {
//     id: number;
//     status: InvoiceStatus;
//     totalAmount: number;
//     discountAmount: number;
//     paidAmount: number;
//     remainingAmount: number;
//     currency: string;
//     createdAt: Date;
//   };
//   patient: { id: number; fullName: string; mrn: string } | null;
//   encounter: { id: number; type: string } | null;
// };

// @Injectable()
// export class CashierService {
//   constructor(
//     private prisma: PrismaService,
//     private accounting: AccountingService,
//   ) {}

//   private mapInvoiceToWorklistDto(inv: any) {
//     const totalAmount = Number(inv.totalAmount);
//     const discountAmount = Number(inv.discountAmount);
//     const paidAmount = Number(inv.paidAmount);
//     const remainingAmount = totalAmount - discountAmount - paidAmount;

//     return {
//       id: inv.id as number,
//       status: inv.status as InvoiceStatus,
//       totalAmount,
//       discountAmount,
//       paidAmount,
//       remainingAmount,
//       createdAt: inv.createdAt as Date,
//       patient: inv.patient as {
//         id: number;
//         fullName: string;
//         mrn: string;
//       } | null,
//       encounter: inv.encounter as {
//         id: number;
//         type: string;
//       } | null,
//     };
//   }

//   async getWorklist(hospitalId: number) {
//     const invoices = await this.prisma.invoice.findMany({
//       where: {
//         hospitalId,
//         status: {
//           in: [
//             InvoiceStatus.DRAFT,
//             InvoiceStatus.ISSUED,
//             InvoiceStatus.PARTIALLY_PAID,
//           ],
//         },
//       },
//       include: {
//         patient: { select: { id: true, fullName: true, mrn: true } },
//         adjustments: { where: { status: 'POSTED' }, select: { delta: true } },
//         encounter: { select: { id: true, type: true } },
//       },
//       orderBy: { createdAt: 'asc' },
//     });

//     const result: ReturnType<CashierService['mapInvoiceToWorklistDto']>[] = [];
//     for (const inv of invoices) {
//       const dto = this.mapInvoiceToWorklistDto(inv);
//       if (dto.remainingAmount > 0.0001) {
//         result.push(dto);
//       }
//     }
//     return result;
//   }

//   async recordPayment(params: {
//     hospitalId: number;
//     invoiceId: number;
//     amount: number;
//     method: PaymentMethod;
//     reference?: string;
//     userId: number;
//   }) {
//     const { hospitalId, invoiceId, amount, method, reference, userId } = params;

//     if (!amount || amount <= 0) {
//       throw new BadRequestException('قيمة الدفعة يجب أن تكون أكبر من الصفر.');
//     }

//     const { updatedInvoice, payment } = await this.prisma.$transaction(
//       async (tx) => {
//         const invoice = await tx.invoice.findUnique({
//           where: { id: invoiceId },
//         });

//         if (!invoice) throw new NotFoundException('الفاتورة غير موجودة.');
//         if (invoice.hospitalId !== hospitalId)
//           throw new BadRequestException('هذه الفاتورة لا تنتمي لهذه المنشأة.');

//         const totalAmount = Number(invoice.totalAmount);
//         const discountAmount = Number(invoice.discountAmount);
//         const paidAmount = Number(invoice.paidAmount);
//         const remainingAmount = totalAmount - discountAmount - paidAmount;

//         if (remainingAmount <= 0.0001)
//           throw new BadRequestException('لا يوجد رصيد مستحق على هذه الفاتورة.');
//         if (amount > remainingAmount + 0.0001)
//           throw new BadRequestException(
//             'قيمة الدفعة أكبر من الرصيد المتبقي على الفاتورة.',
//           );

//         const payment = await tx.payment.create({
//           data: {
//             hospitalId,
//             invoiceId,
//             amount,
//             method,
//             reference: reference ?? null,
//             cashierId: userId,
//           },
//         });

//         const newPaid = paidAmount + amount;
//         let newStatus: InvoiceStatus =
//           totalAmount - discountAmount - newPaid <= 0.0001
//             ? InvoiceStatus.PAID
//             : InvoiceStatus.PARTIALLY_PAID;

//         const updatedInvoice = await tx.invoice.update({
//           where: { id: invoiceId },
//           data: { paidAmount: newPaid, status: newStatus },
//         });

//         return { updatedInvoice, payment };
//       },
//     );

//     await this.accounting.recordPaymentEntry({
//       paymentId: payment.id,
//       hospitalId,
//       userId,
//     });

//     return {
//       id: updatedInvoice.id,
//       status: updatedInvoice.status,
//       totalAmount: Number(updatedInvoice.totalAmount),
//       discountAmount: Number(updatedInvoice.discountAmount),
//       paidAmount: Number(updatedInvoice.paidAmount),
//       paymentId: payment.id,
//     };
//   }

//   async getInvoiceDetails(hospitalId: number, invoiceId: number) {
//     const invoice = await this.prisma.invoice.findFirst({
//       where: { id: invoiceId, hospitalId },
//       include: {
//         patient: { select: { id: true, fullName: true, mrn: true } },
//         adjustments: { where: { status: 'POSTED' }, select: { delta: true } },
//         encounter: { select: { id: true, type: true } },
//         charges: {
//           include: { serviceItem: true },
//           orderBy: { id: 'asc' },
//         },
//       },
//     });

//     if (!invoice) throw new NotFoundException('الفاتورة غير موجودة.');

//     const totalAmount = Number(invoice.totalAmount);
//     const discountAmount = Number(invoice.discountAmount);
//     const paidAmount = Number(invoice.paidAmount);
//     const remainingAmount = totalAmount - discountAmount - paidAmount;

//     // --- Pharmacy breakdown ---
//     const pharmacyCharges = invoice.charges.filter(
//       (ch) =>
//         ch.serviceItem?.type === ServiceType.PHARMACY &&
//         ch.sourceType === ChargeSource.PHARMACY &&
//         ch.sourceId != null,
//     );

//     const dispenseIds = pharmacyCharges
//       .map((ch) => ch.sourceId as number)
//       .filter((id) => !!id);

//     let itemsByDispense = new Map<number, any[]>();

//     if (dispenseIds.length > 0) {
//       const dispenseItems = await this.prisma.dispenseItem.findMany({
//         where: { dispenseRecordId: { in: dispenseIds } },
//         include: {
//           // ✅ [CORRECTED] Use `product` instead of `dispensedDrugItem`
//           product: true,
//           prescriptionItem: {
//             include: {
//               // ✅ [CORRECTED] Use `product` here too
//               product: true,
//             },
//           },
//         },
//       });

//       itemsByDispense = new Map<number, any[]>();
//       for (const it of dispenseItems) {
//         const list = itemsByDispense.get(it.dispenseRecordId) ?? [];
//         list.push(it);
//         itemsByDispense.set(it.dispenseRecordId, list);
//       }
//     }

//     const lines: InvoiceLineDetailDto[] = invoice.charges.map((ch: any) => {
//       const line: InvoiceLineDetailDto = {
//         id: ch.id,
//         description: ch.serviceItem?.name ?? 'خدمة',
//         serviceCode: ch.serviceItem?.code ?? null,
//         serviceType: ch.serviceItem?.type ?? null,
//         quantity: Number(ch.quantity ?? 1),
//         unitPrice: Number(ch.unitPrice),
//         totalAmount: Number(ch.totalAmount),
//       };

//       if (
//         ch.serviceItem?.type === ServiceType.PHARMACY &&
//         ch.sourceType === ChargeSource.PHARMACY &&
//         ch.sourceId != null
//       ) {
//         const dItems = itemsByDispense.get(ch.sourceId as number) ?? [];

//         line.pharmacyItems = dItems.map((it: any): PharmacyInvoiceItemDto => {
//           // ✅ Mapping updated Product fields to the frontend structure
//           const originalProd = it.prescriptionItem?.product ?? null;
//           const dispProd = it.product;

//           const isSubstitute =
//             !!originalProd && originalProd.id !== it.productId;

//           return {
//             id: it.id,
//             quantity: Number(it.quantity),
//             unitPrice: Number(it.unitPrice),
//             totalAmount: Number(it.totalAmount),
//             isSubstitute,
//             dispensedDrug: dispProd
//               ? {
//                   id: dispProd.id,
//                   code: dispProd.code,
//                   name: dispProd.name,
//                   strength: dispProd.strength,
//                   form: dispProd.form,
//                 }
//               : null,
//             originalDrug: originalProd
//               ? {
//                   id: originalProd.id,
//                   code: originalProd.code,
//                   name: originalProd.name,
//                   strength: originalProd.strength,
//                   form: originalProd.form,
//                 }
//               : null,
//           };
//         });
//       }

//       return line;
//     });

//     return {
//       invoice: {
//         id: invoice.id,
//         status: invoice.status,
//         totalAmount,
//         discountAmount,
//         paidAmount,
//         remainingAmount,
//         currency: invoice.currency,
//         createdAt: invoice.createdAt,
//         patient: invoice.patient,
//         encounter: invoice.encounter
//           ? { id: invoice.encounter.id, type: invoice.encounter.type }
//           : null,
//       },
//       lines,
//     };
//   }

//   async getPatientStatement(hospitalId: number, patientId: number) {
//     // ... (هذه الدالة لم تتغير لأنها لا تعتمد على المخزون)
//     const patient = await this.prisma.patient.findFirst({
//       where: { id: patientId, hospitalId },
//       select: { id: true, fullName: true, mrn: true },
//     });
//     if (!patient) throw new NotFoundException('المريض غير موجود.');

//     const invoices = await this.prisma.invoice.findMany({
//       where: { hospitalId, patientId },
//       include: { encounter: { select: { id: true, type: true } } },
//       orderBy: { createdAt: 'asc' },
//     });

//     const payments = await this.prisma.payment.findMany({
//       where: { hospitalId, invoice: { patientId } },
//       include: { invoice: { select: { id: true, createdAt: true } } },
//       orderBy: { paidAt: 'asc' },
//     });

//     let totalInvoiced = 0,
//       totalDiscount = 0,
//       totalPaid = 0;

//     const invoiceDtos = invoices.map((inv) => {
//       const t = Number(inv.totalAmount);
//       const d = Number(inv.discountAmount);
//       const p = Number(inv.paidAmount);
//       totalInvoiced += t;
//       totalDiscount += d;
//       totalPaid += p;
//       return {
//         id: inv.id,
//         status: inv.status,
//         totalAmount: t,
//         discountAmount: d,
//         paidAmount: p,
//         remainingAmount: t - d - p,
//         createdAt: inv.createdAt,
//         encounter: inv.encounter,
//       };
//     });

//     const paymentDtos = payments.map((p) => ({
//       id: p.id,
//       invoiceId: p.invoiceId,
//       amount: Number(p.amount),
//       method: p.method,
//       reference: p.reference,
//       paidAt: p.paidAt,
//       invoice: p.invoice,
//     }));

//     return {
//       patient,
//       summary: {
//         totalInvoiced,
//         totalDiscount,
//         totalPaid,
//         remaining: totalInvoiced - totalDiscount - totalPaid,
//       },
//       invoices: invoiceDtos,
//       payments: paymentDtos,
//     };
//   }

//   async getPaymentReceipt(hospitalId: number, paymentId: number) {
//     const payment = await this.prisma.payment.findFirst({
//       where: { id: paymentId, hospitalId },
//       include: {
//         invoice: {
//           include: {
//             patient: { select: { id: true, fullName: true, mrn: true } },
//             adjustments: { where: { status: 'POSTED' }, select: { delta: true } },
//         encounter: { select: { id: true, type: true } },
//           },
//         },
//       },
//     });

//     if (!payment) throw new NotFoundException('الدفعة غير موجودة.');
//     const inv = payment.invoice;

//     const totalAmount = Number(inv.totalAmount);
//     const discountAmount = Number(inv.discountAmount);
//     const paidAmount = Number(inv.paidAmount);
//     const remainingAmount = totalAmount - discountAmount - paidAmount;

//     return {
//       payment: {
//         id: payment.id,
//         amount: Number(payment.amount),
//         method: payment.method,
//         paidAt: payment.paidAt,
//         reference: payment.reference ?? null,
//       },
//       invoice: {
//         id: inv.id,
//         status: inv.status,
//         totalAmount,
//         discountAmount,
//         paidAmount,
//         remainingAmount,
//         currency: inv.currency,
//         createdAt: inv.createdAt,
//       },
//       patient: inv.patient,
//       encounter: inv.encounter,
//     };
//   }

//   async getDailyReport(hospitalId: number, params: { start: Date; end: Date }) {
//     const { start, end } = params;

//     const paymentsAgg = await this.prisma.payment.groupBy({
//       by: ['method'],
//       where: { hospitalId, paidAt: { gte: start, lte: end } },
//       _sum: { amount: true },
//       _count: { _all: true },
//     });

//     const totalPaymentsAmount = paymentsAgg.reduce(
//       (s, r) => s + Number(r._sum.amount ?? 0),
//       0,
//     );
//     const totalPaymentsCount = paymentsAgg.reduce(
//       (s, r) => s + (r._count._all ?? 0),
//       0,
//     );

//     const paymentsByMethod = paymentsAgg.map((row) => ({
//       method: row.method,
//       totalAmount: Number(row._sum.amount ?? 0),
//       count: row._count._all ?? 0,
//     }));

//     const invoicesAgg = await this.prisma.invoice.aggregate({
//       where: { hospitalId, createdAt: { gte: start, lte: end } },
//       _sum: { totalAmount: true, discountAmount: true, paidAmount: true },
//       _count: { _all: true },
//     });

//     const tInv = Number(invoicesAgg._sum.totalAmount ?? 0);
//     const tDisc = Number(invoicesAgg._sum.discountAmount ?? 0);
//     const tPaid = Number(invoicesAgg._sum.paidAmount ?? 0);

//     return {
//       dateFrom: start.toISOString(),
//       dateTo: end.toISOString(),
//       paymentsSummary: {
//         totalAmount: totalPaymentsAmount,
//         totalCount: totalPaymentsCount,
//       },
//       paymentsByMethod,
//       invoicesSummary: {
//         invoiceCount: invoicesAgg._count._all,
//         totalInvoiced: tInv,
//         totalDiscount: tDisc,
//         totalPaid: tPaid,
//         totalRemaining: tInv - tDisc - tPaid,
//       },
//     };
//   }

//   async listCashierUsers(hospitalId: number) {
//     return this.prisma.user.findMany({
//       where: { hospitalId, isActive: true },
//       select: { id: true, fullName: true, username: true },
//       orderBy: { fullName: 'asc' },
//     });
//   }

//   async getCashierUserReport(
//     hospitalId: number,
//     cashierId: number,
//     params: { start: Date; end: Date },
//   ) {
//     const { start, end } = params;
//     const cashier = await this.prisma.user.findFirst({
//       where: { id: cashierId, hospitalId, isActive: true },
//       select: { id: true, fullName: true, username: true },
//     });
//     if (!cashier) throw new NotFoundException('الكاشير غير موجود.');

//     const payments = await this.prisma.payment.findMany({
//       where: { hospitalId, cashierId, paidAt: { gte: start, lte: end } },
//       include: {
//         invoice: {
//           select: {
//             id: true,
//             patient: { select: { id: true, fullName: true, mrn: true } },
//           },
//         },
//       },
//       orderBy: { paidAt: 'asc' },
//     });

//     let totalAmount = 0;
//     let cashAmount = 0;
//     const byMethod = new Map<
//       PaymentMethod,
//       { totalAmount: number; count: number }
//     >();

//     for (const p of payments) {
//       const amt = Number(p.amount);
//       totalAmount += amt;
//       if (p.method === PaymentMethod.CASH) cashAmount += amt;

//       const current = byMethod.get(p.method) ?? { totalAmount: 0, count: 0 };
//       current.totalAmount += amt;
//       current.count += 1;
//       byMethod.set(p.method, current);
//     }

//     const paymentsByMethod = Array.from(byMethod.entries()).map(
//       ([method, agg]) => ({ method, ...agg }),
//     );

//     const paymentRows = payments.map((p) => ({
//       id: p.id,
//       amount: Number(p.amount),
//       method: p.method,
//       paidAt: p.paidAt,
//       reference: p.reference,
//       invoiceId: p.invoiceId,
//       patient: p.invoice?.patient ?? null,
//     }));

//     return {
//       cashier,
//       dateFrom: start.toISOString(),
//       dateTo: end.toISOString(),
//       paymentsSummary: {
//         totalAmount,
//         totalCount: payments.length,
//         cashAmount,
//       },
//       paymentsByMethod,
//       payments: paymentRows,
//     };
//   }

//   async closeCashierShift(
//     hospitalId: number,
//     cashierId: number,
//     params: { start: Date; end: Date; actualCash: number; note?: string },
//   ) {
//     // ... (هذه الدالة تعتمد على CashierShiftClosing ولم تتأثر بالمخزون، لذا تعمل كما هي)
//     const { start, end, actualCash, note } = params;

//     let rangeStart = start;
//     let rangeEnd = end;
//     if (rangeEnd <= rangeStart) {
//       rangeEnd = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);
//     }

//     if (actualCash < 0)
//       throw new BadRequestException('المبلغ لا يمكن أن يكون سالباً.');

//     // تحقق من التداخل
//     const overlapping = await this.prisma.cashierShiftClosing.findFirst({
//       where: {
//         hospitalId,
//         cashierId,
//         rangeStart: { lt: rangeEnd },
//         rangeEnd: { gt: rangeStart },
//       },
//     });
//     if (overlapping)
//       throw new BadRequestException('يوجد شفت مغلق يتداخل مع هذه الفترة.');

//     const payments = await this.prisma.payment.findMany({
//       where: {
//         hospitalId,
//         cashierId,
//         paidAt: { gte: rangeStart, lte: rangeEnd },
//       },
//     });

//     const systemCashTotalDec = payments
//       .filter((p) => p.method === PaymentMethod.CASH)
//       .reduce((sum, p) => sum.plus(p.amount ?? 0), new Prisma.Decimal(0));

//     const actualDec = new Prisma.Decimal(actualCash);
//     const difference = actualDec.minus(systemCashTotalDec);
//     const absDiff = difference.abs();

//     const result = await this.prisma.$transaction(async (tx) => {
//       const shift = await tx.cashierShiftClosing.create({
//         data: {
//           hospitalId,
//           cashierId,
//           rangeStart,
//           rangeEnd,
//           systemCashTotal: systemCashTotalDec,
//           actualCashTotal: actualDec,
//           difference,
//           note: note ?? null,
//         },
//       });

//       let accountingEntryId: number | null = null;
//       if (!difference.isZero()) {
//         const cashMapping = await tx.systemAccountMapping.findFirst({
//           where: {
//             hospitalId,
//             key: SystemAccountKey.CASH_MAIN,
//             isActive: true,
//           },
//           include: { account: true },
//         });
//         const diffMapping = await tx.systemAccountMapping.findFirst({
//           where: {
//             hospitalId,
//             key: SystemAccountKey.CASH_SHORT_OVER,
//             isActive: true,
//           },
//           include: { account: true },
//         });

//         if (cashMapping?.account && diffMapping?.account) {
//           const lines: Prisma.AccountingEntryLineCreateWithoutEntryInput[] =
//             difference.greaterThan(0)
//               ? [
//                   {
//                     account: { connect: { id: cashMapping.account.id } },
//                     debit: absDiff,
//                     credit: 0,
//                     description: `زيادة صندوق - شفت #${shift.id}`,
//                   },
//                   {
//                     account: { connect: { id: diffMapping.account.id } },
//                     debit: 0,
//                     credit: absDiff,
//                     description: `زيادة صندوق - شفت #${shift.id}`,
//                   },
//                 ]
//               : [
//                   {
//                     account: { connect: { id: diffMapping.account.id } },
//                     debit: absDiff,
//                     credit: 0,
//                     description: `عجز صندوق - شفت #${shift.id}`,
//                   },
//                   {
//                     account: { connect: { id: cashMapping.account.id } },
//                     debit: 0,
//                     credit: absDiff,
//                     description: `عجز صندوق - شفت #${shift.id}`,
//                   },
//                 ];

//           const entry = await tx.accountingEntry.create({
//             data: {
//               hospitalId,
//               entryDate: rangeEnd,
//               description: `فروق صندوق - شفت كاشير #${cashierId}`,
//               sourceModule: AccountingSourceModule.CASHIER,
//               sourceId: shift.id,
//               lines: { create: lines },
//             },
//           });
//           accountingEntryId = entry.id;

//           await tx.cashierShiftClosing.update({
//             where: { id: shift.id },
//             data: { accountingEntryId },
//           });
//         }
//       }
//       return { shift, accountingEntryId };
//     });

//     return {
//       id: result.shift.id,
//       rangeStart: result.shift.rangeStart,
//       rangeEnd: result.shift.rangeEnd,
//       systemCashTotal: Number(systemCashTotalDec.toFixed(3)),
//       actualCashTotal: Number(actualDec.toFixed(3)),
//       difference: Number(difference.toFixed(3)),
//       note: result.shift.note,
//       accountingEntryId: result.accountingEntryId,
//     };
//   }

//   async listCashierShifts(
//     hospitalId: number,
//     params: { start: Date; end: Date; cashierId?: number },
//   ) {
//     const { start, end, cashierId } = params;
//     const where: any = {
//       hospitalId,
//       rangeStart: { gte: start },
//       rangeEnd: { lte: end },
//     };
//     if (cashierId) where.cashierId = cashierId;

//     return this.prisma.cashierShiftClosing.findMany({
//       where,
//       include: {
//         cashier: { select: { id: true, fullName: true, username: true } },
//       },
//       orderBy: { rangeStart: 'desc' },
//     });
//   }
// }
