import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getExecutiveStats(hospitalId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. الإيرادات اليومية (Daily Revenue)
    // نفترض وجود موديل Invoice (أو نستخدم Encounter مؤقتاً إذا لم تكن الفواتير مفعلة بالكامل)
    // سنستخدم جدول Invoice إذا كان موجوداً، أو نحسب وعوداً
    // بناءً على المراجعة السابقة، رأينا PurchaseInvoice، هل هناك SalesInvoice؟
    // دعنا نتحقق من schema.prisma لاحقاً، سنفترض وجود Prescription/Encounter مدفوعات
    // سأستخدم استعلام آمن يعتمد على Encounter مبدئياً حتى نتأكد من الفواتير
    
    // سنبحث عن الانكاونترز اليوم
    const dailyVisits = await this.prisma.encounter.count({
      where: {
        hospitalId,
        createdAt: { gte: today },
      },
    });

    // 2. المرضى المنومين حالياً (Active Inpatients)
    const activeInpatients = await this.prisma.encounter.count({
      where: {
        hospitalId,
        status: 'OPEN', // ✅ Active Encounters
        type: 'IPD',    // ✅ Inpatients only
      },
    });

    // 3. قيمة المخزون (Inventory Value)
    // تجميع قيمة كل الأرصدة: الكمية * سعر التكلفة
    const allStock = await this.prisma.productStock.findMany({
      where: { hospitalId },
      include: {
        product: { select: { costPrice: true } },
      },
    });

    const inventoryValue = allStock.reduce((sum, item) => {
      const qty = Number(item.quantity);
      const cost = Number(item.product.costPrice);
      return sum + qty * cost;
    }, 0);

    // 4. الإيرادات اليومية الفعلية (Actual Daily Revenue from Billing)
    const invoicesToday = await this.prisma.invoice.aggregate({
        _sum: { totalAmount: true },
        where: {
            hospitalId,
            createdAt: { gte: today },
            status: { in: ['ISSUED', 'PAID'] },
            type: { not: 'CREDIT_NOTE' }
        }
    });

    const creditNotesToday = await this.prisma.invoice.aggregate({
        _sum: { totalAmount: true },
        where: {
            hospitalId,
            createdAt: { gte: today },
            status: 'PAID',
            type: 'CREDIT_NOTE'
        }
    });
    
    // Revenue is Gross Billed amount minus Credit Notes
    const grossRevenue = Number(invoicesToday._sum.totalAmount || 0);
    const returnsValue = Number(creditNotesToday._sum.totalAmount || 0);
    const actualRevenue = grossRevenue - returnsValue;

    return {
      dailyVisits,
      activeInpatients,
      inventoryValue: Math.round(inventoryValue),
      dailyRevenue: Math.round(actualRevenue),
      lastUpdated: new Date(),
    };
  }

  // -----------------------------------------------------------------------
  // 🟢 Clinical Variance Tracking & Analytics - HIMSS Stage 6/7 Target
  // -----------------------------------------------------------------------
  async getClinicalVarianceReport(hospitalId: number, startDate: Date, endDate: Date) {
    // 1. CDSS Overrides (أطباء يتجاوزون تنبيهات النظام)
    const cdssOverrides = await this.prisma.cDSSAlert.findMany({
      where: {
        hospitalId,
        status: 'OVERRIDDEN',
        acknowledgedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        acknowledgedBy: { select: { fullName: true, department: { select: { name: true } } } },
      },
    });

    const cpoeMetrics = {
      totalOverrides: cdssOverrides.length,
      bySeverity: {
        CRITICAL: cdssOverrides.filter((a) => a.severity === 'CRITICAL').length,
        HIGH: cdssOverrides.filter((a) => a.severity === 'HIGH').length,
        MODERATE: cdssOverrides.filter((a) => a.severity === 'MODERATE').length,
      },
      byDepartment: cdssOverrides.reduce((acc, alert) => {
        const dept = alert.acknowledgedBy?.department?.name || 'Unknown';
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recentExamples: cdssOverrides.slice(0, 5).map((a) => ({
        alertType: a.alertType,
        doctor: a.acknowledgedBy?.fullName,
        reason: a.overrideReason,
        date: a.acknowledgedAt,
      })),
    };

    // 2. CLMA Overrides (تمريض يتجاوزون باركود المرضى أو الأدوية)
    const clmaOverrides = await this.prisma.medicationAdministration.findMany({
      where: {
        hospitalId,
        isEmergencyOverride: true,
        administeredAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        performer: { select: { fullName: true, department: { select: { name: true } } } },
        prescriptionItem: { include: { product: { select: { name: true } } } },
      },
    });

    const nursingMetrics = {
      totalOverrides: clmaOverrides.length,
      byDoctorOrNurse: clmaOverrides.reduce((acc, admin) => {
        const name = admin.performer?.fullName || 'Unknown';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recentExamples: clmaOverrides.slice(0, 5).map((a) => ({
        nurse: a.performer?.fullName,
        drug: a.prescriptionItem?.product?.name,
        reason: a.varianceReason,
        date: a.administeredAt,
      })),
    };

    // 3. Clinical Pathway Non-Compliance (مهام سريرية تم تخطيها)
    const skippedTasks = await this.prisma.careTask.findMany({
      where: {
        enrollment: { pathway: { hospitalId } },
        status: 'SKIPPED',
        completedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        completedBy: { select: { fullName: true } },
        step: { select: { title: true } },
      },
    });

    const pathwayMetrics = {
      totalSkippedTasks: skippedTasks.length,
      recentExamples: skippedTasks.slice(0, 5).map((t) => ({
        task: t.step?.title,
        skippedBy: t.completedBy?.fullName,
        reason: t.notes,
        date: t.completedAt,
      })),
    };

    return {
      period: { startDate, endDate },
      cpoeAlertFatigue: cpoeMetrics,
      clmaComplianceRisks: nursingMetrics,
      pathwayDeviations: pathwayMetrics,
      generationDate: new Date(),
    };
  }
}
