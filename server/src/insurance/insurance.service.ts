// src/insurance/insurance.service.ts

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

@Injectable()
export class InsuranceService {
  private readonly logger = new Logger(InsuranceService.name);

  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  // ====================== Providers & Policies ======================

  // 1. قائمة الشركات
  async findAllProviders(hospitalId: number) {
    return this.prisma.insuranceProvider.findMany({
      where: { hospitalId, isActive: true },
      include: {
        // ✅ التعديل هنا: جلب الخطة داخل البوليصة
        policies: {
          where: { isActive: true }, // نجلب البوالص النشطة فقط
          include: {
            plan: { select: { name: true } }, // نحتاج الاسم للعرض
          },
        },
        plans: { include: { _count: { select: { rules: true } } } },
        account: { select: { code: true, name: true } },
      },
    });
  }

  // async findAllProviders(hospitalId: number) {
  //   return this.prisma.insuranceProvider.findMany({
  //     where: { hospitalId, isActive: true },
  //     include: {
  //       policies: true,
  //       plans: { include: { _count: { select: { rules: true } } } }, // ✅ جلب الخطط
  //       account: { select: { code: true, name: true } },
  //     },
  //   });
  // }

  // 2. إنشاء شركة جديدة
  async createProvider(hospitalId: number, data: any) {
    let accountId = data.accountId;
    if (!accountId) {
      const defaultAcc = await this.accounting.getSystemAccountOrThrow(
        hospitalId,
        SystemAccountKey.RECEIVABLE_INSURANCE,
      );
      accountId = defaultAcc.id;
    }

    return this.prisma.insuranceProvider.create({
      data: {
        hospitalId,
        name: data.name,
        code: data.code,
        phone: data.phone,
        email: data.email,
        address: data.address,
        accountId: accountId,
      },
    });
  }

  // 3. إضافة بوليصة (Updated to support Plan Link)
  async createPolicy(providerId: number, data: any) {
    const provider = await this.prisma.insuranceProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw new NotFoundException('شركة التأمين غير موجودة');

    return this.prisma.insurancePolicy.create({
      data: {
        insuranceProviderId: providerId,
        name: data.name,
        policyNumber: data.policyNumber,
        patientCopayRate: data.patientCopayRate || 0, // Fallback logic
        maxCoverageAmount: data.maxCoverageAmount,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        planId: data.planId ? Number(data.planId) : null, // ✅ ربط بخطة
      },
    });
  }

  // 4. جلب بوليصة
  async getPolicy(id: number) {
    return this.prisma.insurancePolicy.findUnique({
      where: { id },
      include: { provider: true, plan: true },
    });
  }

  // ====================== Plans & Rules (New) ======================

  // 5. إنشاء خطة تأمين (Plan)
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

  // 6. إضافة قاعدة تغطية (Coverage Rule)
  async addCoverageRule(planId: number, data: any) {
    return this.prisma.coverageRule.create({
      data: {
        planId,
        serviceCategoryId: data.serviceCategoryId
          ? Number(data.serviceCategoryId)
          : null,
        serviceItemId: data.serviceItemId ? Number(data.serviceItemId) : null,
        ruleType:
          (data.ruleType as CoverageRuleType) || CoverageRuleType.INCLUSION,
        copayType: (data.copayType as CopayType) || CopayType.PERCENTAGE,
        copayValue: data.copayValue || 0,
        requiresApproval: data.requiresApproval || false,
      },
    });
  }

  // 7. جلب تفاصيل الخطة مع القواعد
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

  // ====================== Pre-Authorization (New) ======================

  // 8. إنشاء طلب موافقة مسبقة
  async createPreAuth(hospitalId: number, data: any) {
    return this.prisma.preAuthorization.create({
      data: {
        hospitalId,
        patientId: Number(data.patientId),
        policyId: Number(data.policyId),
        serviceItemId: data.serviceItemId ? Number(data.serviceItemId) : null,
        diagnosisCodeId: data.diagnosisCodeId
          ? Number(data.diagnosisCodeId)
          : null,
        authCode: data.authCode,
        status: data.status || 'PENDING',
        requestedAmount: data.requestedAmount,
        approvedAmount: data.approvedAmount,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        notes: data.notes,
      },
    });
  }

