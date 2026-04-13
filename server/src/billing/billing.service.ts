// src/billing/billing.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvoiceIssuedEvent } from './events/invoice-issued.event';
import {
  Prisma,
  InvoiceStatus,
  PaymentMethod,
  SystemAccountKey,
  ServiceType,
  AccountingSourceModule, // Added this as well
} from '@prisma/client';
import { FinancialYearsService } from '../financial-years/financial-years.service';
import {
  InsuranceCalculationService,
  CoverageResult,
} from '../insurance/insurance-calculation.service';
import { AccountingService } from '../accounting/accounting.service';
import { Money } from '../common/utils/money.util';

// ✅ تعريف نوع البيانات للمصفوفة لتجنب خطأ TS2345
type CalculationDetail = CoverageResult & { chargeId: number };

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private financialYears: FinancialYearsService,
    private insuranceCalc: InsuranceCalculationService,
    private accounting: AccountingService,
  ) {}

  async getEncounterBilling(encounterId: number, hospitalId: number) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId, isDeleted: false },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        charges: {
          include: {
            serviceItem: true,
            invoice: { select: { id: true, status: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        invoices: {
          include: { payments: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!encounter) throw new NotFoundException('الحالة غير موجودة أو محذوفة.');

    // ✅ استخدام Money Utility للحسابات الدقيقة
    const totalCharges = encounter.charges.reduce(
      (sum, c) => Money.add(sum, Money.fromPrisma(c.totalAmount)),
      0,
    );
    const totalInvoiced = encounter.invoices.reduce(
      (sum, inv) => Money.add(sum, Money.fromPrisma(inv.totalAmount)),
      0,
    );
    const totalPaid = encounter.invoices.reduce(
      (sum, inv) => Money.add(sum, Money.fromPrisma(inv.paidAmount)),
      0,
    );
    const outstanding = Money.sub(totalCharges, totalPaid);

    return {
      encounter: {
        id: encounter.id,
        status: encounter.status,
        type: encounter.type,
      },
      patient: encounter.patient,
      charges: encounter.charges,
      invoices: encounter.invoices,
      totals: { 
        totalCharges: Money.toDb(totalCharges), 
        totalInvoiced: Money.toDb(totalInvoiced), 
        totalPaid: Money.toDb(totalPaid), 
        outstanding: Money.toDb(outstanding) 
      },
    };
  }

  async createInvoiceForEncounter(
    encounterId: number,
    hospitalId: number,
    userId?: number,
  ) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId, isDeleted: false },
      include: {
        patient: {
          include: { insurancePolicy: true },
        },
      },
    });

    if (!encounter) throw new NotFoundException('الحالة غير موجودة.');

    const charges = await this.prisma.encounterCharge.findMany({
      where: { hospitalId, encounterId, invoiceId: null },
      include: { serviceItem: true },
    });

    if (charges.length === 0)
      throw new BadRequestException('لا توجد بنود للفوترة.');

    let totalAmount = 0;
    let totalPatientShare = 0;
    let totalInsuranceShare = 0;

    // ✅ استخدام النوع المعرف مسبقاً
    const calculationDetails: CalculationDetail[] = [];

    for (const charge of charges) {
      const itemAmount = Money.fromPrisma(charge.totalAmount);

      const result = await this.insuranceCalc.calculateCoverage(
        encounter.patientId,
        charge.serviceItemId,
        itemAmount,
      );

      if (result.requiresPreAuth && !result.preAuthCode) {
        this.logger.warn(
          `Service Item #${charge.serviceItemId} requires Pre-Auth but none found.`,
        );
      }

      totalAmount = Money.add(totalAmount, itemAmount);
      totalPatientShare = Money.add(totalPatientShare, result.patientShare);
      totalInsuranceShare = Money.add(totalInsuranceShare, result.insuranceShare);

      calculationDetails.push({
        chargeId: charge.id,
        ...result,
      });
    }

    // ✅ تقريب المبالغ للتخزين باستخدام Money Utility
    totalAmount = Money.toDb(totalAmount);
    totalPatientShare = Money.toDb(totalPatientShare);
    totalInsuranceShare = Money.toDb(Money.sub(totalAmount, totalPatientShare)); // الباقي للتأمين لضمان التطابق

    // تحديد الشركة فقط إذا كان المبلغ > 0
    const insuranceProviderId =
      totalInsuranceShare > 0
        ? encounter.patient.insurancePolicy?.insuranceProviderId
        : null;

    const issueDate = new Date();

    const { financialYear, period } =
      await this.accounting.validateDateInOpenPeriod(hospitalId, issueDate);

    // const { fy, period } = await this.financialYears.getOpenPeriodForDate(
    //   hospitalId,
    //   new Date(),
    // );

    const invoice = await this.prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.invoice.create({
        data: {
          hospitalId,
          patientId: encounter.patientId,
          encounterId: encounter.id,
          status: InvoiceStatus.ISSUED,
          totalAmount,
          discountAmount: 0,
          paidAmount: 0,
          currency: 'LYD',
          patientShare: totalPatientShare,
          insuranceShare: totalInsuranceShare,
          insuranceProviderId,
          financialYearId: financialYear.id,
          financialPeriodId: period.id,
        },
      });

      await tx.encounterCharge.updateMany({
        where: { id: { in: charges.map((c) => c.id) } },
        data: { invoiceId: createdInvoice.id },
      });

      return createdInvoice;
    });

    this.eventEmitter.emit(
      'invoice.issued',
      new InvoiceIssuedEvent(
        invoice.id,
        hospitalId,
        userId || 0,
        Number(invoice.totalAmount),
        new Date(),
        Number(invoice.patientShare),
        Number(invoice.insuranceShare),
        invoice.insuranceProviderId ?? undefined,
      ),
    );

    return this.prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        charges: true,
        payments: true,
        insuranceProvider: true,
      },
    });
  }

  // ... (باقي الدوال getInvoicePrintData, listInvoices, getPaymentReceiptData كما هي) ...
  async getInvoicePrintData(params: { invoiceId: number; hospitalId: number }) {
    const { invoiceId, hospitalId } = params;
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        encounter: { include: { patient: true } },
        payments: true,
        financialYear: true,
        financialPeriod: true,
        returns: true, // ✅ [NEW] Include Returns (relation name is returns)
      },
    });
    if (!invoice || invoice.hospitalId !== hospitalId) {
      throw new NotFoundException(
        'لم يتم العثور على هذه الفاتورة للمنشأة الحالية.',
      );
    }
    const inv: any = invoice; // Quick fix for relation types if inference fails
    if (!inv.encounterId || !inv.encounter) {
      throw new BadRequestException('الفاتورة غير مرتبطة بحالة طبية.');
    }
    const charges = await this.prisma.encounterCharge.findMany({
      where: {
        hospitalId,
        encounterId: inv.encounterId,
        invoiceId: inv.id,
      },
      include: { serviceItem: true },
      orderBy: { id: 'asc' },
    });
    return {
      invoice: {
        id: inv.id,
        status: inv.status,
        type: inv.type,
        originalInvoiceId: inv.originalInvoiceId,
        totalAmount: inv.totalAmount,
        discountAmount: inv.discountAmount,
        paidAmount: inv.paidAmount,
        currency: inv.currency,
        createdAt: inv.createdAt,
        patientShare: inv.patientShare,
        insuranceShare: inv.insuranceShare,
        financialYear: inv.financialYear
          ? {
              id: inv.financialYear.id,
              code: inv.financialYear.code,
              name: inv.financialYear.name,
            }
          : null,
        financialPeriod: inv.financialPeriod
          ? {
              id: inv.financialPeriod.id,
              periodCode: inv.financialPeriod.periodCode,
              periodIndex: inv.financialPeriod.periodIndex,
              monthStartDate: inv.financialPeriod.monthStartDate,
              monthEndDate: inv.financialPeriod.monthEndDate,
            }
          : null,
      },
      encounter: {
        id: inv.encounter.id,
        type: inv.encounter.type,
        status: inv.encounter.status,
      },
      patient: inv.encounter.patient,
      charges,
      payments: inv.payments,
      creditNotes: inv.returns, // Map relation 'returns' to DTO 'creditNotes'
    };
  }

  // async listInvoices(params: any) {
  //   const { hospitalId, financialYearId, financialPeriodId, status } = params;
  //   return this.prisma.invoice.findMany({
  //     where: {
  //       hospitalId,
  //       ...(financialYearId ? { financialYearId } : {}),
  //       ...(financialPeriodId ? { financialPeriodId } : {}),
  //       ...(status ? { status } : {}),
  //     },
  //     include: {
  //       patient: { select: { id: true, fullName: true, mrn: true } },
  //       encounter: { select: { id: true, type: true } },
  //     },
  //     orderBy: { createdAt: 'desc' },
  //   });
  // }

  async listInvoices(params: {
    hospitalId: number;
    financialYearId?: number;
    financialPeriodId?: number;
    status?: InvoiceStatus;
    page?: number;
    limit?: number;
    search?: string; // بحث برقم الفاتورة أو اسم المريض
  }) {
    const {
      hospitalId,
      financialYearId,
      financialPeriodId,
      status,
      page = 1,
      limit = 15,
      search,
    } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      hospitalId,
      financialYearId: financialYearId ? Number(financialYearId) : undefined,
      financialPeriodId: financialPeriodId
        ? Number(financialPeriodId)
        : undefined,
      status: status || undefined,
      ...(search
        ? {
            OR: [
              {
                patient: {
                  fullName: { contains: search, mode: 'insensitive' },
                },
              },
              { patient: { mrn: { contains: search, mode: 'insensitive' } } },
              { id: isNaN(Number(search)) ? undefined : Number(search) },
            ],
          }
        : {}),
    };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { id: true, fullName: true, mrn: true } },
          encounter: { select: { id: true, type: true } },
          returns: { select: { id: true } }, // ✅ [NEW] Check for returns
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  async getPaymentReceiptData(params: any) {
    const { hospitalId, paymentId } = params;
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, hospitalId },
      include: {
        invoice: { include: { encounter: { include: { patient: true } } } },
      },
    });
    if (!payment || !payment.invoice)
      throw new NotFoundException('لم يتم العثور على هذه الدفعة.');
    if (payment.invoice.hospitalId !== hospitalId)
      throw new NotFoundException('الدفعة لا تتبع هذه المنشأة.');
    const invoice = payment.invoice;
    const encounter = invoice.encounter;
    return {
      payment: {
        id: payment.id,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        paidAt: payment.paidAt,
      },
      invoice: {
        id: invoice.id,
        status: invoice.status,
        totalAmount: invoice.totalAmount,
        discountAmount: invoice.discountAmount,
        paidAmount: invoice.paidAmount,
        currency: invoice.currency,
        createdAt: invoice.createdAt,
        financialYearId: (invoice as any).financialYearId ?? null,
        financialPeriodId: (invoice as any).financialPeriodId ?? null,
      },
      encounter: {
        id: encounter.id,
        type: encounter.type,
        status: encounter.status,
      },
      patient: encounter.patient,
    };
  }

  /**
   * 🛡️ التحقق من قفل الفاتورة
   * الفاتورة تُقفل إذا كانت صادرة (ISSUED) أو مدفوعة (PAID) أو ملغاة (CANCELLED)
   */
  private validateInvoiceIsEditable(invoice: any) {
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `لا يمكن تعديل الفاتورة رقم ${invoice.id} لأنها في حالة (${invoice.status}). يجب إلغاؤها وإصدار فاتورة جديدة.`,
      );
    }
  }

  /**
   * ❌ إلغاء فاتورة مرحلة (Issued/Partially Paid)
   * هذا الإجراء لا يحذف الفاتورة من القاعدة، بل يغير حالتها
   * ويفك ارتباطها بالبنود (Charges) ليعيدها للحالة "غير مفوتر"
   */
  async cancelInvoice(hospitalId: number, invoiceId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { payments: true },
      });

      if (!invoice || invoice.hospitalId !== hospitalId) {
        throw new NotFoundException('الفاتورة غير موجودة.');
      }

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('الفاتورة ملغاة بالفعل.');
      }

      // 🛡️ حماية إضافية: لا يمكن إلغاء فاتورة بها مدفوعات فعلية (يجب استرداد المبالغ أولاً Refund)
      const totalPaid = invoice.payments.reduce(
        (sum, p) => Money.add(sum, Money.fromPrisma(p.amount)),
        0,
      );
      if (Money.gt(totalPaid, 0)) {
        throw new BadRequestException(
          'لا يمكن إلغاء فاتورة تحتوي على مدفوعات مسجلة. يرجى معالجة المبالغ المستلمة أولاً.',
        );
      }

      // 1. فك ارتباط البنود (Charges) لتصبح قابلة للفوترة من جديد
      await tx.encounterCharge.updateMany({
        where: { invoiceId: invoice.id },
        data: { invoiceId: null },
      });

      // 2. تحديث حالة الفاتورة إلى ملغاة
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CANCELLED },
      });

      // 3. 📉 إلغاء القيد المحاسبي المرتبط بالفاتورة (نستخدم الخدمة التي طورناها سابقاً)
      // سنجلب القيد المرتبط بهذه الفاتورة ونحذفه (أو نعكسه)
      const entry = await tx.accountingEntry.findFirst({
        where: {
          sourceModule: AccountingSourceModule.BILLING,
          sourceId: invoice.id,
        },
      });

      if (entry) {
        // ✅ [REFRACTOR] استخدام القيد العكسي بدلاً من الحذف النهائي
        await this.accounting.reverseEntry(
          hospitalId,
          entry.id,
          userId,
          `إلغاء الفاتورة #${invoiceId}`,
          tx, // نمرر الترانزكشن الحالية
        );
      }

      this.logger.log(`Invoice #${invoiceId} cancelled by user ${userId}`);
      if (invoice.encounterId) {
        this.eventEmitter.emit('invoice.cancelled', {
          invoiceId: invoice.id,
          hospitalId,
          encounterId: invoice.encounterId,
          userId,
        });
      }
      return updatedInvoice;
    });
  }

  async createCreditNote(
    hospitalId: number,
    originalInvoiceId: number,
    userId: number,
    reason: string,
    // TODO: Add support for partial items here later
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. جلب الفاتورة الأصلية
      const original = await tx.invoice.findUnique({
        where: { id: originalInvoiceId },
        include: { 
          charges: {
            include: { serviceItem: true } 
          } 
        },
      });

      if (!original || original.hospitalId !== hospitalId) {
        throw new NotFoundException('الفاتورة الأصلية غير موجودة.');
      }

      if (
        original.status !== InvoiceStatus.ISSUED &&
        original.status !== InvoiceStatus.PAID
      ) {
        throw new BadRequestException(
          'يمكن إنشاء مرتجع للفواتير الصادرة أو المدفوعة فقط.',
        );
      }

      // 2. التحقق من عدم وجود مرتجع سابق لنفس الفاتورة
      const existingCN = await tx.invoice.findFirst({
        where: {
          originalInvoiceId: original.id,
          type: 'CREDIT_NOTE',
          status: { not: 'CANCELLED' },
        },
        // We might want to allow multiple CNs if partial, but for now blocking if any exists
        // to simplify the "Full Return" logic.
      });
      if (existingCN) {
        throw new BadRequestException('يوجد مرتجع بالفعل لهذه الفاتورة.');
      }

      // 3. إنشاء فاتورة المرتجع
      const totalAmount = Money.toDb(original.totalAmount);
      const patientShare = Money.toDb(original.patientShare);
      const insuranceShare = Money.toDb(original.insuranceShare);

      const creditNote = await tx.invoice.create({
        data: {
          hospitalId,
          type: 'CREDIT_NOTE',
          originalInvoiceId: original.id,
          patientId: original.patientId,
          encounterId: original.encounterId,
          status: InvoiceStatus.PAID,
          
          totalAmount: totalAmount,
          discountAmount: Money.toDb(original.discountAmount),
          patientShare: patientShare,
          insuranceShare: insuranceShare,
          paidAmount: totalAmount,

          currency: original.currency,
          financialYearId: original.financialYearId,
          financialPeriodId: original.financialPeriodId,
          notes: reason,
        },
      });

      // 4. حساب Revenue Split
      const revenueSplit: Record<string, number> = {};
      
      for (const charge of original.charges) {
        let accountKey: SystemAccountKey = SystemAccountKey.REVENUE_OUTPATIENT;
        
        // Fix: Access type through serviceItem
        const type = charge.serviceItem.type; 
        
        switch (type) {
          case ServiceType.LAB:
            accountKey = SystemAccountKey.REVENUE_LAB;
            break;
          case ServiceType.RADIOLOGY:
            accountKey = SystemAccountKey.REVENUE_RADIOLOGY;
            break;
          case ServiceType.PHARMACY:
            accountKey = SystemAccountKey.REVENUE_PHARMACY;
            break;
          case ServiceType.BED:
            accountKey = SystemAccountKey.REVENUE_INPATIENT;
            break;
          default:
            accountKey = SystemAccountKey.REVENUE_OUTPATIENT;
        }

        // Fix: Use totalAmount as net/amount might be missing on type
        const chargeAmount = Number(charge.totalAmount); 
        if (revenueSplit[accountKey]) {
          revenueSplit[accountKey] += chargeAmount;
        } else {
          revenueSplit[accountKey] = chargeAmount;
        }
      }

      // 5. عكس القيود المحاسبية
      await this.accounting.recordCreditNoteEntry({
        creditNoteId: creditNote.id,
        originalInvoiceId: original.id,
        hospitalId,
        userId,
        revenueSplit: revenueSplit as any,
        prisma: tx, // ✅ Pass Transaction Client (tx)
      });

      // 6. إذا كانت هناك أدوية، يجب إرجاعها للمخزون
      this.eventEmitter.emit('billing.credit_note_created', {
        creditNoteId: creditNote.id,
        originalInvoiceId: original.id,
        encounterId: original.encounterId,
        hospitalId,
      });

      return creditNote;
    });
  }
}
