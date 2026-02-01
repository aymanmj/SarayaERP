// src/dashboard/dashboard.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BedStatus, EncounterStatus, EncounterType } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // ✅ نستقبل الآن الـ User بالكامل لتحديد الصلاحيات
  async getStats(hospitalId: number, userId: number, roles: string[]) {
    // تحديد بداية ونهاية اليوم بدقة
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
    );
    const todayEnd = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
    );

    // 1. الإحصائيات العامة (يستطيع الكاشير رؤية إشغال الأسرة، لا ضرر، لكن سنركز على المال)

    // ... (اكواد المرضى والأسرة كما هي) ...
    const [
      activeInpatients,
      occupiedBeds,
      totalBeds,
      appointmentsToday,
      lowStockCount,
    ] = await Promise.all([
      this.prisma.encounter.count({
        where: {
          hospitalId,
          type: EncounterType.IPD,
          status: EncounterStatus.OPEN,
        },
      }),
      this.prisma.bed.count({
        where: { hospitalId, status: BedStatus.OCCUPIED },
      }),
      this.prisma.bed.count({ where: { hospitalId, isActive: true } }),
      this.prisma.appointment.count({
        where: {
          hospitalId,
          scheduledStart: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.product.count({
        where: {
          hospitalId,
          isActive: true,
          stockOnHand: { lte: this.prisma.product.fields.minStock },
        },
      }),
    ]);

    // 2. ✅ حساب الإيرادات (المنطق الجديد)
    let revenueQuery: any = {
      hospitalId,
      paidAt: { gte: todayStart, lte: todayEnd },
    };

    // ⛔ إذا كان كاشير (وليس مديراً)، نحسب إيراداته هو فقط (الوردية الحالية له)
    const isAdmin =
      roles.includes('ADMIN') ||
      roles.includes('CEO') ||
      roles.includes('ACCOUNTANT');
    const isCashier = roles.includes('CASHIER');

    if (isCashier && !isAdmin) {
      revenueQuery.cashierId = userId; // فلترة بالمستخدم
    }

    const revenueAgg = await this.prisma.payment.aggregate({
      where: revenueQuery,
      _sum: { amount: true },
    });

    const occupancyRate =
      totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // ✅ تحويل Decimal إلى Number لتجنب مشاكل العرض
    const todayRevenue = Number(revenueAgg._sum.amount ?? 0);

    return {
      activeInpatients,
      occupiedBeds,
      totalBeds,
      occupancyRate,
      appointmentsToday,
      todayRevenue, // سيعود بالقيمة الصحيحة (إما الكل للمدير، أو الشخصية للكاشير)
      lowStockCount,
      // نرسل مؤشر للفرونت ليعرف هل يعرض "إيراد اليوم" أم "إيرادك اليوم"
      isPersonalRevenue: !isAdmin && isCashier,
    };
  }
}

// // src/dashboard/dashboard.service.ts

// import { Injectable } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   BedStatus,
//   EncounterStatus,
//   EncounterType,
//   InvoiceStatus,
// } from '@prisma/client';

// @Injectable()
// export class DashboardService {
//   constructor(private prisma: PrismaService) {}

//   async getStats(hospitalId: number) {
//     const todayStart = new Date();
//     todayStart.setHours(0, 0, 0, 0);
//     const todayEnd = new Date();
//     todayEnd.setHours(23, 59, 59, 999);

//     // 1. إحصائيات المرضى والأسرة
//     const [
//       activeInpatients, // عدد المنومين حالياً
//       occupiedBeds, // عدد الأسرة المشغولة
//       totalBeds, // إجمالي الأسرة
//     ] = await Promise.all([
//       this.prisma.encounter.count({
//         where: {
//           hospitalId,
//           type: EncounterType.IPD,
//           status: EncounterStatus.OPEN,
//         },
//       }),
//       this.prisma.bed.count({
//         where: { hospitalId, status: BedStatus.OCCUPIED },
//       }),
//       this.prisma.bed.count({
//         where: { hospitalId, isActive: true },
//       }),
//     ]);

//     // 2. إحصائيات المواعيد اليوم
//     const appointmentsToday = await this.prisma.appointment.count({
//       where: {
//         hospitalId,
//         scheduledStart: {
//           gte: todayStart,
//           lte: todayEnd,
//         },
//       },
//     });

//     // 3. إيرادات اليوم (من الفواتير الصادرة أو المدفوعة)
//     const revenueAgg = await this.prisma.payment.aggregate({
//       where: {
//         hospitalId,
//         paidAt: {
//           gte: todayStart,
//           lte: todayEnd,
//         },
//       },
//       _sum: {
//         amount: true,
//       },
//     });

//     // 4. تنبيهات المخزون (المنتجات التي وصلت للحد الأدنى)
//     const lowStockCount = await this.prisma.product.count({
//       where: {
//         hospitalId,
//         isActive: true,
//         // حيث الرصيد أقل من أو يساوي الحد الأدنى
//         stockOnHand: {
//           lte: this.prisma.product.fields.minStock,
//         },
//       },
//     });

//     // حساب نسبة الإشغال
//     const occupancyRate =
//       totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

//     return {
//       activeInpatients,
//       occupiedBeds,
//       totalBeds,
//       occupancyRate,
//       appointmentsToday,
//       todayRevenue: Number(revenueAgg._sum.amount ?? 0),
//       lowStockCount,
//     };
//   }
// }
