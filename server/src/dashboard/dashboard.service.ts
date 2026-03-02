// src/dashboard/dashboard.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BedStatus, EncounterStatus, EncounterType, AdmissionStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // ✅ نستقبل الآن الـ User بالكامل لتحديد الصلاحيات
  async getStats(hospitalId: number, userId: number, roles: string[], period: string = 'today') {
    // ✅ تعويض فرق التوقيت — السيرفر UTC والبيانات بتوقيت ليبيا UTC+2
    const LIBYA_OFFSET_MS = 2 * 60 * 60 * 1000; // +2 ساعة
    const nowUTC = new Date();
    const nowLibya = new Date(nowUTC.getTime() + LIBYA_OFFSET_MS);

    // بداية ونهاية "اليوم" بتوقيت ليبيا (ثم نعيده لـ UTC للاستعلام)
    const todayStart = new Date(Date.UTC(nowLibya.getUTCFullYear(), nowLibya.getUTCMonth(), nowLibya.getUTCDate()) - LIBYA_OFFSET_MS);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    // ✅ حساب بداية ونهاية الفترة المحددة
    let periodStart: Date;
    const periodEnd = todayEnd; // دائماً حتى نهاية اليوم

    if (period === 'week') {
      const dayOfWeek = nowLibya.getUTCDay();
      periodStart = new Date(todayStart.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      periodStart = new Date(Date.UTC(nowLibya.getUTCFullYear(), nowLibya.getUTCMonth(), 1) - LIBYA_OFFSET_MS);
    } else {
      periodStart = todayStart;
    }

    // تحديد بداية ونهاية الشهر الماضي
    const lastMonthStart = new Date(Date.UTC(nowLibya.getUTCFullYear(), nowLibya.getUTCMonth() - 1, 1) - LIBYA_OFFSET_MS);
    const lastMonthEnd = new Date(Date.UTC(nowLibya.getUTCFullYear(), nowLibya.getUTCMonth(), 1) - LIBYA_OFFSET_MS - 1);

    // تحديد بداية الأسبوع
    const dayOfWeek = nowLibya.getUTCDay();
    const weekStart = new Date(todayStart.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);

    // 1. الإحصائيات العامة
    const [
      activeInpatients,
      occupiedBeds,
      totalBeds,
      appointmentsToday,
      completedAppointments,
      pendingAdmissions,
      emergencyCases,
      lowStockCount,
      inventoryValue,
    ] = await Promise.all([
      // المنومين حالياً
      this.prisma.encounter.count({
        where: {
          hospitalId,
          type: EncounterType.IPD,
          status: EncounterStatus.OPEN,
        },
      }),
      // الأسرة المشغولة
      this.prisma.bed.count({
        where: { hospitalId, status: BedStatus.OCCUPIED },
      }),
      // إجمالي الأسرة
      this.prisma.bed.count({ where: { hospitalId, isActive: true } }),
      // مواعيد الفترة
      this.prisma.appointment.count({
        where: {
          hospitalId,
          scheduledStart: { gte: periodStart, lte: periodEnd },
        },
      }),
      // المواعيد المكتملة
      this.prisma.appointment.count({
        where: {
          hospitalId,
          scheduledStart: { gte: periodStart, lte: periodEnd },
          status: 'COMPLETED',
        },
      }),
      // الإدخالات في الانتظار
      this.prisma.admission.count({
        where: {
          hospitalId,
          admissionStatus: AdmissionStatus.SCHEDULED,
        },
      }),
      // حالات الطوارئ
      this.prisma.appointment.count({
        where: {
          hospitalId,
          scheduledStart: { gte: periodStart, lte: periodEnd },
          isEmergency: true,
        },
      }),
      // نواقص المخزون
      this.prisma.product.count({
        where: {
          hospitalId,
          isActive: true,
          stockOnHand: { lte: this.prisma.product.fields.minStock },
        },
      }),
      // قيمة المخزون
      this.prisma.product.aggregate({
        where: {
          hospitalId,
          isActive: true,
        },
        _sum: { 
          costPrice: true,
          stockOnHand: true,
        },
      }),
    ]);

    // 2. ✅ حساب الإيرادات
    let revenueQuery: any = {
      hospitalId,
      paidAt: { gte: periodStart, lte: periodEnd },
    };

    // فلترة حسب الصلاحيات
    const isAdmin =
      roles.includes('ADMIN') ||
      roles.includes('CEO') ||
      roles.includes('ACCOUNTANT') ||
      roles.includes('FINANCE');
    const isCashier = roles.includes('CASHIER');
    const hasRevenueAccess = isAdmin || isCashier;

    let todayRevenue = 0;
    let lastMonthRevenue = 0;

    if (hasRevenueAccess) {
      if (isCashier && !isAdmin) {
        revenueQuery.cashierId = userId;
      }

      const [revenueAgg, lastMonthRevenueAgg] = await Promise.all([
        // إيرادات اليوم
        this.prisma.payment.aggregate({
          where: revenueQuery,
          _sum: { amount: true },
        }),
        // إيرادات الشهر الماضي
        this.prisma.payment.aggregate({
          where: {
            hospitalId,
            paidAt: { gte: lastMonthStart, lte: lastMonthEnd },
            ...(isCashier && !isAdmin ? { cashierId: userId } : {}),
          },
          _sum: { amount: true },
        }),
      ]);

      todayRevenue = Number(revenueAgg._sum.amount ?? 0);
      lastMonthRevenue = Number(lastMonthRevenueAgg._sum.amount ?? 0);
    }

    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // حساب قيمة المخزون (الكمية × التكلفة)
    const inventoryValueCalc = Number(inventoryValue._sum.costPrice || 0) * Number(inventoryValue._sum.stockOnHand || 0);

    // 3. بيانات الأسبوعي للمخططات
    const weeklyTrend = await this.getWeeklyTrend(hospitalId, weekStart);

    // 4. توزيع الإيرادات حسب القسم (إخفاء التفاصيل المالية إذا لم يكن لديه صلاحية)
    const departmentDistribution = hasRevenueAccess 
      ? await this.getDepartmentDistribution(hospitalId, periodStart, periodEnd)
      : [];

    // 5. حالة الأسرة
    const bedStatus = await this.getBedStatus(hospitalId);

    // 6. النشاط الساعي
    const hourlyActivity = await this.getHourlyActivity(hospitalId, periodStart, periodEnd);

    // 7. ✅ [NEW] متوسط مدة الإقامة (Average Length of Stay)
    const dischargedAdmissions = await this.prisma.admission.findMany({
      where: {
        hospitalId,
        dischargeDate: { gte: new Date('2000-01-01') },
        actualAdmissionDate: { gte: new Date('2000-01-01') },
      },
      select: { actualAdmissionDate: true, dischargeDate: true },
      orderBy: { dischargeDate: 'desc' },
      take: 100,
    });

    let avgLengthOfStay = 0;
    if (dischargedAdmissions.length > 0) {
      const totalDays = dischargedAdmissions.reduce((sum, adm) => {
        const admDate = adm.actualAdmissionDate!.getTime();
        const disDate = adm.dischargeDate!.getTime();
        return sum + (disDate - admDate) / (1000 * 60 * 60 * 24);
      }, 0);
      avgLengthOfStay = Math.round((totalDays / dischargedAdmissions.length) * 10) / 10;
    }

    // 8. ✅ [NEW] أعلى 5 تشخيصات (Top 5 Diagnoses)
    const monthStart = new Date(Date.UTC(nowLibya.getUTCFullYear(), nowLibya.getUTCMonth(), 1) - LIBYA_OFFSET_MS);
    const topDiagnoses = await this.prisma.encounterDiagnosis.groupBy({
      by: ['diagnosisCodeId'],
      where: {
        encounter: { hospitalId },
        createdAt: { gte: monthStart },
      },
      _count: { _all: true },
      orderBy: { _count: { diagnosisCodeId: 'desc' } },
      take: 5,
    });

    const diagCodeIds = topDiagnoses.map((d) => d.diagnosisCodeId);
    const diagCodes = await this.prisma.diagnosisCode.findMany({
      where: { id: { in: diagCodeIds } },
      select: { id: true, code: true, nameAr: true, nameEn: true },
    });
    const diagMap = new Map(diagCodes.map((d) => [d.id, d]));

    const top5Diagnoses = topDiagnoses.map((d) => {
      const code = diagMap.get(d.diagnosisCodeId);
      return {
        code: code?.code || '—',
        name: code?.nameAr || code?.nameEn || '—',
        count: d._count._all,
      };
    });

    // 9. ✅ [NEW] معدل نمو الإيرادات الشهري
    const currentMonthRevenue = hasRevenueAccess
      ? Number(
          (
            await this.prisma.payment.aggregate({
              where: {
                hospitalId,
                paidAt: { gte: monthStart, lte: todayEnd },
                ...(isCashier && !isAdmin ? { cashierId: userId } : {}),
              },
              _sum: { amount: true },
            })
          )._sum.amount ?? 0,
        )
      : 0;

    const revenueGrowthRate =
      lastMonthRevenue > 0
        ? Math.round(((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 * 10) / 10
        : 0;

    return {
      // الإحصائيات الأساسية
      dailyRevenue: todayRevenue,
      dailyVisits: appointmentsToday,
      inventoryValue: inventoryValueCalc,
      activeInpatients,
      occupiedBeds,
      totalBeds,
      occupancyRate,
      completedAppointments,
      pendingAdmissions,
      emergencyCases,
      monthlyRevenue: todayRevenue, // يمكن حسابه بشكل مختلف
      lastMonthRevenue,
      lowStockCount,

      // بيانات المخططات
      weeklyTrend,
      departmentDistribution,
      bedStatus,
      hourlyActivity,

      // ✅ [NEW] مؤشرات أداء محسنة
      avgLengthOfStay,
      top5Diagnoses,
      revenueGrowthRate,
      currentMonthRevenue,

      // معلومات إضافية
      isPersonalRevenue: !isAdmin && isCashier,
      hasRevenueAccess,
      lastUpdated: new Date().toISOString(),
    };
  }

  // دالة للحصول على بيانات الأسبوعي
  private async getWeeklyTrend(hospitalId: number, weekStart: Date) {
    const days: any[] = [];
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(weekStart);
      dayStart.setDate(weekStart.getDate() + i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const [revenue, visits, admissions] = await Promise.all([
        this.prisma.payment.aggregate({
          where: {
            hospitalId,
            paidAt: { gte: dayStart, lte: dayEnd },
          },
          _sum: { amount: true },
        }),
        this.prisma.appointment.count({
          where: {
            hospitalId,
            scheduledStart: { gte: dayStart, lte: dayEnd },
          },
        }),
        this.prisma.admission.count({
          where: {
            hospitalId,
            actualAdmissionDate: { gte: dayStart, lte: dayEnd },
          },
        }),
      ]);

      days.push({
        day: dayNames[i],
        revenue: Number(revenue._sum.amount ?? 0),
        visits,
        admissions,
      });
    }

    return days;
  }

  // دالة للحصول على توزيع الإيرادات حسب القسم
  private async getDepartmentDistribution(hospitalId: number, startDate: Date, endDate: Date) {
    // جلب الأقسام الحقيقية
    const departments = await this.prisma.department.findMany({
      where: {
        hospitalId,
        isDeleted: false,
        isActive: true,
      },
      include: {
        _count: { select: { users: true } },
      },
    });

    const colors = [
      '#818cf8', '#38bdf8', '#10b981', '#f59e0b', '#ef4444', 
      '#a855f7', '#06b6d4', '#84cc16', '#f97316', '#ec4899'
    ];

    // حساب الإيرادات لكل قسم من خلال encounters
    const departmentRevenues = await Promise.all(
      departments.map(async (dept) => {
        const revenue = await this.prisma.payment.aggregate({
          where: {
            hospitalId,
            paidAt: { gte: startDate, lte: endDate },
            invoice: {
              encounter: {
                departmentId: dept.id,
              },
            },
          },
          _sum: { amount: true },
        });

        const patientCount = await this.prisma.encounter.count({
          where: {
            hospitalId,
            departmentId: dept.id,
            createdAt: { gte: startDate, lte: endDate },
          },
        });

        return {
          name: dept.name,
          value: Number(revenue._sum.amount || 0),
          color: colors[departments.indexOf(dept) % colors.length],
          patients: patientCount,
        };
      })
    );

    // فلترة الأقسام التي لديها إيرادات
    return departmentRevenues.filter(dept => dept.value > 0);
  }

  // دالة للحصول على حالة الأسرة
  private async getBedStatus(hospitalId: number) {
    const bedStatuses = await this.prisma.bed.groupBy({
      by: ['status'],
      where: {
        hospitalId,
        isActive: true,
      },
      _count: {
        status: true,
      },
    });

    const statusNames = {
      AVAILABLE: 'متاح',
      OCCUPIED: 'مشغول',
      CLEANING: 'تنظيف',
      MAINTENANCE: 'صيانة',
      BLOCKED: 'محجوز',
    };

    const colors = {
      AVAILABLE: '#10b981',
      OCCUPIED: '#38bdf8',
      CLEANING: '#f59e0b',
      MAINTENANCE: '#ef4444',
      BLOCKED: '#818cf8',
    };

    return bedStatuses.map(status => ({
      status: statusNames[status.status] || status.status,
      count: status._count.status,
      color: colors[status.status] || '#6b7280',
    }));
  }

  // دالة للحصول على النشاط الساعي
  private async getHourlyActivity(hospitalId: number, startDate: Date, endDate: Date) {
    const hourlyData: any[] = [];
    
    for (let hour = 8; hour <= 17; hour++) {
      const hourStart = new Date(startDate);
      hourStart.setHours(hour, 0, 0, 0);

      const hourEnd = new Date(startDate);
      hourEnd.setHours(hour, 59, 59, 999);

      const [visits, appointments] = await Promise.all([
        this.prisma.appointment.count({
          where: {
            hospitalId,
            scheduledStart: { gte: hourStart, lte: hourEnd },
          },
        }),
        this.prisma.appointment.count({
          where: {
            hospitalId,
            scheduledStart: { gte: hourStart, lte: hourEnd },
            status: { in: ['CONFIRMED', 'CHECKED_IN'] },
          },
        }),
      ]);

      hourlyData.push({
        hour: `${hour}${hour >= 12 ? 'م' : 'ص'}`,
        visits,
        appointments,
      });
    }

    return hourlyData;
  }

  // دالة للحصول على الأنشطة الحديثة
  async getRecentActivities(hospitalId: number) {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [recentAdmissions, recentDischarges, recentAppointments, recentEmergencies] = await Promise.all([
      // الإدخالات الحديثة
      this.prisma.admission.findMany({
        where: {
          hospitalId,
          actualAdmissionDate: { gte: twentyFourHoursAgo },
        },
        include: {
          patient: { select: { fullName: true } },
        },
        orderBy: { actualAdmissionDate: 'desc' },
        take: 5,
      }),
      // الخروج الحديثة
      this.prisma.admission.findMany({
        where: {
          hospitalId,
          dischargeDate: { gte: twentyFourHoursAgo },
        },
        include: {
          patient: { select: { fullName: true } },
        },
        orderBy: { dischargeDate: 'desc' },
        take: 5,
      }),
      // المواعيد الحديثة
      this.prisma.appointment.findMany({
        where: {
          hospitalId,
          scheduledStart: { gte: twentyFourHoursAgo },
        },
        include: {
          patient: { select: { fullName: true } },
        },
        orderBy: { scheduledStart: 'desc' },
        take: 5,
      }),
      // حالات الطوارئ الحديثة
      this.prisma.appointment.findMany({
        where: {
          hospitalId,
          isEmergency: true,
          scheduledStart: { gte: twentyFourHoursAgo },
        },
        include: {
          patient: { select: { fullName: true } },
        },
        orderBy: { scheduledStart: 'desc' },
        take: 5,
      }),
    ]);

    const activities: any[] = [];

    // تحويل الإدخالات إلى أنشطة
    recentAdmissions.forEach((admission) => {
      activities.push({
        id: `admission-${admission.id}`,
        type: 'admission',
        patientName: admission.patient.fullName,
        description: `تم إدخال المريض (${admission.admissionType})`,
        timestamp: admission.actualAdmissionDate?.toISOString() || admission.createdAt.toISOString(),
        priority: admission.priority === 'CRITICAL' || admission.priority === 'URGENT' ? 'high' : 'medium',
      });
    });

    // تحويل الخروج إلى أنشطة
    recentDischarges.forEach((discharge) => {
      activities.push({
        id: `discharge-${discharge.id}`,
        type: 'discharge',
        patientName: discharge.patient.fullName,
        description: `تم خروج المريض (${discharge.dischargeDisposition})`,
        timestamp: discharge.dischargeDate?.toISOString() || discharge.updatedAt.toISOString(),
        priority: 'low',
      });
    });

    // تحويل المواعيد إلى أنشطة
    recentAppointments.forEach((appointment) => {
      activities.push({
        id: `appointment-${appointment.id}`,
        type: 'appointment',
        patientName: appointment.patient.fullName,
        description: `موعد ${appointment.status} (${appointment.reason})`,
        timestamp: appointment.scheduledStart.toISOString(),
        priority: appointment.isEmergency ? 'high' : 'medium',
      });
    });

    // تحويل حالات الطوارئ إلى أنشطة
    recentEmergencies.forEach((emergency) => {
      activities.push({
        id: `emergency-${emergency.id}`,
        type: 'emergency',
        patientName: emergency.patient.fullName,
        description: `حالة طوارئ - ${emergency.reason}`,
        timestamp: emergency.scheduledStart.toISOString(),
        priority: 'high',
      });
    });

    // ترتيب الأنشطة حسب الوقت
    return activities
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20); // أقصى 20 نشاط
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
