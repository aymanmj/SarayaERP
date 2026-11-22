import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus, CopayType, CoverageRuleType } from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { dispensedPrescriptionClaim } from '../pharmacy/prescription-prepayment';
import { PharmacyService } from '../pharmacy/pharmacy.service';
import { readCoverageBalance } from './coverage-balance';
import {
  settlementAllocationBalance,
  settlementNet,
} from './insurance-settlement-balance';
import {
  listInsuranceSettlements,
  postInsuranceSettlement,
  type InsuranceSettlementInput,
} from './insurance-settlement';
import {
  applyInsuranceSettlementCredit,
  type ApplySettlementCreditInput,
} from './insurance-settlement-application';
import {
  listSettlementRefunds,
  requestSettlementRefund,
  reviewSettlementRefund,
  type SettlementRefundInput,
  type SettlementRefundReview,
} from './insurance-settlement-refund';
import {
  recordClaimWithdrawal,
  type ClaimWithdrawalInput,
} from './claim-withdrawal';
import {
  listClaimReceiptRefunds,
  requestClaimReceiptRefund,
  reviewClaimReceiptRefund,
  type RefundRequest,
  type RefundReview,
} from '../rcm/claim-receipt-refund';

@Injectable()
export class InsuranceService {
  private readonly logger = new Logger(InsuranceService.name);

  constructor(
    private prisma: PrismaService,
    private pharmacy: PharmacyService,
  ) {}

  private normalizeCopayFraction(value: unknown, fieldName: string): string {
    const raw = Money.decimal(value ?? 0);
    if (raw.lt(0) || raw.gt(100)) {
      throw new BadRequestException(
        `${fieldName} يجب أن تكون بين 0 و 100% (أو 0 إلى 1 كمعامل عشري)`,
      );
    }
    const fraction = raw.gt(1) ? raw.div(100) : raw;
    return fraction.toFixed(4);
  }

