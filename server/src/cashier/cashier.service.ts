// src/cashier/cashier.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  InvoiceStatus,
  PaymentMethod,
  ChargeSource,
  ServiceType,
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

  private mapInvoiceToWorklistDto(inv: any) {
    const totalAmount = Number(inv.totalAmount);
    const discountAmount = Number(inv.discountAmount);
    const paidAmount = Number(inv.paidAmount);
    const remainingAmount = totalAmount - discountAmount - paidAmount;

    return {
      id: inv.id as number,
      status: inv.status as InvoiceStatus,
      totalAmount,
      discountAmount,
      paidAmount,
      remainingAmount,
      patientShare: Number(inv.patientShare ?? 0),
      insuranceShare: Number(inv.insuranceShare ?? 0),
      claimStatus: inv.claimStatus,
      createdAt: inv.createdAt as Date,
      patient: inv.patient as {
        id: number;
        fullName: string;
        mrn: string;
        insurancePolicy?: {
          name: string;
          provider: { name: string };
        } | null;
      } | null,
      encounter: inv.encounter as {
        id: number;
        type: string;
      } | null,
    };
  }

  async getWorklist(hospitalId: number) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        hospitalId,
        status: {
          in: [
            InvoiceStatus.DRAFT,
            InvoiceStatus.ISSUED,
            InvoiceStatus.PARTIALLY_PAID,
          ],
        },
      },
      include: {
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
        encounter: { select: { id: true, type: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const result: any[] = [];

    for (const inv of invoices) {
      const dto = this.mapInvoiceToWorklistDto(inv);

      // ✅ منطق الفلترة المحدث:
      // نحسب المتبقي على المريض
      // نفترض أن المدفوع (paidAmount) يغطي حصة المريض أولاً
      const patientPaid = Math.min(dto.paidAmount, dto.patientShare);
      const patientRemaining = dto.patientShare - patientPaid;

      // إذا كان المريض لا يزال مديناً (أكبر من 0.001 لتجنب كسور القسمة)
      if (patientRemaining > 0.001) {
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
    userId: number;
  }) {
    const { hospitalId, invoiceId, amount, method, reference, userId } = params;

    await this.accounting.validateDateInOpenPeriod(
      params.hospitalId,
      new Date(),
    );

    // ✅ السماح بالقيمة 0
    if (amount < 0) {
      throw new BadRequestException('قيمة الدفعة لا يمكن أن تكون سالبة.');
    }

    const { updatedInvoice, payment } = await this.prisma.$transaction(
      async (tx) => {
        const invoice = await tx.invoice.findUnique({
          where: { id: invoiceId },
        });

        if (!invoice) throw new NotFoundException('الفاتورة غير موجودة.');
        if (invoice.hospitalId !== hospitalId)
          throw new BadRequestException('هذه الفاتورة لا تنتمي لهذه المنشأة.');

        const totalAmount = Number(invoice.totalAmount);
        const discountAmount = Number(invoice.discountAmount);
        const paidAmount = Number(invoice.paidAmount);

        let patientShare = Number(invoice.patientShare);
        const insuranceShare = Number(invoice.insuranceShare);

        // تصحيح للبيانات القديمة: إذا لم يكن هناك تأمين، المريض يتحمل الكل
        if (insuranceShare === 0 && patientShare === 0 && totalAmount > 0) {
          patientShare = totalAmount;
        }

        // المبلغ المستحق المتبقي على المريض
        const remainingPatientLiability = Math.max(
          0,
          patientShare - paidAmount,
        );

        // ✅ التحقق
        if (amount > remainingPatientLiability + 0.001) {
          throw new BadRequestException(
            `المبلغ المدخل (${amount}) أكبر من المستحق على المريض (${remainingPatientLiability.toFixed(3)}).`,
          );
        }

        // ✅ معالجة الدفعة الصفرية (0) - تأكيد الفاتورة المغطاة بالكامل
        if (amount === 0) {
          const totalRemaining = totalAmount - discountAmount - paidAmount;
          let newStatus = invoice.status;

          // إذا كان المتبقي هو فقط حصة التأمين، نحولها لـ PARTIALLY_PAID
          // (أو PAID إذا كان التأمين 0 أيضاً، وهو غير محتمل هنا)
          if (totalRemaining <= 0.001) {
            newStatus = InvoiceStatus.PAID;
          } else {
            newStatus = InvoiceStatus.PARTIALLY_PAID;
          }

          // إذا كانت الحالة الحالية already متقدمة، لا نرجع للخلف
          if (invoice.status === InvoiceStatus.PAID)
            newStatus = InvoiceStatus.PAID;

          const updated = await tx.invoice.update({
            where: { id: invoiceId },
            data: { status: newStatus },
          });

          // ✅ [HOOK] Update Order Payment Status when patient share is fully paid
          const patientShareAmt = Number(invoice.patientShare || totalAmount);
          const isPatientPaidFully = paidAmount >= patientShareAmt - 0.001;
          if (isPatientPaidFully || newStatus === InvoiceStatus.PAID) {
            await this.updateRelatedOrdersPaymentStatus(tx, invoiceId);
          }

          return { updatedInvoice: updated, payment: null };
        }

        const payment = await tx.payment.create({
          data: {
            hospitalId,
            invoiceId,
            amount,
            method,
            reference: reference ?? null,
            cashierId: userId,
          },
        });

        const newPaid = paidAmount + amount;

        // تحديث الحالة
        let newStatus: InvoiceStatus = InvoiceStatus.PARTIALLY_PAID;
        const totalRemaining = totalAmount - discountAmount - newPaid;

        if (totalRemaining <= 0.001) {
          newStatus = InvoiceStatus.PAID;
        }

        const updatedInvoice = await tx.invoice.update({
          where: { id: invoiceId },
          data: { paidAmount: newPaid, status: newStatus },
        });

        // ✅ [HOOK] Update Order Payment Status when patient share is fully paid
        // للمرضى المؤمنين: نحدث حالة الطلب عندما يدفع المريض حصته (حتى لو التأمين لم يسدد بعد)
        const patientShareAmount = Number(invoice.patientShare || totalAmount);
        const isPatientShareFullyPaid = newPaid >= patientShareAmount - 0.001;
        if (isPatientShareFullyPaid) {
          await this.updateRelatedOrdersPaymentStatus(tx, invoiceId);
        }

        return { updatedInvoice, payment };
      },
    );

    // ✅ تسجيل القيد المحاسبي فقط إذا كان هناك دفعة حقيقية
    if (payment) {
      await this.accounting.recordPaymentEntry({
        paymentId: payment.id,
        hospitalId,
        userId,
      });
    }

    return {
      id: updatedInvoice.id,
      status: updatedInvoice.status,
      totalAmount: Number(updatedInvoice.totalAmount),
      discountAmount: Number(updatedInvoice.discountAmount),
      paidAmount: Number(updatedInvoice.paidAmount),
      paymentId: payment?.id ?? null,
    };
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
        encounter: { select: { id: true, type: true } },
        charges: {
          include: { serviceItem: true },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة.');

    const totalAmount = Number(invoice.totalAmount);
    const discountAmount = Number(invoice.discountAmount);
    const paidAmount = Number(invoice.paidAmount);
    const remainingAmount = totalAmount - discountAmount - paidAmount;

    // --- Pharmacy breakdown ---
    const dispenseIds = invoice.charges
      .filter(
        (ch) => ch.serviceItem?.type === ServiceType.PHARMACY && ch.sourceId,
      )
      .map((c) => c.sourceId as number);

    let itemsByDispense = new Map<number, any[]>();

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

    const lines: InvoiceLineDetailDto[] = invoice.charges.map((ch: any) => {
      const line: InvoiceLineDetailDto = {
        id: ch.id,
        description: ch.serviceItem?.name ?? 'خدمة',
        serviceCode: ch.serviceItem?.code ?? null,
        serviceType: ch.serviceItem?.type ?? null,
        quantity: Number(ch.quantity ?? 1),
        unitPrice: Number(ch.unitPrice),
        totalAmount: Number(ch.totalAmount),
      };

      if (ch.serviceItem?.type === ServiceType.PHARMACY && ch.sourceId) {
        const dItems = itemsByDispense.get(ch.sourceId) ?? [];
        line.pharmacyItems = dItems.map(
          (it: any): PharmacyInvoiceItemDto => ({
            id: it.id,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            totalAmount: Number(it.totalAmount),
            isSubstitute:
              it.prescriptionItem &&
              it.productId !== it.prescriptionItem.productId,
            dispensedDrug: it.product,
            originalDrug: it.prescriptionItem?.product,
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
        patientShare: Number(invoice.patientShare),
        insuranceShare: Number(invoice.insuranceShare),
        patient: invoice.patient,
        encounter: invoice.encounter
          ? { id: invoice.encounter.id, type: invoice.encounter.type }
          : null,
      },
      lines,
    };
  }

  // ... (بقية الدوال: getPatientStatement, getPaymentReceipt, getDailyReport, listCashierUsers, getCashierUserReport, closeCashierShift, listCashierShifts)
  // يرجى نسخها كما كانت في النسخة السابقة، لم تتطلب تعديلات.
  async getPatientStatement(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId },
      select: { id: true, fullName: true, mrn: true },
    });
    if (!patient) throw new NotFoundException('المريض غير موجود.');

    const invoices = await this.prisma.invoice.findMany({
      where: { hospitalId, patientId },
      include: { encounter: { select: { id: true, type: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const payments = await this.prisma.payment.findMany({
      where: { hospitalId, invoice: { patientId } },
      include: { invoice: { select: { id: true, createdAt: true } } },
      orderBy: { paidAt: 'asc' },
    });

    const invoiceDtos = invoices.map((inv) => {
      const t = Number(inv.totalAmount);
      const d = Number(inv.discountAmount);
      const p = Number(inv.paidAmount);
      return {
        id: inv.id,
        status: inv.status,
        totalAmount: t,
        discountAmount: d,
        paidAmount: p,
        remainingAmount: t - d - p,
        createdAt: inv.createdAt,
        encounter: inv.encounter,
      };
    });

    const paymentDtos = payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      amount: Number(p.amount),
      method: p.method,
      reference: p.reference,
      paidAt: p.paidAt,
      invoice: p.invoice,
    }));

    // حساب الإجماليات
    const totalInvoiced = invoiceDtos.reduce((s, i) => s + i.totalAmount, 0);
    const totalDiscount = invoiceDtos.reduce((s, i) => s + i.discountAmount, 0);
    const totalPaid = invoiceDtos.reduce((s, i) => s + i.paidAmount, 0);

    return {
      patient,
      summary: {
        totalInvoiced,
        totalDiscount,
        totalPaid,
        remaining: totalInvoiced - totalDiscount - totalPaid,
      },
      invoices: invoiceDtos,
      payments: paymentDtos,
    };
  }

  async getPaymentReceipt(hospitalId: number, paymentId: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, hospitalId },
      include: {
        invoice: {
          include: {
            patient: { select: { id: true, fullName: true, mrn: true } },
            encounter: { select: { id: true, type: true } },
          },
        },
      },
    });

    if (!payment) throw new NotFoundException('الدفعة غير موجودة.');
    const inv = payment.invoice;

    const totalAmount = Number(inv.totalAmount);
    const discountAmount = Number(inv.discountAmount);
    const paidAmount = Number(inv.paidAmount);
    const remainingAmount = totalAmount - discountAmount - paidAmount;

    return {
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.method,
        paidAt: payment.paidAt,
        reference: payment.reference ?? null,
      },
      invoice: {
        id: inv.id,
        status: inv.status,
        totalAmount,
        discountAmount,
        paidAmount,
        remainingAmount,
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

    const totalPaymentsAmount = paymentsAgg.reduce(
      (s, r) => s + Number(r._sum.amount ?? 0),
      0,
    );
    const totalPaymentsCount = paymentsAgg.reduce(
      (s, r) => s + (r._count._all ?? 0),
      0,
    );

    const paymentsByMethod = paymentsAgg.map((row) => ({
      method: row.method,
      totalAmount: Number(row._sum.amount ?? 0),
      count: row._count._all ?? 0,
    }));

    const invoicesAgg = await this.prisma.invoice.aggregate({
      where: { hospitalId, createdAt: { gte: start, lte: end } },
      _sum: { totalAmount: true, discountAmount: true, paidAmount: true },
      _count: { _all: true },
    });

    const tInv = Number(invoicesAgg._sum.totalAmount ?? 0);
    const tDisc = Number(invoicesAgg._sum.discountAmount ?? 0);
    const tPaid = Number(invoicesAgg._sum.paidAmount ?? 0);

    return {
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
      paymentsSummary: {
        totalAmount: totalPaymentsAmount,
        totalCount: totalPaymentsCount,
      },
      paymentsByMethod,
      invoicesSummary: {
        invoiceCount: invoicesAgg._count._all,
        totalInvoiced: tInv,
        totalDiscount: tDisc,
        totalPaid: tPaid,
        totalRemaining: tInv - tDisc - tPaid,
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

    let totalAmount = 0;
    let cashAmount = 0;
    const byMethod = new Map<
      PaymentMethod,
      { totalAmount: number; count: number }
    >();

    for (const p of payments) {
      const amt = Number(p.amount);
      totalAmount += amt;
      if (p.method === PaymentMethod.CASH) cashAmount += amt;

      const current = byMethod.get(p.method) ?? { totalAmount: 0, count: 0 };
      current.totalAmount += amt;
      current.count += 1;
      byMethod.set(p.method, current);
    }

    const paymentsByMethod = Array.from(byMethod.entries()).map(
      ([method, agg]) => ({ method, ...agg }),
    );

    const paymentRows = payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
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
        totalAmount,
        totalCount: payments.length,
        cashAmount,
      },
      paymentsByMethod,
      payments: paymentRows,
    };
  }

  async closeCashierShift(
    hospitalId: number,
    cashierId: number,
    params: { start: Date; end: Date; actualCash: number; note?: string },
  ) {
    const { start, end, actualCash, note } = params;

    let rangeStart = start;
    let rangeEnd = end;
    if (rangeEnd <= rangeStart) {
      rangeEnd = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    if (actualCash < 0)
      throw new BadRequestException('المبلغ لا يمكن أن يكون سالباً.');

    const overlapping = await this.prisma.cashierShiftClosing.findFirst({
      where: {
        hospitalId,
        cashierId,
        rangeStart: { lt: rangeEnd },
        rangeEnd: { gt: rangeStart },
      },
    });
    if (overlapping)
      throw new BadRequestException('يوجد شفت مغلق يتداخل مع هذه الفترة.');

    const payments = await this.prisma.payment.findMany({
      where: {
        hospitalId,
        cashierId,
        paidAt: { gte: rangeStart, lte: rangeEnd },
      },
    });

    const systemCashTotalDec = payments
      .filter((p) => p.method === PaymentMethod.CASH)
      .reduce((sum, p) => sum.plus(p.amount ?? 0), new Prisma.Decimal(0));

    const actualDec = new Prisma.Decimal(actualCash);
    const difference = actualDec.minus(systemCashTotalDec);
    const absDiff = difference.abs();

    const result = await this.prisma.$transaction(async (tx) => {
      const shift = await tx.cashierShiftClosing.create({
        data: {
          hospitalId,
          cashierId,
          rangeStart,
          rangeEnd,
          systemCashTotal: systemCashTotalDec,
          actualCashTotal: actualDec,
          difference,
          note: note ?? null,
        },
      });

      let accountingEntryId: number | null = null;
      if (!difference.isZero()) {
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

        if (cashMapping?.account && diffMapping?.account) {
          const lines: Prisma.AccountingEntryLineCreateWithoutEntryInput[] =
            difference.greaterThan(0)
              ? [
                  {
                    account: { connect: { id: cashMapping.account.id } },
                    debit: absDiff,
                    credit: 0,
                    description: `زيادة صندوق - شفت #${shift.id}`,
                  },
                  {
                    account: { connect: { id: diffMapping.account.id } },
                    debit: 0,
                    credit: absDiff,
                    description: `زيادة صندوق - شفت #${shift.id}`,
                  },
                ]
              : [
                  {
                    account: { connect: { id: diffMapping.account.id } },
                    debit: absDiff,
                    credit: 0,
                    description: `عجز صندوق - شفت #${shift.id}`,
                  },
                  {
                    account: { connect: { id: cashMapping.account.id } },
                    debit: 0,
                    credit: absDiff,
                    description: `عجز صندوق - شفت #${shift.id}`,
                  },
                ];

          const entry = await tx.accountingEntry.create({
            data: {
              hospitalId,
              entryDate: rangeEnd,
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
    });

    return {
      id: result.shift.id,
      rangeStart: result.shift.rangeStart,
      rangeEnd: result.shift.rangeEnd,
      systemCashTotal: Number(systemCashTotalDec.toFixed(3)),
      actualCashTotal: Number(actualDec.toFixed(3)),
      difference: Number(difference.toFixed(3)),
      note: result.shift.note,
      accountingEntryId: result.accountingEntryId,
    };
  }

  async listCashierShifts(
    hospitalId: number,
    params: { start: Date; end: Date; cashierId?: number },
  ) {
    const { start, end, cashierId } = params;
    const where: any = {
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
//         encounter: { select: { id: true, type: true } },
//       },
//       orderBy: { createdAt: 'asc' },
//     });

//     const result: any[] = [];
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
//             encounter: { select: { id: true, type: true } },
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
//         encounter: { select: { id: true, type: true } },
//       },
//       orderBy: { createdAt: 'asc' },
//     });

//     const result: any[] = [];
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
//             encounter: { select: { id: true, type: true } },
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
//         encounter: { select: { id: true, type: true } },
//       },
//       orderBy: { createdAt: 'asc' },
//     });

//     const result: any[] = [];
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
//             encounter: { select: { id: true, type: true } },
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
