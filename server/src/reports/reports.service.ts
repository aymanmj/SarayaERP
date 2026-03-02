// src/reports/reports.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionService } from '../commission/commission.service';
import { InvoiceStatus, ServiceType } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private commissionService: CommissionService,
  ) {}

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

  /**
   * 📊 تقرير أداء الأطباء التفصيلي
   * يجمع 6 مقاييس لكل طبيب: الحالات، الإيواء، العمليات، الإيرادات، متوسط الاستشارة، الإحالات
   */
  async getDoctorPerformance(hospitalId: number, dateFrom?: Date, dateTo?: Date) {
    // Fix: ensure dateTo includes full end-of-day
    if (dateTo) {
      dateTo.setHours(23, 59, 59, 999);
    }
    const dateFilter = {
      ...(dateFrom && { gte: dateFrom }),
      ...(dateTo && { lte: dateTo }),
    };
    const hasDateFilter = dateFrom || dateTo;

    // 1. Get all doctors who have encounters
    const doctorEncounters = await this.prisma.encounter.groupBy({
      by: ['doctorId'],
      where: {
        hospitalId,
        doctorId: { not: null },
        ...(hasDateFilter && { admissionDate: dateFilter }),
      },
      _count: { id: true },
    });

    const doctorIds = doctorEncounters.map((d) => d.doctorId!).filter(Boolean);
    if (doctorIds.length === 0) {
      return { doctors: [], summary: { totalEncounters: 0, totalRevenue: 0, totalSurgeries: 0, activeDoctors: 0 } };
    }

    // 2. Fetch doctor info (including commissionRate)
    const users = await this.prisma.user.findMany({
      where: { id: { in: doctorIds } },
      select: { id: true, fullName: true, commissionRate: true, specialty: { select: { name: true } } },
    });

    // 3. Admissions per doctor (via encounter)
    const admissions = await this.prisma.admission.groupBy({
      by: ['admittingDoctorId'],
      where: {
        hospitalId,
        admittingDoctorId: { in: doctorIds },
        ...(hasDateFilter && { actualAdmissionDate: dateFilter }),
      },
      _count: { id: true },
    });

    // 4. Surgery count per doctor (from surgery team)
    const surgeryTeamRecords = await this.prisma.surgeryTeam.findMany({
      where: {
        userId: { in: doctorIds },
        role: 'SURGEON',
        surgeryCase: {
          hospitalId,
          ...(hasDateFilter && { scheduledStart: dateFilter }),
        },
      },
      select: { userId: true, surgeryCaseId: true },
    });
    const surgeryCountMap = new Map<number, number>();
    surgeryTeamRecords.forEach((t) => {
      surgeryCountMap.set(t.userId, (surgeryCountMap.get(t.userId) || 0) + 1);
    });

    // 5. Revenue per doctor — using performerId directly (same as payroll)
    const revenueByDoctor = await this.prisma.encounterCharge.groupBy({
      by: ['performerId'],
      where: {
        hospitalId,
        performerId: { in: doctorIds },
        ...(hasDateFilter && { createdAt: dateFilter }),
      },
      _sum: { totalAmount: true },
    });
    const revenueMap = new Map<number, number>();
    revenueByDoctor.forEach((r) => {
      if (r.performerId) {
        revenueMap.set(r.performerId, Number(r._sum.totalAmount || 0));
      }
    });

    // 6. Avg consultation duration (encounters with both admission and discharge dates)
    const closedEncounters = await this.prisma.encounter.findMany({
      where: {
        hospitalId,
        doctorId: { in: doctorIds },
        dischargeDate: { not: null },
        ...(hasDateFilter && { admissionDate: dateFilter }),
      },
      select: { doctorId: true, admissionDate: true, dischargeDate: true },
    });
    const durationMap = new Map<number, number[]>();
    closedEncounters.forEach((e) => {
      if (!e.doctorId || !e.dischargeDate) return;
      const mins = Math.round((e.dischargeDate!.getTime() - (e.admissionDate?.getTime() ?? 0)) / 60000);
      if (mins > 0 && mins < 1440) { // فقط أقل من يوم (لاستبعاد حالات الإيواء)
        const list = durationMap.get(e.doctorId) || [];
        list.push(mins);
        durationMap.set(e.doctorId, list);
      }
    });

    // 7. Get commission rates from CommissionRule system for each doctor
    const commissionRateMap = new Map<number, number>();
    await Promise.all(
      doctorIds.map(async (docId) => {
        // getDoctorRate returns: doctor-specific rule → default rule → 0
        const rate = await this.commissionService.getDoctorRate(hospitalId, docId, ServiceType.CONSULTATION);
        commissionRateMap.set(docId, rate);
      }),
    );

    // Build results
    let totalRevenue = 0;
    let totalSurgeries = 0;
    let totalEncounters = 0;

    const doctors = doctorIds.map((docId) => {
      const user = users.find((u) => u.id === docId);
      const encounters = doctorEncounters.find((d) => d.doctorId === docId)?._count?.id || 0;
      const admissionCount = admissions.find((a) => a.admittingDoctorId === docId)?._count?.id || 0;
      const surgeryCount = surgeryCountMap.get(docId) || 0;
      const revenue = revenueMap.get(docId) || 0;

      // Commission rate: CommissionRule system first, then User.commissionRate as fallback
      const ruleRate = commissionRateMap.get(docId) || 0;
      const userRate = Number(user?.commissionRate || 0);
      // ruleRate is already 0-100 (percentage), userRate is 0-1 (fraction)
      const commissionPct = ruleRate > 0 ? ruleRate : (userRate * 100);
      const doctorCommission = commissionPct > 0 ? Math.round(revenue * commissionPct) / 100 : 0;

      // Avg consultation
      const durations = durationMap.get(docId) || [];
      const avgConsultationMins = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

      totalRevenue += revenue;
      totalSurgeries += surgeryCount;
      totalEncounters += encounters;

      return {
        id: docId,
        fullName: user?.fullName || 'غير معروف',
        specialty: (user?.specialty as any)?.name || '—',
        totalEncounters: encounters,
        totalAdmissions: admissionCount,
        totalSurgeries: surgeryCount,
        totalRevenue: Math.round(revenue * 100) / 100,
        commissionRate: Math.round(commissionPct * 100) / 100,
        doctorCommission: Math.round(doctorCommission * 100) / 100,
        avgConsultationMins,
      };
    });

    // Sort by encounters desc
    doctors.sort((a, b) => b.totalEncounters - a.totalEncounters);

    return {
      doctors,
      summary: {
        totalEncounters,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalSurgeries,
        activeDoctors: doctors.length,
      },
    };
  }

  /**
   * تقرير الإيرادات حسب القسم/التخصص
   */
  async getRevenueByDepartment(hospitalId: number, dateFrom?: Date, dateTo?: Date) {
    if (dateTo) {
      dateTo.setHours(23, 59, 59, 999);
    }

    const dateFilter = {
      ...(dateFrom && { gte: dateFrom }),
      ...(dateTo && { lte: dateTo }),
    };
    const hasDateFilter = dateFrom || dateTo;

    // 1. Revenue by ServiceType
    const byServiceType = await this.prisma.encounterCharge.groupBy({
      by: ['serviceItemId'],
      where: {
        hospitalId,
        ...(hasDateFilter && { createdAt: dateFilter }),
      },
      _sum: { totalAmount: true },
      _count: { _all: true },
    });

    // Get service items to map their types
    const serviceItemIds = byServiceType.map((r) => r.serviceItemId);
    const serviceItems = await this.prisma.serviceItem.findMany({
      where: { id: { in: serviceItemIds } },
      select: { id: true, type: true, name: true },
    });
    const serviceItemMap = new Map(serviceItems.map((s) => [s.id, s]));

    // Aggregate by service type
    const typeAgg = new Map<string, { revenue: number; count: number }>();
    for (const row of byServiceType) {
      const si = serviceItemMap.get(row.serviceItemId);
      const type = si?.type || 'OTHER';
      const existing = typeAgg.get(type) || { revenue: 0, count: 0 };
      existing.revenue += Number(row._sum.totalAmount || 0);
      existing.count += row._count._all;
      typeAgg.set(type, existing);
    }

    const typeLabels: Record<string, string> = {
      CONSULTATION: 'الاستشارات',
      LAB: 'المختبر',
      RADIOLOGY: 'الأشعة',
      PROCEDURE: 'الإجراءات',
      BED: 'التنويم',
      PHARMACY: 'الصيدلية',
      OTHER: 'أخرى',
    };

    const byType = Array.from(typeAgg.entries())
      .map(([type, data]) => ({
        type,
        label: typeLabels[type] || type,
        revenue: Math.round(data.revenue * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // 2. Revenue by Specialty (from performer's specialty)
    const chargesWithPerformer = await this.prisma.encounterCharge.findMany({
      where: {
        hospitalId,
        performerId: { not: null },
        ...(hasDateFilter && { createdAt: dateFilter }),
      },
      select: {
        totalAmount: true,
        performer: {
          select: {
            specialty: { select: { name: true } },
          },
        },
      },
    });

    const specialtyAgg = new Map<string, { revenue: number; count: number }>();
    for (const charge of chargesWithPerformer) {
      const specialtyName = (charge.performer as any)?.specialty?.name || 'غير محدد';
      const existing = specialtyAgg.get(specialtyName) || { revenue: 0, count: 0 };
      existing.revenue += Number(charge.totalAmount || 0);
      existing.count += 1;
      specialtyAgg.set(specialtyName, existing);
    }

    const bySpecialty = Array.from(specialtyAgg.entries())
      .map(([specialty, data]) => ({
        specialty,
        revenue: Math.round(data.revenue * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // 3. Total
    const totalRevenue = byType.reduce((s, r) => s + r.revenue, 0);
    const totalCount = byType.reduce((s, r) => s + r.count, 0);

    return {
      byServiceType: byType,
      bySpecialty,
      total: {
        revenue: Math.round(totalRevenue * 100) / 100,
        count: totalCount,
      },
    };
  }
}
