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
