// src/reports/reports.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 📊 الملخص المالي التنفيذي (Cash Flow)
   * يحسب (الإيرادات المحصلة فعلياً) مقابل (المصروفات المعتمدة)
   */
  async getFinancialSummary(hospitalId: number, year: number) {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    return await Promise.all(
      months.map(async (month) => {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // 1. الإيرادات المحصلة فعلياً (من جدول Payments)
        const revenue = await this.prisma.payment.aggregate({
          where: {
            hospitalId,
            paidAt: { gte: startDate, lte: endDate },
          },
          _sum: { amount: true },
        });

        // 2. المصروفات (مشتريات معتمدة + رواتب معتمدة)
        const purchases = await this.prisma.purchaseInvoice.aggregate({
          where: {
            hospitalId,
            status: 'APPROVED',
            invoiceDate: { gte: startDate, lte: endDate },
          },
          _sum: { netAmount: true },
        });

        const payroll = await this.prisma.payrollRun.aggregate({
          where: {
            hospitalId,
            year,
            month,
            status: 'APPROVED',
          },
          _sum: { totalNet: true },
        });

        const totalRevenue = Number(revenue._sum.amount || 0);
        const totalExpense =
          Number(purchases._sum.netAmount || 0) +
          Number(payroll._sum.totalNet || 0);

        return {
          name: startDate.toLocaleString('ar-LY', { month: 'short' }),
          revenue: totalRevenue,
          expense: totalExpense,
          profit: totalRevenue - totalExpense,
        };
      }),
    );
  }

  /**
   * 🏥 مؤشرات الأداء التشغيلي (KPIs)
   */
  async getOperationalKPIs(hospitalId: number) {
    const [totalBeds, occupiedBeds, patientsCount, openEncounters] =
      await Promise.all([
        this.prisma.bed.count({ where: { hospitalId, isActive: true } }),
        this.prisma.bed.count({ where: { hospitalId, status: 'OCCUPIED' } }),
        this.prisma.patient.count({ where: { hospitalId, isActive: true } }),
        this.prisma.encounter.count({ where: { hospitalId, status: 'OPEN' } }),
      ]);

    return {
      occupancyRate:
        totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      totalPatients: patientsCount,
      activeCases: openEncounters,
      totalBeds,
      occupiedBeds,
    };
  }

  /**
   * 🥧 توزيع الإيرادات حسب فئة الخدمة (المختبر، الأشعة، إلخ)
   */
  async getOperationalStats(hospitalId: number) {
    const revenueByService = await this.prisma.encounterCharge.groupBy({
      by: ['serviceItemId'],
      where: { hospitalId },
      _sum: { totalAmount: true },
    });

    const services = await this.prisma.serviceItem.findMany({
      where: { hospitalId },
      include: { category: true },
    });

    const composition = new Map<string, number>();
    revenueByService.forEach((item) => {
      const srv = services.find((s) => s.id === item.serviceItemId);
      const catName = srv?.category?.name || 'خدمات عامة';
      composition.set(
        catName,
        (composition.get(catName) || 0) + Number(item._sum.totalAmount),
      );
    });

    return {
      revenueByService: Array.from(composition.entries()).map(
        ([name, value]) => ({ name, value }),
      ),
    };
  }

  /**
   * 👨‍⚕️ الأطباء الأكثر نشاطاً (حسب عدد الحالات)
   */
  async getTopPerforming(hospitalId: number) {
    const topDoctors = await this.prisma.encounter.groupBy({
      by: ['doctorId'],
      where: { hospitalId, doctorId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const doctorIds = topDoctors.map((d) => d.doctorId!).filter(Boolean);

    const users = await this.prisma.user.findMany({
      where: { id: { in: doctorIds } },
      select: { id: true, fullName: true },
    });

    return topDoctors.map((d) => ({
      name:
        users.find((u) => u.id === d.doctorId)?.fullName || 'طبيب غير معروف',
      patientsCount: d._count.id,
    }));
  }
}

// import { Injectable } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import { InvoiceStatus } from '@prisma/client';

// @Injectable()
// export class ReportsService {
//   constructor(private prisma: PrismaService) {}

//   // 1. الملخص المالي (إيرادات ومصروفات شهرية)
//   async getFinancialSummary(hospitalId: number, year: number) {
//     const startDate = new Date(year, 0, 1);
//     const endDate = new Date(year, 11, 31, 23, 59, 59);

//     // أ) الإيرادات الشهرية (من الفواتير المصدرة)
//     const invoices = await this.prisma.invoice.groupBy({
//       by: ['createdAt'],
//       where: {
//         hospitalId,
//         status: { not: InvoiceStatus.CANCELLED },
//         createdAt: { gte: startDate, lte: endDate },
//       },
//       _sum: { totalAmount: true },
//     });

//     // تجميع البيانات حسب الشهر (Prisma ترجع التاريخ باليوم، نحتاج تجميعها يدوياً أو باستخدام SQL raw، هنا سنجمعها بالكود للتبسيط)
//     const monthlyRevenue = Array(12).fill(0);
//     invoices.forEach((inv) => {
//       const month = new Date(inv.createdAt).getMonth();
//       monthlyRevenue[month] += Number(inv._sum.totalAmount || 0);
//     });

//     // ب) المصروفات الشهرية (من المشتريات المعتمدة + الرواتب)
//     // 1. المشتريات
//     const purchases = await this.prisma.purchaseInvoice.groupBy({
//       by: ['invoiceDate'],
//       where: {
//         hospitalId,
//         status: { not: 'CANCELLED' }, // Assuming PurchaseInvoiceStatus enum
//         invoiceDate: { gte: startDate, lte: endDate },
//       },
//       _sum: { netAmount: true },
//     });

//     // 2. الرواتب
//     const payrolls = await this.prisma.payrollRun.groupBy({
//       by: ['month'], // لدينا حقل month جاهز
//       where: {
//         hospitalId,
//         year: year,
//         status: { not: 'CANCELLED' }, // Assuming PayrollStatus
//       },
//       _sum: { totalNet: true },
//     });

//     const monthlyExpenses = Array(12).fill(0);

//     purchases.forEach((p) => {
//       const month = new Date(p.invoiceDate).getMonth();
//       monthlyExpenses[month] += Number(p._sum.netAmount || 0);
//     });

//     payrolls.forEach((p) => {
//       // payroll month is 1-based
//       if (p.month >= 1 && p.month <= 12) {
//         monthlyExpenses[p.month - 1] += Number(p._sum.totalNet || 0);
//       }
//     });

//     // تنسيق البيانات للرسم البياني
//     const chartData = monthlyRevenue.map((rev, index) => ({
//       name: new Date(year, index).toLocaleString('ar-LY', { month: 'short' }),
//       revenue: rev,
//       expense: monthlyExpenses[index],
//       profit: rev - monthlyExpenses[index],
//     }));

//     return chartData;
//   }

//   // 2. إحصائيات تشغيلية (توزيع المرضى)
//   async getOperationalStats(hospitalId: number) {
//     // توزيع الإيرادات حسب نوع الخدمة (مختبر، أشعة، إقامة...)
//     // نعتمد على EncounterCharge.serviceItem.category
//     const revenueByCat = await this.prisma.encounterCharge.groupBy({
//       by: ['serviceItemId'],
//       where: {
//         hospitalId,
//         createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) }, // السنة الحالية
//       },
//       _sum: { totalAmount: true },
//     });

//     // نحتاج أسماء الكاتيجوري، لذا سنجلب الخدمات
//     const serviceItems = await this.prisma.serviceItem.findMany({
//       where: { hospitalId },
//       include: { category: true },
//     });

//     const catMap = new Map<string, number>();

//     revenueByCat.forEach((item) => {
//       const service = serviceItems.find((s) => s.id === item.serviceItemId);
//       const catName = service?.category?.name || 'غير مصنف';
//       const amount = Number(item._sum.totalAmount || 0);

//       catMap.set(catName, (catMap.get(catName) || 0) + amount);
//     });

//     const pieData = Array.from(catMap.entries()).map(([name, value]) => ({
//       name,
//       value,
//     }));

//     return { revenueByService: pieData };
//   }

//   // 3. الأفضل أداءً
//   async getTopPerforming(hospitalId: number) {
//     // الأطباء الأكثر دخلاً للمستشفى
//     const topDoctors = await this.prisma.encounter.groupBy({
//       by: ['doctorId'],
//       where: { hospitalId, doctorId: { not: null } },
//       _count: { id: true },
//       orderBy: { _count: { id: 'desc' } },
//       take: 5,
//     });

//     // نحتاج الأسماء
//     const doctorIds = topDoctors.map((d) => d.doctorId!).filter(Boolean);
//     const users = await this.prisma.user.findMany({
//       where: { id: { in: doctorIds } },
//       select: { id: true, fullName: true },
//     });

//     const doctorsData = topDoctors.map((d) => ({
//       name: users.find((u) => u.id === d.doctorId)?.fullName || 'Unknown',
//       patientsCount: d._count.id,
//     }));

//     return { topDoctors: doctorsData };
//   }
// }
