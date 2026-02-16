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

  // ... (keeping other methods as is)

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
