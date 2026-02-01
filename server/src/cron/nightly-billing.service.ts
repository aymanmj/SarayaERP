// src/cron/nightly-billing.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EncounterType,
  EncounterStatus,
  ChargeSource,
  ServiceType,
} from '@prisma/client';

@Injectable()
export class NightlyBillingService {
  private readonly logger = new Logger(NightlyBillingService.name);

  constructor(private prisma: PrismaService) {}

  async runDailyBedCharges() {
    this.logger.log('🔄 Starting Nightly Bed Charges Job (Dynamic Pricing)...');

    // 1. جلب الحالات
    const activeAdmissions = await this.prisma.encounter.findMany({
      where: {
        type: EncounterType.IPD,
        status: EncounterStatus.OPEN,
        bedAssignments: { some: { to: null } },
      },
      include: {
        bedAssignments: {
          where: { to: null },
          include: {
            bed: {
              include: {
                // ✅ الآن Prisma ستعرف هذا الحقل بعد تنفيذ الـ migrate
                ward: { include: { serviceItem: true } },
              },
            },
          },
        },
      },
    });

    let count = 0;
    const errors: string[] = [];

    for (const encounter of activeAdmissions) {
      // ✅ حل مشكلة TS2339: الآن TypeScript يعرف أن bedAssignments موجودة
      const assignment = encounter.bedAssignments[0];
      if (!assignment) continue;

      const ward = assignment.bed.ward;
      const serviceItem = ward.serviceItem;

      if (!serviceItem) {
        const msg = `⚠️ Ward "${ward.name}" has no linked Service Item. Cannot bill Encounter #${encounter.id}`;
        this.logger.warn(msg);
        errors.push(msg);
        continue;
      }

      // التحقق من التكرار
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const existingCharge = await this.prisma.encounterCharge.findFirst({
        where: {
          encounterId: encounter.id,
          serviceItemId: serviceItem.id,
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      });

      if (existingCharge) continue;

      // إنشاء التكلفة
      await this.prisma.encounterCharge.create({
        data: {
          hospitalId: encounter.hospitalId,
          encounterId: encounter.id,
          serviceItemId: serviceItem.id,
          sourceType: ChargeSource.BED,
          sourceId: assignment.id,
          quantity: 1,
          unitPrice: serviceItem.defaultPrice,
          totalAmount: serviceItem.defaultPrice,
        },
      });

      count++;
    }

    this.logger.log(
      `✅ Finished. Charged ${count} beds using dynamic ward pricing.`,
    );
    return { success: true, chargedCount: count, errors };
  }
}

// // src/cron/nightly-billing.service.ts

// import { Injectable, Logger } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   EncounterType,
//   EncounterStatus,
//   ChargeSource,
//   ServiceType,
// } from '@prisma/client';

// @Injectable()
// export class NightlyBillingService {
//   private readonly logger = new Logger(NightlyBillingService.name);

//   constructor(private prisma: PrismaService) {}

//   // تشغيل الوظيفة يدوياً أو عبر الجدولة
//   // async runDailyBedCharges() {
//   //   this.logger.log('🔄 Starting Nightly Bed Charges Job...');

//   //   // 1. البحث عن كل حالات التنويم (IPD) المفتوحة والتي لديها سرير مخصص حالياً
//   //   const activeAdmissions = await this.prisma.encounter.findMany({
//   //     where: {
//   //       type: EncounterType.IPD,
//   //       status: EncounterStatus.OPEN,
//   //       // شرط: يوجد حجز سرير لم ينتهِ بعد (to: null)
//   //       bedAssignments: {
//   //         some: {
//   //           to: null,
//   //         },
//   //       },
//   //     },
//   //     include: {
//   //       bedAssignments: {
//   //         where: { to: null },
//   //         include: {
//   //           bed: {
//   //             include: {
//   //               ward: true, // نحتاج معلومات العنبر لتحديد السعر
//   //             },
//   //           },
//   //         },
//   //       },
//   //     },
//   //   });

//   //   let count = 0;
//   //   const errors: string[] = [];

//   //   for (const encounter of activeAdmissions) {
//   //     // نأخذ آخر سرير مخصص للمريض
//   //     const assignment = encounter.bedAssignments[0];
//   //     if (!assignment) continue;

//   //     const hospitalId = encounter.hospitalId;
//   //     const wardType = assignment.bed.ward.type; // مثال: "General", "ICU", "Private"

//   //     // 2. تحديد كود الخدمة بناءً على نوع العنبر
//   //     // (يجب أن تتطابق هذه الأكواد مع ما تم زرعه في seed.services.ts)
//   //     let serviceCode = 'BED-GEN-DAY'; // الافتراضي: سرير عام

//   //     if (wardType && wardType.toUpperCase().includes('ICU')) {
//   //       serviceCode = 'BED-ICU-DAY';
//   //     } else if (wardType && wardType.toUpperCase().includes('NICU')) {
//   //       serviceCode = 'BED-NICU-DAY';
//   //     } else if (wardType && wardType.toUpperCase().includes('PRIVATE')) {
//   //       serviceCode = 'BED-PRIV-DAY';
//   //     } else if (wardType && wardType.toUpperCase().includes('SEMI')) {
//   //       serviceCode = 'BED-SEMI-DAY';
//   //     }

//   //     // جلب تفاصيل الخدمة والسعر
//   //     const serviceItem = await this.prisma.serviceItem.findFirst({
//   //       where: {
//   //         hospitalId,
//   //         code: serviceCode,
//   //         type: ServiceType.BED,
//   //         isActive: true,
//   //       },
//   //     });

//   //     if (!serviceItem) {
//   //       const msg = `⚠️ No Bed Service found for code ${serviceCode} in hospital ${hospitalId}`;
//   //       this.logger.warn(msg);
//   //       errors.push(msg);
//   //       continue;
//   //     }

//   //     // 3. التحقق من التكرار: هل تم الخصم لهذا اليوم بالفعل؟
//   //     // نحدد بداية ونهاية اليوم الحالي
//   //     const todayStart = new Date();
//   //     todayStart.setHours(0, 0, 0, 0);
//   //     const todayEnd = new Date();
//   //     todayEnd.setHours(23, 59, 59, 999);

//   //     const existingCharge = await this.prisma.encounterCharge.findFirst({
//   //       where: {
//   //         encounterId: encounter.id,
//   //         serviceItemId: serviceItem.id,
//   //         sourceType: ChargeSource.BED,
//   //         createdAt: {
//   //           gte: todayStart,
//   //           lte: todayEnd,
//   //         },
//   //       },
//   //     });

//   //     if (existingCharge) {
//   //       // تم الاحتساب مسبقاً لهذا اليوم، نتجاوز
//   //       continue;
//   //     }

//   //     // 4. إنشاء بند الفوترة (Charge)
//   //     await this.prisma.encounterCharge.create({
//   //       data: {
//   //         hospitalId,
//   //         encounterId: encounter.id,
//   //         serviceItemId: serviceItem.id,
//   //         sourceType: ChargeSource.BED,
//   //         sourceId: assignment.id, // نربطه بid حجز السرير
//   //         quantity: 1,
//   //         unitPrice: serviceItem.defaultPrice,
//   //         totalAmount: serviceItem.defaultPrice, // 1 * price
//   //       },
//   //     });

//   //     count++;
//   //   }

//   //   const message = `✅ Nightly Job Finished. Charged ${count} beds.`;
//   //   this.logger.log(message);

//   //   return {
//   //     success: true,
//   //     chargedCount: count,
//   //     scannedCount: activeAdmissions.length,
//   //     errors,
//   //   };
//   // }

//   async runDailyBedCharges() {
//     this.logger.log('🔄 Starting Nightly Bed Charges Job (Dynamic Pricing)...');

//     const activeAdmissions = await this.prisma.encounter.findMany({
//       where: {
//         type: EncounterType.IPD,
//         status: EncounterStatus.OPEN,
//         bedAssignments: { some: { to: null } },
//       },
//       include: {
//         bedAssignments: {
//           where: { to: null },
//           include: {
//             bed: {
//               include: {
//                 // ✅ نضمن جلب خدمة التسعير المرتبطة بالعنبر
//                 ward: { include: { serviceItem: true } },
//               },
//             },
//           },
//         },
//       },
//     });

//     let count = 0;
//     const errors: string[] = [];

//     for (const encounter of activeAdmissions) {
//       const assignment = encounter.bedAssignments[0];
//       if (!assignment) continue;

//       const ward = assignment.bed.ward;
//       const serviceItem = ward.serviceItem; // ✅ السعر يأتي من العنبر مباشرة

//       if (!serviceItem) {
//         // حالة خطأ: العنبر ليس له تسعير
//         const msg = `⚠️ Ward "${ward.name}" has no linked Service Item. Cannot bill Encounter #${encounter.id}`;
//         this.logger.warn(msg);
//         errors.push(msg);
//         continue;
//       }

//       // التحقق من التكرار لليوم الحالي
//       const todayStart = new Date();
//       todayStart.setHours(0, 0, 0, 0);
//       const todayEnd = new Date();
//       todayEnd.setHours(23, 59, 59, 999);

//       const existingCharge = await this.prisma.encounterCharge.findFirst({
//         where: {
//           encounterId: encounter.id,
//           serviceItemId: serviceItem.id, // نستخدم نفس الخدمة
//           createdAt: { gte: todayStart, lte: todayEnd },
//         },
//       });

//       if (existingCharge) continue;

//       // إنشاء التكلفة
//       await this.prisma.encounterCharge.create({
//         data: {
//           hospitalId: encounter.hospitalId,
//           encounterId: encounter.id,
//           serviceItemId: serviceItem.id,
//           sourceType: ChargeSource.BED,
//           sourceId: assignment.id,
//           quantity: 1,
//           unitPrice: serviceItem.defaultPrice,
//           totalAmount: serviceItem.defaultPrice,
//           // يمكن إضافة note: `Nightly Charge: ${ward.name}`
//         },
//       });

//       count++;
//     }

//     this.logger.log(
//       `✅ Finished. Charged ${count} beds using dynamic ward pricing.`,
//     );
//     return { success: true, chargedCount: count, errors };
//   }
// }
