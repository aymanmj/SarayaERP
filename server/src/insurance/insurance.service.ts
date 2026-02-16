import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SystemAccountKey,
  AccountingSourceModule,
  InvoiceStatus,
  Prisma,
  CopayType,
  CoverageRuleType,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@Injectable()
export class InsuranceService {
  private readonly logger = new Logger(InsuranceService.name);

  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
    private systemSettings: SystemSettingsService,
  ) {}


  // 1. القائمة الكاملة لشركات التأمين
  async findAllProviders(hospitalId: number) {
    return this.prisma.insuranceProvider.findMany({
      where: {
        hospitalId,
        isActive: true, // فقط الشركات النشطة
      },
      include: {
        _count: {
          select: { policies: true },
        },
      },
    });
  }

  // 2. إنشاء شركة تأمين جديدة
  async createProvider(hospitalId: number, data: any) {
    return this.prisma.insuranceProvider.create({
      data: {
        hospitalId,
        name: data.name,
        code: data.code,
        phone: data.phone,
        email: data.email,
        address: data.address,
        isActive: true,
      },
    });
  }

  // 3. إنشاء بوليصة تأمين
  async createPolicy(providerId: number, data: any) {
    return this.prisma.insurancePolicy.create({
      data: {
        insuranceProviderId: providerId,
        name: data.name,
        policyNumber: data.policyNumber,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        planId: data.planId ? Number(data.planId) : undefined,
        patientCopayRate: data.patientCopayRate || 0,
        maxCoverageAmount: data.maxCoverageAmount,
      },
    });
  }

  // 4. إنشاء خطة تأمين
  async createPlan(providerId: number, data: any) {
    return this.prisma.insurancePlan.create({
      data: {
        providerId,
        name: data.name,
        defaultCopayRate: data.defaultCopayRate || 0,
        maxCopayAmount: data.maxCopayAmount,
      },
    });
  }

  // 5. تفاصيل الخطة
  async getPlanDetails(planId: number) {
    return this.prisma.insurancePlan.findUnique({
      where: { id: planId },
      include: {
        rules: {
          include: {
            serviceCategory: true,
            serviceItem: true,
          },
        },
      },
    });
  }

  // 6. إضافة قاعدة تغطية
  async addCoverageRule(planId: number, data: any) {
    return this.prisma.coverageRule.create({
      data: {
        planId,
        serviceCategoryId: data.serviceCategoryId
          ? Number(data.serviceCategoryId)
          : undefined,
        serviceItemId: data.serviceItemId
          ? Number(data.serviceItemId)
          : undefined,
        ruleType: data.ruleType || CoverageRuleType.INCLUSION,
        copayType: data.copayType || CopayType.PERCENTAGE,
        copayValue: data.copayValue || 0,
        requiresApproval: data.requiresApproval || false,
      },
    });
  }

  // 7. طلب موافقة مسبقة
  async createPreAuth(hospitalId: number, data: any) {
    return this.prisma.preAuthorization.create({
      data: {
        hospitalId,
        patientId: Number(data.patientId),
        policyId: Number(data.policyId),
        serviceItemId: data.serviceItemId
          ? Number(data.serviceItemId)
          : undefined,
        diagnosisCodeId: data.diagnosisCodeId
          ? Number(data.diagnosisCodeId)
          : undefined,
        requestedAmount: data.requestedAmount,
        notes: data.notes,
        status: 'PENDING',
      },
    });
  }

  // 8. جلب الموافقات
  async getPreAuths(hospitalId: number, patientId?: number) {
    const where: any = { hospitalId };
    if (patientId) where.patientId = patientId;

    return this.prisma.preAuthorization.findMany({
      where,
      include: {
        patient: true,
        policy: { include: { provider: true } },
        serviceItem: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 9. تقرير المطالبات (استبدال النسخة الموجودة ربما)
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

    return this.prisma.invoice.findMany({
      where,
      include: {
        insuranceProvider: true,
        patient: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }


  // ✅ 11. تحديث حالة المطالبة (الذكي)
  async updateClaimsStatus(
    hospitalId: number,
    invoiceIds: number[],
    status: string,
    userId?: number,
  ) {
    if (invoiceIds.length === 0) return { count: 0 };

    // 0. جلب إعداد سماحية الفروقات
    const tolerance = await this.systemSettings.getNumber(
      hospitalId,
      'billing.paymentTolerance',
      0.01,
    );

    const invoices = await this.prisma.invoice.findMany({
      where: {
        hospitalId,
        id: { in: invoiceIds },
        insuranceShare: { gt: 0 },
      },
      include: { insuranceProvider: true },
    });

    if (invoices.length === 0)
      throw new BadRequestException('لم يتم العثور على فواتير صالحة.');

    return this.prisma.$transaction(async (tx) => {
      // أ) إذا كانت الحالة "مدفوعة" (PAID)، نقوم بالعمليات المالية
      if (status === 'PAID') {
        const totalInsuranceReceived = invoices.reduce(
          (sum, inv) => sum + Number(inv.insuranceShare),
          0,
        );

        await this.accounting.ensureDefaultAccountsForHospital(hospitalId);

        const bankAccount = await this.accounting.getSystemAccountOrThrow(
          hospitalId,
          SystemAccountKey.BANK_MAIN,
        );
        const arInsuranceAccount =
          await this.accounting.getSystemAccountOrThrow(
            hospitalId,
            SystemAccountKey.RECEIVABLE_INSURANCE,
          );

        const { fy, period } = await this.accounting.getOpenPeriodForDate(
          hospitalId,
          new Date(),
        );

        await tx.accountingEntry.create({
          data: {
            hospitalId,
            entryDate: new Date(),
            description: `سداد مطالبات تأمين (عدد ${invoices.length} فاتورة) - ${status}`,
            sourceModule: AccountingSourceModule.SUPPLIER_PAYMENT, // يمكن استخدام CASHIER أو إضافة نوع جديد
            sourceId: null,
            financialYearId: fy.id,
            financialPeriodId: period.id,
            createdById: userId,
            lines: {
              create: [
                {
                  accountId: bankAccount.id,
                  debit: totalInsuranceReceived,
                  credit: 0,
                  description: 'استلام حوالة تأمين / صك',
                },
                {
                  accountId: arInsuranceAccount.id,
                  debit: 0,
                  credit: totalInsuranceReceived,
                  description: 'تسوية ذمم شركات التأمين',
                },
              ],
            },
          },
        });

        for (const inv of invoices) {
          const patientPaid = Number(inv.paidAmount ?? 0);
          const patientShare = Number(inv.patientShare ?? 0);
          let newStatus = inv.status;
          
          // استخدام السماحية الديناميكية
          if (patientPaid >= patientShare - tolerance) {
            newStatus = InvoiceStatus.PAID;
          } else {
            newStatus = InvoiceStatus.PARTIALLY_PAID;
          }

          await tx.invoice.update({
            where: { id: inv.id },
            data: {
              claimStatus: 'PAID',
              status: newStatus,
            },
          });
        }
      } else {
        await tx.invoice.updateMany({
          where: { id: { in: invoiceIds } },
          data: { claimStatus: status },
        });
      }

      return { count: invoices.length, status };
    });
  }

  // تحديث بيانات شركة التأمين
  async updateProvider(id: number, data: any) {
    return this.prisma.insuranceProvider.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        phone: data.phone,
        email: data.email,
        address: data.address,
        isActive: data.isActive, // لتفعيل/تعطيل الشركة
      },
    });
  }

  // الحذف الناعم (Soft Delete) - تحويل الحالة إلى غير نشط
  async softDeleteProvider(id: number) {
    // يمكننا التحقق هنا إذا كان عليها مطالبات معلقة ومنع الحذف، لكن للتبسيط سنجعلها غير نشطة
    return this.prisma.insuranceProvider.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