  // 9. جلب الموافقات
  async getPreAuths(hospitalId: number, patientId?: number) {
    return this.prisma.preAuthorization.findMany({
      where: {
        hospitalId,
        patientId: patientId || undefined,
      },
      include: {
        patient: { select: { fullName: true, mrn: true } },
        serviceItem: { select: { name: true } },
        policy: { include: { provider: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ====================== Claims & Payments ======================

  // 10. جلب المطالبات
  async getClaims(
    hospitalId: number,
    params: {
      providerId?: number;
      status?: string;
      fromDate?: Date;
      toDate?: Date;
    },
  ) {
    const where: Prisma.InvoiceWhereInput = {
      hospitalId,
      insuranceShare: { gt: 0 },
      status: { notIn: ['DRAFT', 'CANCELLED'] },
    };

    if (params.providerId) {
      where.insuranceProviderId = params.providerId;
    }

    if (params.status) {
      if (params.status === 'PENDING') {
        where.OR = [{ claimStatus: 'PENDING' }, { claimStatus: null }];
      } else {
        where.claimStatus = params.status;
      }
    } else {
      where.OR = [{ claimStatus: 'PENDING' }, { claimStatus: null }];
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) (where.createdAt as any).gte = params.fromDate;
      if (params.toDate) (where.createdAt as any).lte = params.toDate;
    }

    return this.prisma.invoice.findMany({
      where,
      include: {
        patient: {
          select: { fullName: true, mrn: true, insuranceMemberId: true },
        },
        insuranceProvider: { select: { name: true } },
        encounter: { select: { type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 11. تحديث حالة المطالبة (الذكي)
  async updateClaimsStatus(
    hospitalId: number,
    invoiceIds: number[],
    status: string,
    userId?: number,
  ) {
    if (invoiceIds.length === 0) return { count: 0 };

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
          if (patientPaid >= patientShare - 0.01) {
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

// // src/insurance/insurance.service.ts

// import {
//   Injectable,
//   BadRequestException,
//   NotFoundException,
//   Logger,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   SystemAccountKey,
//   AccountingSourceModule,
//   InvoiceStatus,
//   Prisma,
// } from '@prisma/client';
// import { AccountingService } from '../accounting/accounting.service';

// @Injectable()
// export class InsuranceService {
//   private readonly logger = new Logger(InsuranceService.name);

//   constructor(
//     private prisma: PrismaService,
//     private accounting: AccountingService,
//   ) {}

//   // 1. قائمة الشركات
//   async findAllProviders(hospitalId: number) {
//     return this.prisma.insuranceProvider.findMany({
//       where: { hospitalId, isActive: true },
//       include: {
//         policies: true,
//         account: { select: { code: true, name: true } },
//       },
//     });
//   }

//   // 2. إنشاء شركة جديدة
//   async createProvider(hospitalId: number, data: any) {
//     let accountId = data.accountId;
//     if (!accountId) {
//       const defaultAcc = await this.accounting.getSystemAccountOrThrow(
//         hospitalId,
//         SystemAccountKey.RECEIVABLE_INSURANCE,
//       );
//       accountId = defaultAcc.id;
//     }

//     return this.prisma.insuranceProvider.create({
//       data: {
//         hospitalId,
//         name: data.name,
//         code: data.code,
//         phone: data.phone,
//         email: data.email,
//         address: data.address,
//         accountId: accountId,
//       },
//     });
//   }

//   // 3. إضافة بوليصة
//   async createPolicy(providerId: number, data: any) {
//     const provider = await this.prisma.insuranceProvider.findUnique({
//       where: { id: providerId },
//     });
//     if (!provider) throw new NotFoundException('شركة التأمين غير موجودة');

//     return this.prisma.insurancePolicy.create({
//       data: {
//         insuranceProviderId: providerId,
//         name: data.name,
//         policyNumber: data.policyNumber,
//         patientCopayRate: data.patientCopayRate || 0,
//         maxCoverageAmount: data.maxCoverageAmount,
//       },
//     });
//   }

//   // 4. جلب بوليصة
//   async getPolicy(id: number) {
//     return this.prisma.insurancePolicy.findUnique({
//       where: { id },
//       include: { provider: true },
//     });
//   }

//   // 5. جلب المطالبات
//   async getClaims(
//     hospitalId: number,
//     params: {
//       providerId?: number;
//       status?: string;
//       fromDate?: Date;
//       toDate?: Date;
//     },
//   ) {
//     const where: Prisma.InvoiceWhereInput = {
//       hospitalId,
//       insuranceShare: { gt: 0 },
//       status: { notIn: ['DRAFT', 'CANCELLED'] },
//     };

//     if (params.providerId) {
//       where.insuranceProviderId = params.providerId;
//     }

//     if (params.status) {
//       if (params.status === 'PENDING') {
//         where.OR = [{ claimStatus: 'PENDING' }, { claimStatus: null }];
//       } else {
//         where.claimStatus = params.status;
//       }
//     } else {
//       where.OR = [{ claimStatus: 'PENDING' }, { claimStatus: null }];
//     }

//     if (params.fromDate || params.toDate) {
//       where.createdAt = {};
//       if (params.fromDate) (where.createdAt as any).gte = params.fromDate;
//       if (params.toDate) (where.createdAt as any).lte = params.toDate;
//     }

//     return this.prisma.invoice.findMany({
//       where,
//       include: {
//         patient: {
//           select: { fullName: true, mrn: true, insuranceMemberId: true },
//         },
//         insuranceProvider: { select: { name: true } },
//         encounter: { select: { type: true } },
//       },
//       orderBy: { createdAt: 'desc' },
//     });
//   }

//   // ✅ 6. تحديث حالة المطالبة (الذكي)
//   // يقوم بإنشاء قيد محاسبي عند السداد وتحديث حالة الفاتورة
//   async updateClaimsStatus(
//     hospitalId: number,
//     invoiceIds: number[],
//     status: string,
//     userId?: number,
//   ) {
//     if (invoiceIds.length === 0) return { count: 0 };

//     // 1. جلب الفواتير لحساب المجموع والتحقق
//     const invoices = await this.prisma.invoice.findMany({
//       where: {
//         hospitalId,
//         id: { in: invoiceIds },
//         insuranceShare: { gt: 0 },
//       },
//       include: { insuranceProvider: true },
//     });

//     if (invoices.length === 0)
//       throw new BadRequestException('لم يتم العثور على فواتير صالحة.');

//     // تنفيذ كل شيء داخل Transaction
//     return this.prisma.$transaction(async (tx) => {
//       // أ) إذا كانت الحالة "مدفوعة" (PAID)، نقوم بالعمليات المالية
//       if (status === 'PAID') {
//         // حساب إجمالي المبلغ المستلم من التأمين
//         const totalInsuranceReceived = invoices.reduce(
//           (sum, inv) => sum + Number(inv.insuranceShare),
//           0,
//         );

//         // جلب الحسابات
//         await this.accounting.ensureDefaultAccountsForHospital(hospitalId);

//         // المدين: البنك (استلام حوالة)
//         const bankAccount = await this.accounting.getSystemAccountOrThrow(
//           hospitalId,
//           SystemAccountKey.BANK_MAIN,
//         );
//         // الدائن: ذمم التأمين
//         const arInsuranceAccount =
//           await this.accounting.getSystemAccountOrThrow(
//             hospitalId,
//             SystemAccountKey.RECEIVABLE_INSURANCE,
//           );

//         // الحصول على السنة المالية والفترة
//         const { fy, period } = await this.accounting.getOpenPeriodForDate(
//           hospitalId,
//           new Date(),
//         );

//         // إنشاء القيد المجمع (Bulk Journal Entry)
//         // Dr. Bank      XXX
//         // Cr. AR Ins    XXX
//         await tx.accountingEntry.create({
//           data: {
//             hospitalId,
//             entryDate: new Date(),
//             description: `سداد مطالبات تأمين (عدد ${invoices.length} فاتورة) - ${status}`,
//             sourceModule: AccountingSourceModule.SUPPLIER_PAYMENT, // نستخدم هذا مؤقتاً أو نضيف module جديد INSURANCE_CLAIM
//             sourceId: null, // قيد مجمع ليس له مصدر واحد، يمكن وضع id المطالبة لو أنشأنا جدولاً لها
//             financialYearId: fy.id,
//             financialPeriodId: period.id,
//             createdById: userId,
//             lines: {
//               create: [
//                 {
//                   accountId: bankAccount.id,
//                   debit: totalInsuranceReceived,
//                   credit: 0,
//                   description: 'استلام حوالة تأمين / صك',
//                 },
//                 {
//                   accountId: arInsuranceAccount.id,
//                   debit: 0,
//                   credit: totalInsuranceReceived,
//                   description: 'تسوية ذمم شركات التأمين',
//                 },
//               ],
//             },
//           },
//         });

//         // ب) تحديث حالة كل فاتورة على حدة (لتحديد هل أصبحت PAID بالكامل أم لا)
//         for (const inv of invoices) {
//           // الفاتورة تعتبر مدفوعة بالكامل إذا:
//           // ما دفعه المريض >= حصة المريض
//           // (بما أننا هنا، فحصة التأمين اعتبرت مدفوعة)

//           const patientPaid = Number(inv.paidAmount ?? 0);
//           const patientShare = Number(inv.patientShare ?? 0);

//           let newStatus = inv.status;
//           // تسامح بسيط في الفروقات (0.01)
//           if (patientPaid >= patientShare - 0.01) {
//             newStatus = InvoiceStatus.PAID;
//           } else {
//             // المريض لسه عليه فلوس
//             newStatus = InvoiceStatus.PARTIALLY_PAID;
//           }

//           await tx.invoice.update({
//             where: { id: inv.id },
//             data: {
//               claimStatus: 'PAID', // التأمين دفع
//               status: newStatus, // حالة الفاتورة الكلية
//             },
//           });
//         }
//       } else {
//         // إذا كانت الحالة مجرد SUBMITTED أو REJECTED، نحدث الحقل فقط
//         await tx.invoice.updateMany({
//           where: { id: { in: invoiceIds } },
//           data: { claimStatus: status },
//         });
//       }

//       return { count: invoices.length, status };
//     });
//   }
// }

// import {
//   Injectable,
//   BadRequestException,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import { SystemAccountKey } from '@prisma/client';
// import { AccountingService } from '../accounting/accounting.service';
// import { Prisma } from '@prisma/client';

// @Injectable()
// export class InsuranceService {
//   constructor(
//     private prisma: PrismaService,
//     private accounting: AccountingService,
//   ) {}

//   // 1. قائمة الشركات
//   async findAllProviders(hospitalId: number) {
//     return this.prisma.insuranceProvider.findMany({
//       where: { hospitalId, isActive: true },
//       include: {
//         policies: true,
//         account: { select: { code: true, name: true } },
//       },
//     });
//   }

//   // 2. إنشاء شركة جديدة
//   async createProvider(hospitalId: number, data: any) {
//     // التأكد من وجود حساب ذمم (Receivable Account)
//     // في الوضع المتقدم، ننشئ حساباً جديداً لكل شركة في الدليل المحاسبي تلقائياً
//     // للتبسيط الآن: سنربطها بحساب "ذمم شركات التأمين" العام (120200)

//     let accountId = data.accountId;

//     if (!accountId) {
//       const defaultAcc = await this.accounting.getSystemAccountOrThrow(
//         hospitalId,
//         SystemAccountKey.RECEIVABLE_INSURANCE,
//       );
//       accountId = defaultAcc.id;
//     }

//     return this.prisma.insuranceProvider.create({
//       data: {
//         hospitalId,
//         name: data.name,
//         code: data.code,
//         phone: data.phone,
//         email: data.email,
//         address: data.address,
//         accountId: accountId,
//       },
//     });
//   }

//   // 3. إضافة بوليصة (Policy) لشركة
//   async createPolicy(providerId: number, data: any) {
//     const provider = await this.prisma.insuranceProvider.findUnique({
//       where: { id: providerId },
//     });
//     if (!provider) throw new NotFoundException('شركة التأمين غير موجودة');

//     // patientCopayRate: نسبة تحمل المريض (0.20 = 20%)
//     return this.prisma.insurancePolicy.create({
//       data: {
//         insuranceProviderId: providerId,
//         name: data.name,
//         policyNumber: data.policyNumber,
//         patientCopayRate: data.patientCopayRate || 0,
//         maxCoverageAmount: data.maxCoverageAmount,
//       },
//     });
//   }

//   // 4. جلب بوليصة محددة (للحسابات وقت الفوترة)
//   async getPolicy(id: number) {
//     return this.prisma.insurancePolicy.findUnique({
//       where: { id },
//       include: { provider: true },
//     });
//   }

//   // ✅ 5. جلب مطالبات التأمين (فواتير بها حصة تأمين > 0)
//   async getClaims(
//     hospitalId: number,
//     params: {
//       providerId?: number;
//       status?: string;
//       fromDate?: Date;
//       toDate?: Date;
//     },
//   ) {
//     // تعريف متغير where بنوع Prisma.InvoiceWhereInput لضمان دقة الأنواع
//     const where: Prisma.InvoiceWhereInput = {
//       hospitalId,
//       insuranceShare: { gt: 0 },
//       status: { notIn: ['DRAFT', 'CANCELLED'] },
//     };

//     if (params.providerId) {
//       where.insuranceProviderId = params.providerId;
//     }

//     // ✅ [FIXED] استخدام OR للتعامل مع null بدلاً من in: [..., null]
//     if (params.status) {
//       if (params.status === 'PENDING') {
//         // هات الفواتير التي حالتها PENDING *أو* التي ليس لها حالة (null)
//         where.OR = [{ claimStatus: 'PENDING' }, { claimStatus: null }];
//       } else {
//         where.claimStatus = params.status;
//       }
//     } else {
//       // الافتراضي (بدون فلتر): هات المعلقة والجديدة
//       where.OR = [{ claimStatus: 'PENDING' }, { claimStatus: null }];
//     }

//     if (params.fromDate || params.toDate) {
//       where.createdAt = {};
//       // نستخدم Type Assertion (as Date) لتجنب أخطاء التايب سكربت المحتملة مع Prisma types المعقدة
//       if (params.fromDate) (where.createdAt as any).gte = params.fromDate;
//       if (params.toDate) (where.createdAt as any).lte = params.toDate;
//     }

//     return this.prisma.invoice.findMany({
//       where,
//       include: {
//         patient: {
//           select: { fullName: true, mrn: true, insuranceMemberId: true },
//         },
//         insuranceProvider: { select: { name: true } },
//         encounter: { select: { type: true } },
//       },
//       orderBy: { createdAt: 'desc' },
//     });
//   }

//   // ✅ 6. تحديث حالة المطالبة (مثلاً تم الإرسال)
//   async updateClaimsStatus(
//     hospitalId: number,
//     invoiceIds: number[],
//     status: string,
//   ) {
//     return this.prisma.invoice.updateMany({
//       where: {
//         hospitalId,
//         id: { in: invoiceIds },
//         insuranceShare: { gt: 0 },
//       },
//       data: {
//         claimStatus: status, // e.g., 'SUBMITTED'
//       },
//     });
//   }
// }