  // 1. القائمة الكاملة لشركات التأمين
  async findAllProviders(hospitalId: number) {
    return this.prisma.insuranceProvider.findMany({
      where: {
        hospitalId,
      },
      include: {
        _count: {
          select: { policies: true, plans: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // 1.5 جلب تفاصيل شركة معينة
  async getProviderDetails(hospitalId: number, id: number) {
    const provider = await this.prisma.insuranceProvider.findFirst({
      where: { hospitalId, id },
      include: {
        plans: {
          include: { _count: { select: { rules: true } } },
        },
        policies: {
          include: { plan: true },
          orderBy: { isActive: 'desc' },
        },
      },
    });

    if (!provider) throw new NotFoundException('الشركة غير موجودة');
    return provider;
  }

  // 2. إنشاء شركة تأمين جديدة
  async createProvider(
    hospitalId: number,
    data: {
      name: string;
      code: string;
      phone?: string;
      email?: string;
      address?: string;
    },
  ) {
    if (!data?.name?.trim()) {
      throw new BadRequestException('اسم شركة التأمين مطلوب');
    }
    if (!data?.code?.trim()) {
      throw new BadRequestException('كود شركة التأمين مطلوب');
    }
    return this.prisma.insuranceProvider.create({
      data: {
        hospitalId,
        name: data.name.trim(),
        code: data.code.trim(),
        phone: data.phone,
        email: data.email,
        address: data.address,
        isActive: true,
      },
    });
  }

  // 3. إنشاء بوليصة تأمين
  async createPolicy(
    hospitalId: number,
    providerId: number,
    data: {
      name: string;
      policyNumber: string;
      planId?: number | string;
      priceListId?: number | string;
      startDate?: string;
      endDate?: string;
      patientCopayRate?: number | string;
      maxCoverageAmount?: number | string | null;
      releaseCoverageOnPartialDispense?: boolean;
    },
  ) {
    const provider = await this.prisma.insuranceProvider.findFirst({
      where: { id: providerId, hospitalId },
    });
    if (!provider) {
      throw new NotFoundException('شركة التأمين غير موجودة');
    }

    let planId: number | undefined;
    if (data.planId) {
      planId = Number(data.planId);
      const plan = await this.prisma.insurancePlan.findFirst({
        where: { id: planId, providerId },
      });
      if (!plan) {
        throw new BadRequestException(
          'خطة التأمين غير تابعة لشركة التأمين المحددة',
        );
      }
    }

    let priceListId: number | undefined;
    if (data.priceListId) {
      priceListId = Number(data.priceListId);
      const priceList = await this.prisma.priceList.findFirst({
        where: { id: priceListId, hospitalId },
      });
      if (!priceList) {
        throw new BadRequestException('قائمة الأسعار غير موجودة');
      }
    }

    const startDate = data.startDate ? new Date(data.startDate) : undefined;
    const endDate = data.endDate ? new Date(data.endDate) : undefined;
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException(
        'تاريخ انتهاء البوليصة يجب أن يكون بعد تاريخ البداية',
      );
    }

    const patientCopayRate = this.normalizeCopayFraction(
      data.patientCopayRate,
      'نسبة تحمل المريض',
    );

    let maxCoverageAmount: string | undefined;
    if (data.maxCoverageAmount != null && data.maxCoverageAmount !== '') {
      try {
        maxCoverageAmount = Money.toDbString(data.maxCoverageAmount);
      } catch {
        throw new BadRequestException('سقف التغطية غير صالح');
      }
      if (!Money.isPositive(maxCoverageAmount)) {
        throw new BadRequestException(
          'سقف التغطية الأقصى يجب أن يكون أكبر من صفر',
        );
      }
    }
    const { releaseCoverageOnPartialDispense } = data;
    if (
      releaseCoverageOnPartialDispense !== undefined &&
      typeof releaseCoverageOnPartialDispense !== 'boolean'
    )
      throw new BadRequestException(
        'خيار تحرير التغطية يجب أن يكون قيمة منطقية',
      );
    if (releaseCoverageOnPartialDispense && !maxCoverageAmount)
      throw new BadRequestException(
        'حدد سقف تغطية لتفعيل تحرير فرق الصرف الجزئي',
      );

    return this.prisma.insurancePolicy.create({
      data: {
        insuranceProviderId: providerId,
        name: data.name,
        policyNumber: data.policyNumber,
        startDate,
        endDate,
        planId,
        priceListId,
        patientCopayRate,
        maxCoverageAmount,
        releaseCoverageOnPartialDispense,
      },
    });
  }

  // 4. إنشاء خطة تأمين
  async createPlan(
    hospitalId: number,
    providerId: number,
    data: {
      name: string;
      defaultCopayRate?: number | string;
      maxCopayAmount?: number | string | null;
    },
  ) {
    const provider = await this.prisma.insuranceProvider.findFirst({
      where: { id: providerId, hospitalId },
    });
    if (!provider) {
      throw new NotFoundException('شركة التأمين غير موجودة');
    }

    const defaultCopayRate = this.normalizeCopayFraction(
      data.defaultCopayRate,
      'نسبة التحمل الافتراضية',
    );

    let maxCopayAmount: string | undefined;
    if (data.maxCopayAmount != null && data.maxCopayAmount !== '') {
      if (Money.lte(data.maxCopayAmount, 0)) {
        throw new BadRequestException(
          'الحد الأقصى للتحمل يجب أن يكون أكبر من صفر',
        );
      }
      maxCopayAmount = Money.toDbString(data.maxCopayAmount);
    }

    return this.prisma.insurancePlan.create({
      data: {
        providerId,
        name: data.name,
        defaultCopayRate,
        maxCopayAmount,
      },
    });
  }

  // 5. تفاصيل الخطة
  async getPlanDetails(hospitalId: number, planId: number) {
    const plan = await this.prisma.insurancePlan.findFirst({
      where: {
        id: planId,
        provider: { hospitalId },
      },
      include: {
        rules: {
          include: {
            serviceCategory: true,
            serviceItem: true,
          },
        },
      },
    });
    if (!plan) {
      throw new NotFoundException('خطة التأمين غير موجودة');
    }
    return plan;
  }

  // 6. إضافة قاعدة تغطية
  async addCoverageRule(hospitalId: number, planId: number, data: any) {
    const plan = await this.prisma.insurancePlan.findFirst({
      where: {
        id: planId,
        provider: { hospitalId },
      },
    });
    if (!plan) {
      throw new NotFoundException('خطة التأمين غير موجودة');
    }

    let serviceCategoryId: number | undefined;
    if (data.serviceCategoryId) {
      serviceCategoryId = Number(data.serviceCategoryId);
      const category = await this.prisma.serviceCategory.findFirst({
        where: { id: serviceCategoryId, hospitalId },
      });
      if (!category) {
        throw new BadRequestException('فئة الخدمة غير موجودة');
      }
    }

    let serviceItemId: number | undefined;
    if (data.serviceItemId) {
      serviceItemId = Number(data.serviceItemId);
      const item = await this.prisma.serviceItem.findFirst({
        where: { id: serviceItemId, hospitalId },
      });
      if (!item) {
        throw new BadRequestException('الخدمة الطبية غير موجودة');
      }
    }

    const copayType: CopayType = data.copayType || CopayType.PERCENTAGE;
    const rawCopay = Money.decimal(data.copayValue ?? 0);
    if (rawCopay.lt(0)) {
      throw new BadRequestException('قيمة التحمل لا يمكن أن تكون سالبة');
    }
    if (copayType === CopayType.PERCENTAGE && rawCopay.gt(100)) {
      throw new BadRequestException('نسبة التحمل لا يمكن أن تتجاوز 100%');
    }

    return this.prisma.coverageRule.create({
      data: {
        planId,
        serviceCategoryId,
        serviceItemId,
        ruleType: data.ruleType || CoverageRuleType.INCLUSION,
        copayType,
        copayValue: Money.toDbString(rawCopay),
        requiresApproval: Boolean(data.requiresApproval),
      },
    });
  }

  // 7. طلب موافقة مسبقة
  async createPreAuth(hospitalId: number, data: any) {
    const patientId = Number(data.patientId);
    const policyId = Number(data.policyId);

    const [patient, policy] = await Promise.all([
      this.prisma.patient.findFirst({
        where: { id: patientId, hospitalId },
      }),
      this.prisma.insurancePolicy.findFirst({
        where: {
          id: policyId,
          provider: { hospitalId },
        },
      }),
    ]);

    if (!patient) {
      throw new NotFoundException('المريض غير موجود');
    }
    if (!policy) {
      throw new NotFoundException('بوليصة التأمين غير موجودة');
    }

    let serviceItemId: number | undefined;
    if (data.serviceItemId) {
      serviceItemId = Number(data.serviceItemId);
      const item = await this.prisma.serviceItem.findFirst({
        where: { id: serviceItemId, hospitalId },
      });
      if (!item) {
        throw new BadRequestException('الخدمة الطبية غير موجودة');
      }
    }

    let requestedAmount: string | undefined;
    if (data.requestedAmount != null && data.requestedAmount !== '') {
      if (Money.lte(data.requestedAmount, 0)) {
        throw new BadRequestException('المبلغ المطلوب يجب أن يكون أكبر من صفر');
      }
      requestedAmount = Money.toDbString(data.requestedAmount);
    }

    return this.prisma.preAuthorization.create({
      data: {
        hospitalId,
        patientId,
        policyId,
        serviceItemId,
        diagnosisCodeId: data.diagnosisCodeId
          ? Number(data.diagnosisCodeId)
          : undefined,
        requestedAmount,
        notes: data.notes,
        status: 'PENDING',
      },
    });
  }

  // 8. جلب الموافقات
  async getPatientCoverageBalance(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId, isDeleted: false },
      select: {
        insurancePolicy: {
          select: {
            id: true,
            maxCoverageAmount: true,
            provider: { select: { id: true, hospitalId: true } },
          },
        },
      },
    });
    if (!patient) throw new NotFoundException('المريض غير موجود');
    const policy = patient.insurancePolicy;
    if (!policy || policy.provider.hospitalId !== hospitalId) return null;
    return readCoverageBalance(this.prisma, {
      hospitalId,
      patientId,
      policyId: policy.id,
      providerId: policy.provider.id,
      cap: policy.maxCoverageAmount,
    });
  }

  getPreAuthServices(hospitalId: number) {
    return this.prisma.serviceItem.findMany({
      where: { hospitalId, isActive: true, isBillable: true, isDeleted: false },
      select: { id: true, name: true, code: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async getPreAuths(hospitalId: number, patientId?: number) {
    const where: any = { hospitalId };
    if (patientId) where.patientId = patientId;

    return this.prisma.preAuthorization.findMany({
      where,
      include: {
        patient: true,
        policy: { include: { provider: true } },
        serviceItem: true,
        prescription: {
          select: {
            id: true,
            encounterId: true,
            status: true,
            prepaidInvoiceId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 8.5 تحديث موافقة مسبقة
  async updatePreAuth(
    hospitalId: number,
    id: number,
    userId: number,
    data: any,
  ) {
    const existing = await this.prisma.preAuthorization.findFirst({
      where: { id, hospitalId },
      include: { serviceItem: { select: { type: true } } },
    });
    if (!existing) {
      throw new NotFoundException('طلب الموافقة المسبقة غير موجود');
    }
    if (existing.isPrescriptionRequest) {
      return this.pharmacy.reviewPrescriptionAuthorization(
        hospitalId,
        id,
        userId,
        data as Parameters<
          PharmacyService['reviewPrescriptionAuthorization']
        >[3],
      );
    }

    let approvedAmount: string | undefined;
    if (data.approvedAmount != null && data.approvedAmount !== '') {
      if (Money.lt(data.approvedAmount, 0)) {
        throw new BadRequestException('المبلغ المعتمد لا يمكن أن يكون سالباً');
      }
      approvedAmount = Money.toDbString(data.approvedAmount);
    }

    const { authCode, status } = data as {
      authCode?: unknown;
      status?: unknown;
    };
    if (
      existing.serviceItem?.type === 'PHARMACY' &&
      status === 'APPROVED' &&
      (typeof authCode !== 'string' ||
        !authCode.trim() ||
        !Money.isPositive(approvedAmount))
    )
      throw new BadRequestException(
        'تتطلب موافقة الصيدلية رمز اعتماد ومبلغًا معتمدًا موجبًا',
      );

    return this.prisma.preAuthorization.update({
      where: { id },
      data: {
        status: data.status,
        authCode: data.authCode,
        approvedAmount,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
    });
  }

  // 9. تقرير المطالبات
  recordClaimWithdrawal(
    hospitalId: number,
    invoiceId: number,
    userId: number,
    input: ClaimWithdrawalInput,
  ) {
    return this.prisma.$transaction(
      (tx) => recordClaimWithdrawal(tx, hospitalId, invoiceId, userId, input),
      { maxWait: 10000, timeout: 20000 },
    );
  }

  listClaimReceiptRefunds(hospitalId: number, invoiceId: number) {
    return listClaimReceiptRefunds(this.prisma, hospitalId, invoiceId);
  }

  requestClaimReceiptRefund(
    hospitalId: number,
    invoiceId: number,
    userId: number,
    input: RefundRequest,
  ) {
    return this.prisma.$transaction(
      (tx) =>
        requestClaimReceiptRefund(tx, { hospitalId, invoiceId, userId }, input),
      { maxWait: 10000, timeout: 20000 },
    );
  }

  reviewClaimReceiptRefund(
    hospitalId: number,
    invoiceId: number,
    userId: number,
    refundId: number,
    input: RefundReview,
  ) {
    return this.prisma.$transaction(
      (tx) =>
        reviewClaimReceiptRefund(
          tx,
          { hospitalId, invoiceId, userId },
          refundId,
          input,
        ),
      { maxWait: 10000, timeout: 20000 },
    );
  }

  async getClaims(
    hospitalId: number,
    filters: {
      providerId?: number;
      status?: string;
      fromDate?: Date;
      toDate?: Date;
    },
  ) {
    const where: any = {
      hospitalId,
      insuranceShare: { gt: 0 },
      ...(filters.status === 'WITHDRAWN'
        ? { claimWithdrawal: { isNot: null } }
        : dispensedPrescriptionClaim),
    };

    if (filters.providerId) {
      where.insuranceProviderId = filters.providerId;
    }

    if (filters.status) {
      where.claimStatus = filters.status;
    }

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = filters.fromDate;
      if (filters.toDate) where.createdAt.lte = filters.toDate;
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        insuranceProvider: true,
        patient: true,
        prepaidPrescription: { select: { id: true } },
        claims: {
          select: {
            id: true,
            status: true,
            batchId: true,
            paidAmount: true,
            _count: { select: { receipts: true } },
          },
        },
        claimWithdrawal: {
          select: { payerReference: true, reason: true, createdAt: true },
        },
        adjustments: {
          where: {
            OR: [{ insuranceOnly: true }, { partialDispense: true }],
            status: 'POSTED',
          },
          select: { insuranceDelta: true, delta: true },
        },
        insuranceSettlementAllocations: {
          orderBy: { id: 'desc' },
          select: {
            ...settlementAllocationBalance,
            settlement: { select: { id: true, bankReference: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invoices.map(
      ({ insuranceSettlementAllocations, adjustments, ...invoice }) => {
        const share = Money.sumDecimal(
          invoice.insuranceShare,
          ...adjustments.map((item) => item.insuranceDelta),
        );
        const individual =
          invoice.claims.length === 1 && invoice.claims[0]._count.receipts > 0
            ? invoice.claims[0]
            : null;
        return {
          ...invoice,
          settlementEffectiveShare: Money.toDbString(share),
          settlementEffectivePatientShare: Money.toDbString(
            Money.sumDecimal(
              invoice.patientShare,
              ...adjustments.map((item) => item.delta),
            ),
          ),
          settlementOutstanding: insuranceSettlementAllocations.length
            ? Money.toDbString(
                share.minus(settlementNet(insuranceSettlementAllocations)),
              )
            : individual
              ? Money.toDbString(
                  share.minus(Money.decimal(individual.paidAmount)),
                )
              : null,
          insuranceSettlementAllocations: insuranceSettlementAllocations.map(
            ({ settlement, amount }) => ({ settlement, amount }),
          ),
        };
      },
    );
  }

  // ✅ 11. تحديث حالة المطالبة (الذكي والذري)
  listInsuranceSettlements(
    hospitalId: number,
    filters: { providerId?: number; onlyUnallocated?: boolean },
  ) {
    return listInsuranceSettlements(this.prisma, hospitalId, filters);
  }

  postInsuranceSettlement(
    hospitalId: number,
    userId: number,
    input: InsuranceSettlementInput,
  ) {
    return this.prisma.$transaction(
      (tx) => postInsuranceSettlement(tx, hospitalId, userId, input),
      { maxWait: 10000, timeout: 30000 },
    );
  }

  applyInsuranceSettlementCredit(
    hospitalId: number,
    settlementId: number,
    userId: number,
    input: ApplySettlementCreditInput,
  ) {
    return this.prisma.$transaction(
      (tx) =>
        applyInsuranceSettlementCredit(
          tx,
          { hospitalId, settlementId, userId },
          input,
        ),
      { maxWait: 10000, timeout: 30000 },
    );
  }

  listSettlementRefunds(hospitalId: number, settlementId: number) {
    return listSettlementRefunds(this.prisma, hospitalId, settlementId);
  }

  requestSettlementRefund(
    hospitalId: number,
    settlementId: number,
    userId: number,
    input: SettlementRefundInput,
  ) {
    return this.prisma.$transaction(
      (tx) =>
        requestSettlementRefund(
          tx,
          { hospitalId, settlementId, userId },
          input,
        ),
      { maxWait: 10000, timeout: 30000 },
    );
  }

  reviewSettlementRefund(
    hospitalId: number,
    settlementId: number,
    userId: number,
    refundId: number,
    input: SettlementRefundReview,
  ) {
    return this.prisma.$transaction(
      (tx) =>
        reviewSettlementRefund(
          tx,
          { hospitalId, settlementId, userId },
          refundId,
          input,
        ),
      { maxWait: 10000, timeout: 30000 },
    );
  }

  async updateClaimsStatus(
    hospitalId: number,
    invoiceIds: number[],
    status: string,
    rejectionReason?: string,
    userId?: number,
  ) {
    const uniqueInvoiceIds = Array.from(
      new Set(
        (invoiceIds ?? [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ).sort((a, b) => a - b);

    if (uniqueInvoiceIds.length === 0) return { count: 0 };

    if (status === 'PAID')
      throw new BadRequestException(
        'يلزم تسجيل تحويل بنكي من مسار التسوية الجماعية',
      );
    const allowedStatuses = ['PENDING', 'SUBMITTED', 'REJECTED'];
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(`حالة المطالبة غير صالحة: ${status}`);
    }
    if (status === 'REJECTED' && !rejectionReason?.trim()) {
      throw new BadRequestException('سبب الرفض مطلوب عند رفض المطالبات');
    }

    return this.prisma.$transaction(async (tx) => {
      // قفل استشاري لمنع تسوية نفس المطالبات مرتين بالتوازي
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::int)`;

      // قفل صفوف الفواتير المستهدفة داخل المعاملة
      await tx.$queryRaw`
        SELECT id FROM "Invoice"
        WHERE "hospitalId" = ${hospitalId}
          AND id IN (${uniqueInvoiceIds[0]})
        FOR UPDATE
      `;
      for (const invId of uniqueInvoiceIds.slice(1)) {
        await tx.$queryRaw`
          SELECT id FROM "Invoice"
          WHERE "hospitalId" = ${hospitalId}
            AND id = ${invId}
          FOR UPDATE
        `;
      }

      const invoices = await tx.invoice.findMany({
        where: {
          hospitalId,
          id: { in: uniqueInvoiceIds },
          insuranceShare: { gt: 0 },
          ...dispensedPrescriptionClaim,
        },
        include: { insuranceProvider: true },
        orderBy: { id: 'asc' },
      });

      if (invoices.length !== uniqueInvoiceIds.length) {
        throw new BadRequestException(
          'بعض الفواتير غير مؤهلة للمطالبة؛ تحقق من التغطية وتنفيذ الصرف',
        );
      }

      if (invoices.some((inv) => inv.status === InvoiceStatus.CANCELLED)) {
        throw new BadRequestException(
          'لا يمكن تحديث مطالبة تأمينية لفاتورة ملغاة',
        );
      }

      if (invoices.some((inv) => inv.claimStatus === 'PAID')) {
        throw new BadRequestException(
          'إحدى المطالبات المحددة مسددة بالفعل ولا يمكن إعادة تسويتها أو تعديل حالتها',
        );
      }
      if (invoices.some((inv) => inv.claimStatus === 'WITHDRAWN'))
        throw new BadRequestException(
          'المطالبة مسحوبة ولا يمكن إعادة إرسالها أو تحصيلها',
        );

      if (
        await tx.insuranceSettlementAllocation.count({
          where: { invoiceId: { in: uniqueInvoiceIds } },
        })
      )
        throw new BadRequestException(
          'تحديث المطالبة المرتبطة بحوالة يتطلب مسار التسوية الموثق',
        );

      if (
        await tx.claimReceipt.count({
          where: { hospitalId, claim: { invoiceId: { in: uniqueInvoiceIds } } },
        })
      )
        throw new BadRequestException(
          'توجد تحصيلات RCM مثبتة؛استكمل التحصيل من دورة المطالبة بدل التسوية الجماعية',
        );
      if (
        await tx.claim.count({
          where: {
            hospitalId,
            invoiceId: { in: uniqueInvoiceIds },
            invoice: { prepaidPrescription: { isNot: null } },
          },
        })
      )
        throw new BadRequestException(
          'للفاتورة مطالبة قائمة في دورة الإيرادات؛ تابعها من المسار نفسه',
        );
      await tx.invoice.updateMany({
        where: { hospitalId, id: { in: uniqueInvoiceIds } },
        data: {
          claimStatus: status,
          rejectionReason:
            status === 'REJECTED' ? rejectionReason?.trim() : null,
        },
      });

      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: `INSURANCE_CLAIMS_${status}`,
        entity: 'Invoice',
        entityId: uniqueInvoiceIds[0],
        details: {
          invoiceIds: uniqueInvoiceIds,
          status,
          rejectionReason:
            status === 'REJECTED' ? rejectionReason?.trim() : null,
        },
      });

      return { count: invoices.length, status };
    });
  }

  // تحديث بيانات شركة التأمين
  async updateProvider(hospitalId: number, id: number, data: any) {
    const existing = await this.prisma.insuranceProvider.findFirst({
      where: { id, hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('شركة التأمين غير موجودة');
    }

    return this.prisma.insuranceProvider.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        phone: data.phone,
        email: data.email,
        address: data.address,
        isActive: data.isActive,
      },
    });
  }

  // الحذف الناعم (Soft Delete) - تحويل الحالة إلى غير نشط مع التحقق من المطالبات المعلقة
  async softDeleteProvider(hospitalId: number, id: number) {
    const existing = await this.prisma.insuranceProvider.findFirst({
      where: { id, hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('شركة التأمين غير موجودة');
    }

    const pendingClaimsCount = await this.prisma.invoice.count({
      where: {
        hospitalId,
        insuranceProviderId: id,
        insuranceShare: { gt: 0 },
        status: { not: InvoiceStatus.CANCELLED },
        claimStatus: { in: ['PENDING', 'SUBMITTED', 'PARTIALLY_PAID'] },
      },
    });
    if (pendingClaimsCount > 0) {
      throw new BadRequestException(
        `لا يمكن تعطيل شركة التأمين لوجود ${pendingClaimsCount} مطالبة معلقة أو قيد التحصيل`,
      );
    }

    return this.prisma.insuranceProvider.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
