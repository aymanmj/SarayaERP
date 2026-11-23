import {
  captureInvoiceSnapshot,
  readInvoiceSnapshot,
  adjustmentBalance,
  netPaidAmount,
  totalInvoiceAdjustment,
} from './invoice-snapshot';
import {
  lockFinancialInvoice,
  invoicePostingKey,
} from '../accounting/financial-posting';
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
import { Prisma, InvoiceStatus, PaymentMethod } from '@prisma/client';
import { FinancialYearsService } from '../financial-years/financial-years.service';
import {
  InsuranceCalculationService,
  CoverageResult,
} from '../insurance/insurance-calculation.service';
import { AccountingService } from '../accounting/accounting.service';
import { Money } from '../common/utils/money.util';
import { tafqeetArabic } from '../common/utils/tafqeet.util';
import { pendingRoomCharges } from '../admission/room-charge';
import type { MoneyValue } from '../common/utils/money.util';
import { PriceListsService } from '../price-lists/price-lists.service';
import { PatientDepositService } from './patient-deposit.service';
import { CreateInterimInvoiceDto } from './dto/patient-deposit.dto';

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
    private priceLists: PriceListsService,
    private patientDeposit: PatientDepositService,
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
          include: {
            refunds: {
              where: { status: 'EXECUTED' },
              select: { amount: true },
            },
            payments: true,
            adjustments: {
              where: { status: 'POSTED' },
              select: { delta: true, insuranceDelta: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!encounter) throw new NotFoundException('الحالة غير موجودة أو محذوفة.');

    const activeInvoices = encounter.invoices.filter(
      (inv) => inv.status !== InvoiceStatus.CANCELLED,
    );

    // ✅ استخدام Money Utility للحسابات الدقيقة مع مراعاة إشعارات الدائن والفواتير الملغاة
    const originalTotalCharges = encounter.charges.reduce(
      (sum, c) => Money.add(sum, Money.fromPrisma(c.totalAmount)),
      0,
    );
    const adjustmentTotal = totalInvoiceAdjustment(
      activeInvoices.flatMap((inv) => inv.adjustments ?? []),
    );
    const cancelledPrescriptionCharges = Money.sumDecimal(
      ...encounter.charges
        .filter(
          (charge) =>
            charge.sourceType === 'PHARMACY_PRESCRIPTION' &&
            charge.invoice?.status === 'CANCELLED',
        )
        .map((charge) => charge.totalAmount),
    );
    const totalCharges = Money.toDb(
      Money.sumDecimal(originalTotalCharges, adjustmentTotal).minus(
        cancelledPrescriptionCharges,
      ),
    );
    const totalInvoiced = activeInvoices.reduce((sum, inv) => {
      const amount = Money.fromPrisma(inv.totalAmount);
      return inv.type === 'CREDIT_NOTE'
        ? Money.sub(sum, amount)
        : Money.add(sum, amount);
    }, Money.toDb(adjustmentTotal));
    const totalPaid = activeInvoices.reduce((sum, inv) => {
      if (inv.type === 'CREDIT_NOTE') return sum;
      return Money.add(sum, Money.toDb(netPaidAmount(inv)));
    }, 0);
    const totalRefunded = Money.sumDecimal(
      ...encounter.invoices.flatMap((inv) =>
        (inv.refunds ?? []).map((item) => item.amount),
      ),
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
        originalTotalCharges: Money.toDb(originalTotalCharges),
        adjustmentAmount: Money.toDb(adjustmentTotal),
        totalCharges: Money.toDb(totalCharges),
        totalInvoiced: Money.toDb(totalInvoiced),
        totalPaid: Money.toDb(totalPaid),
        totalRefunded: Money.toDb(totalRefunded),
        outstanding: Money.toDb(outstanding),
      },
    };
  }

  async createInvoiceForEncounter(
    encounterId: number,
    hospitalId: number,
    userId?: number,
    options: CreateInterimInvoiceDto = {},
  ) {
    const invoice = await this.prisma.$transaction(
      async (tx) => {
        const encounter = await tx.encounter.findFirst({
          where: { id: encounterId, hospitalId, isDeleted: false },
          include: {
            patient: {
              include: { insurancePolicy: true },
            },
          },
        });

        if (!encounter) throw new NotFoundException('الحالة غير موجودة.');
        await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${encounter.patientId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Encounter" WHERE "id" = ${encounterId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        const cutoff = options.cutoffDate
          ? new Date(options.cutoffDate)
          : new Date();
        if (!Number.isFinite(cutoff.getTime()) || cutoff.getTime() > Date.now())
          throw new BadRequestException('تاريخ القطع غير صالح أو في المستقبل');
        const room = await pendingRoomCharges(
          tx,
          hospitalId,
          encounterId,
          cutoff,
        );
        if (room.reviewReason) throw new BadRequestException(room.reviewReason);
        for (const charge of room.charges)
          await tx.encounterCharge.create({ data: charge });

        const charges = await tx.encounterCharge.findMany({
          where: {
            hospitalId,
            encounterId,
            createdAt: { lte: cutoff },
            ...(options.chargeIds?.length
              ? { id: { in: options.chargeIds } }
              : {}),
            sourceType: { not: 'PHARMACY_PRESCRIPTION' },
            OR: [{ invoiceId: null }, { invoice: { status: 'CANCELLED' } }],
          },
          include: { serviceItem: true },
        });

        if (charges.length === 0)
          throw new BadRequestException('لا توجد بنود للفوترة.');

        // ✅ تحديث أسعار البنود غير المفوترة طبقاً لأحدث تسعيرة في النظام قبل إنشاء الفاتورة
        for (const charge of charges) {
          if (charge.roomBillingKey || charge.sourceType !== 'MANUAL') continue;
          const currentPrice = await this.priceLists.getServicePrice(
            hospitalId,
            charge.serviceItemId,
            encounter.patient.insurancePolicy?.id ?? 0,
          );

          const quantity = charge.quantity.toString();
          const newTotalAmount = Money.lineTotal(currentPrice, quantity);

          if (!Money.eq(Money.fromPrisma(charge.unitPrice), currentPrice)) {
            await tx.encounterCharge.update({
              where: { id: charge.id },
              data: {
                unitPrice: Money.toDb(currentPrice),
                totalAmount: newTotalAmount,
              },
            });
            charge.unitPrice = new Prisma.Decimal(Money.toDb(currentPrice));
            charge.totalAmount = new Prisma.Decimal(newTotalAmount);
          }
        }

        // Filter charges to only include priced ones (unitPrice > 0)
        const pricedCharges = charges.filter((c) =>
          Money.decimal(c.unitPrice).gt(0),
        );

        if (pricedCharges.length === 0) {
          throw new BadRequestException(
            'كل البنود غير مسعرة. يرجى تسعير البنود أولاً أو إلغائها.',
          );
        }

        let totalAmount = 0;
        let totalPatientShare = 0;
        let totalInsuranceShare = 0;

        // ✅ استخدام النوع المعرف مسبقاً
        const calculationDetails: CalculationDetail[] = [];

        for (const charge of pricedCharges) {
          const itemAmount = Money.fromPrisma(charge.totalAmount);

          const result = await this.insuranceCalc.calculateCoverage(
            encounter.patientId,
            charge.serviceItemId,
            itemAmount,
            charge.roomBillingKey && charge.roomAllocation
              ? {
                  preserveServicePrice: true,
                  benefitUnits: (() => {
                    const part = charge.roomAllocation as {
                      occupiedMilliseconds: number;
                      periodMilliseconds: number;
                    };
                    return Money.decimal(part.occupiedMilliseconds)
                      .dividedBy(part.periodMilliseconds)
                      .toString();
                  })(),
                }
              : charge.sourceType !== 'MANUAL'
                ? { preserveServicePrice: true }
                : undefined,
          );

          if (result.requiresPreAuth && !result.preAuthCode) {
            this.logger.warn(
              `Service Item #${charge.serviceItemId} requires Pre-Auth but none found.`,
            );
          }

          const finalItemAmount =
            result.contractedPrice !== undefined
              ? result.contractedPrice
              : itemAmount;

          totalAmount = Money.add(totalAmount, finalItemAmount);
          totalPatientShare = Money.add(totalPatientShare, result.patientShare);
          totalInsuranceShare = Money.add(
            totalInsuranceShare,
            result.insuranceShare,
          );

          calculationDetails.push({
            chargeId: charge.id,
            ...result,
          });
        }

        // ✅ تقريب المبالغ للتخزين باستخدام Money Utility
        totalAmount = Money.toDb(totalAmount);
        totalPatientShare = Money.toDb(totalPatientShare);
        totalInsuranceShare = Money.toDb(
          Money.sub(totalAmount, totalPatientShare),
        ); // الباقي للتأمين لضمان التطابق

        // تحديد الشركة فقط إذا كان المبلغ > 0
        const insuranceProviderId =
          totalInsuranceShare > 0
            ? encounter.patient.insurancePolicy?.insuranceProviderId
            : null;

        const issueDate = new Date();

        const { financialYear, period } =
          await this.accounting.validateDateInOpenPeriod(hospitalId, issueDate);

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

        for (const req of calculationDetails) {
          const chargeUpdateData: any = { invoiceId: createdInvoice.id };
          if (req.contractedPrice !== undefined) {
            chargeUpdateData.totalAmount = req.contractedPrice;
          }
          const linked = await tx.encounterCharge.updateMany({
            where: {
              id: req.chargeId,
              hospitalId,
              encounterId,
              sourceType: { not: 'PHARMACY_PRESCRIPTION' },
              OR: [{ invoiceId: null }, { invoice: { status: 'CANCELLED' } }],
            },
            data: chargeUpdateData,
          });
          if (linked.count !== 1)
            throw new BadRequestException(
              'تغيرت بنود الفاتورة أثناء الإصدار. أعد تحميل الحالة',
            );
        }

        await this.accounting.recordInvoiceEntry({
          invoiceId: createdInvoice.id,
          hospitalId,
          userId,
          prisma: tx,
        });
        await captureInvoiceSnapshot(tx, hospitalId, createdInvoice.id);
        if (options.autoApplyDeposit) {
          const wallet =
            await this.patientDeposit.getPatientDepositBalanceInternal(
              tx,
              hospitalId,
              encounter.patientId,
            );
          if (wallet.availableBalance.gt(0))
            await this.patientDeposit.applyDepositToInvoice(
              hospitalId,
              userId ?? 0,
              { invoiceId: createdInvoice.id, requestId: '' },
              tx,
              `interim:${createdInvoice.id}`,
            );
        }
        return createdInvoice;
      },
      { maxWait: 10000, timeout: 20000 },
    );

    this.eventEmitter.emit(
      'invoice.issued',
      new InvoiceIssuedEvent(
        invoice.id,
        hospitalId,
        userId || 0,
        Money.toDb(invoice.totalAmount),
        new Date(),
        Money.toDb(invoice.patientShare),
        Money.toDb(invoice.insuranceShare),
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

  /**
   * إصدار فاتورة مرحلية (Interim Staged Invoice) للحالات السريرية
   * تفوتر البنود المتراكمة حتى تاريخ محدد وتتيح تسوية وتطبيق الأمانات المتاحة تلقائياً
   */
  createInterimInvoice(
    encounterId: number,
    hospitalId: number,
    dto: CreateInterimInvoiceDto,
    userId?: number,
  ) {
    return this.createInvoiceForEncounter(encounterId, hospitalId, userId, dto);
  }

  async getInvoicePrintData(params: { invoiceId: number; hospitalId: number }) {
    const { invoiceId, hospitalId } = params;
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        encounter: { include: { patient: true } },
        payments: true,
        financialYear: true,
        financialPeriod: true,
        returns: true,
      },
    });
    if (!invoice || invoice.hospitalId !== hospitalId) {
      throw new NotFoundException(
        'لم يتم العثور على هذه الفاتورة للمنشأة الحالية.',
      );
    }
    const inv = invoice;
    if (!inv.encounterId || !inv.encounter) {
      throw new BadRequestException('الفاتورة غير مرتبطة بحالة طبية.');
    }
    const liveCharges = await this.prisma.encounterCharge.findMany({
      where: {
        hospitalId,
        encounterId: inv.encounterId,
        invoiceId: inv.id,
      },
      include: { serviceItem: true },
      orderBy: { id: 'asc' },
    });
    const charges: {
      id: number;
      quantity: number;
      unitPrice: MoneyValue;
      totalAmount: MoneyValue;
      serviceItem: { name: string; code: string | null };
    }[] = readInvoiceSnapshot(inv.lineSnapshot)?.lines ?? liveCharges;
    const adjusted = await adjustmentBalance(
      this.prisma,
      hospitalId,
      invoiceId,
      inv.patientShare,
      inv.paidAmount,
    );
    return {
      invoice: {
        refundedAmount: Money.toDbString(adjusted.refunded),
        netPaidAmount: Money.toDbString(adjusted.netPaid),
        effectivePatientShare: Money.toDbString(adjusted.liability),
        effectiveInsuranceShare: Money.toDbString(
          Money.sumDecimal(inv.insuranceShare, adjusted.insuranceDelta),
        ),
        adjustmentAmount: Money.toDbString(adjusted.totalDelta),
        amountDue: Money.toDbString(
          adjusted.balance.gt(0) ? adjusted.balance : 0,
        ),
        patientCredit: Money.toDbString(
          adjusted.balance.lt(0) ? adjusted.balance.negated() : 0,
        ),
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
        amountInWords: tafqeetArabic(Money.fromPrisma(inv.totalAmount), {
          currency: inv.currency || 'LYD',
        }),
        patientShareInWords: tafqeetArabic(Money.fromPrisma(inv.patientShare), {
          currency: inv.currency || 'LYD',
        }),
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
      creditNotes: inv.returns,
    };
  }

  async listInvoices(params: {
    hospitalId: number;
    financialYearId?: number;
    financialPeriodId?: number;
    status?: InvoiceStatus;
    page?: number;
    limit?: number;
    search?: string;
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
          returns: { select: { id: true } },
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

  async getPaymentReceiptData(params: {
    hospitalId: number;
    paymentId: number;
  }) {
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
        amountInWords: tafqeetArabic(Money.fromPrisma(payment.amount), {
          currency: invoice.currency || 'LYD',
        }),
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
        financialYearId: invoice.financialYearId ?? null,
        financialPeriodId: invoice.financialPeriodId ?? null,
      },
      encounter: {
        id: encounter.id,
        type: encounter.type,
        status: encounter.status,
      },
      patient: encounter.patient,
    };
  }

  private validateInvoiceIsEditable(invoice: {
    id: number;
    status: InvoiceStatus;
  }) {
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `لا يمكن تعديل الفاتورة رقم ${invoice.id} لأنها في حالة (${invoice.status}). يجب إلغاؤها وإصدار فاتورة جديدة.`,
      );
    }
  }

  async cancelInvoice(hospitalId: number, invoiceId: number, userId: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      await lockFinancialInvoice(tx, hospitalId, invoiceId);
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, hospitalId },
        include: {
          payments: true,
          returns: { where: { status: { not: 'CANCELLED' } } },
        },
      });

      if (!invoice || invoice.hospitalId !== hospitalId) {
        throw new NotFoundException('الفاتورة غير موجودة.');
      }

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('الفاتورة ملغاة بالفعل.');
      }

      const totalPaid = invoice.payments.reduce(
        (sum, p) => Money.add(sum, Money.fromPrisma(p.amount)),
        0,
      );
      if (
        await tx.invoiceAdjustment.count({
          where: {
            hospitalId,
            invoiceId,
            status: { in: ['PENDING', 'POSTED'] },
          },
        })
      )
        throw new BadRequestException(
          'الفاتورة مرتبطة بطلب تسوية؛ لا يمكن إلغاؤها عبر المسار القديم',
        );
      if (invoice.type !== 'INVOICE' || invoice.returns.length)
        throw new BadRequestException(
          'لا يمكن إلغاء إشعار دائن أو فاتورة مرتبطة بتسوية عبر هذا المسار',
        );
      if (Money.gt(totalPaid, 0) || Money.isPositive(invoice.paidAmount)) {
        throw new BadRequestException(
          'لا يمكن إلغاء فاتورة تحتوي على مدفوعات مسجلة. يرجى معالجة المبالغ المستلمة أولاً.',
        );
      }
      if (
        invoice.coveragePolicyId != null &&
        (['SUBMITTED', 'PAID'].includes(invoice.claimStatus ?? '') ||
          (await tx.claim.count({
            where: { hospitalId, invoiceId, status: { not: 'VOID' } },
          })))
      )
        throw new BadRequestException(
          'يلزم تسوية المطالبة التأمينية قبل إلغاء الفاتورة',
        );

      const prepaidPrescription = await tx.prescription.findUnique({
        where: { prepaidInvoiceId: invoice.id },
        select: {
          id: true,
          hospitalId: true,
          status: true,
          dispenses: { select: { id: true }, take: 1 },
        },
      });
      if (prepaidPrescription) {
        if (
          prepaidPrescription.hospitalId !== hospitalId ||
          prepaidPrescription.status === 'COMPLETED' ||
          prepaidPrescription.dispenses.length > 0
        )
          throw new BadRequestException(
            'يلزم إجراء تصحيح مستقل للفاتورة المرتبطة بصرف منفذ',
          );
        await tx.prescription.update({
          where: { id: prepaidPrescription.id, hospitalId },
          data: { status: 'CANCELLED' },
        });
      }
      await tx.encounterCharge.updateMany({
        where: {
          invoiceId: invoice.id,
          sourceType: { not: 'PHARMACY_PRESCRIPTION' },
        },
        data: { invoiceId: null },
      });

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CANCELLED },
      });

      const entry = await tx.accountingEntry.findFirst({
        where: {
          hospitalId,
          postingKey: invoicePostingKey(hospitalId, invoice.id),
        },
      });

      const legacy = await tx.accountingEntry.count({
        where: {
          hospitalId,
          sourceModule: 'BILLING',
          sourceId: invoice.id,
          postingKey: null,
        },
      });
      if (legacy)
        throw new BadRequestException(
          'يوجد قيد قديم يحتاج مطابقة قبل إلغاء الفاتورة',
        );
      if (entry) {
        await this.accounting.reverseEntry(
          hospitalId,
          entry.id,
          userId,
          `إلغاء الفاتورة #${invoiceId}`,
          tx,
        );
      }

      this.logger.log(`Invoice #${invoiceId} cancelled by user ${userId}`);
      return {
        invoice: updatedInvoice,
        affectsEncounter: !prepaidPrescription,
      };
    });
    this.eventEmitter.emit('invoice.cancelled', {
      invoiceId: result.invoice.id,
      encounterId: result.invoice.encounterId,
      hospitalId,
      userId,
      ...(result.affectsEncounter ? {} : { affectsEncounter: false }),
    });
    return result.invoice;
  }

  createCreditNote(
    hospitalId: number,
    originalInvoiceId: number,
    userId: number,
    reason: string,
  ): Promise<never> {
    void hospitalId;
    void originalInvoiceId;
    void userId;
    void reason;
    return Promise.reject(
      new BadRequestException(
        'مسار المرتجع القديم موقوف لأنه كان يسجل المبلغ كمردود دون تحصيل عكسي مثبت. يلزم استخدام تسوية معتمدة وإشعار دائن مرتبط دون افتراض رد نقدي',
      ),
    );
  }

  async deleteCharge(hospitalId: number, chargeId: number) {
    const charge = await this.prisma.encounterCharge.findUnique({
      where: { id: chargeId },
    });

    if (!charge) {
      throw new NotFoundException('البند غير موجود.');
    }

    if (charge.hospitalId !== hospitalId) {
      throw new BadRequestException('غير مصرح لك.');
    }

    if (charge.invoiceId) {
      throw new BadRequestException('لا يمكن حذف بند تمت فوترته بالفعل.');
    }

    await this.prisma.encounterCharge.delete({
      where: { id: chargeId },
    });

    return { success: true };
  }
}
