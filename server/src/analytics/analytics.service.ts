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
        type: 'IPD', // ✅ Inpatients only
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
        type: { not: 'CREDIT_NOTE' },
      },
    });

    const creditNotesToday = await this.prisma.invoice.aggregate({
      _sum: { totalAmount: true },
      where: {
        hospitalId,
        createdAt: { gte: today },
        status: 'PAID',
        type: 'CREDIT_NOTE',
      },
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
  async getClinicalVarianceReport(
    hospitalId: number,
    startDate: Date,
    endDate: Date,
  ) {
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
        acknowledgedBy: {
          select: { fullName: true, department: { select: { name: true } } },
        },
      },
    });

    const cpoeMetrics = {
      totalOverrides: cdssOverrides.length,
      bySeverity: {
        CRITICAL: cdssOverrides.filter((a) => a.severity === 'CRITICAL').length,
        HIGH: cdssOverrides.filter((a) => a.severity === 'HIGH').length,
        MODERATE: cdssOverrides.filter((a) => a.severity === 'MODERATE').length,
      },
      byDepartment: cdssOverrides.reduce(
        (acc, alert) => {
          const dept = alert.acknowledgedBy?.department?.name || 'Unknown';
          acc[dept] = (acc[dept] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
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
        performer: {
          select: { fullName: true, department: { select: { name: true } } },
        },
        prescriptionItem: { include: { product: { select: { name: true } } } },
      },
    });

    const nursingMetrics = {
      totalOverrides: clmaOverrides.length,
      byDoctorOrNurse: clmaOverrides.reduce(
        (acc, admin) => {
          const name = admin.performer?.fullName || 'Unknown';
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
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

  // -----------------------------------------------------------------------
  // 🟢 Clinical Quality KPIs - HIMSS Stage 6/7 Target (Sprint 2B)
  // -----------------------------------------------------------------------
  async getClinicalKPIs(hospitalId: number, startDate: Date, endDate: Date) {
    // 1. Readmission Rate (30-day IPD readmissions)
    const ipdAdmissions = await this.prisma.encounter.findMany({
      where: {
        hospitalId,
        type: 'IPD',
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { patientId: true, createdAt: true },
    });

    let readmissionCount = 0;
    for (const adm of ipdAdmissions) {
      // Find previous IPD discharge within 30 days
      const thirtyDaysBefore = new Date(
        adm.createdAt.getTime() - 30 * 24 * 60 * 60 * 1000,
      );
      const previousDischarge = await this.prisma.encounter.findFirst({
        where: {
          patientId: adm.patientId,
          hospitalId,
          type: 'IPD',
          status: 'CLOSED',
          dischargeDate: { gte: thirtyDaysBefore, lt: adm.createdAt },
        },
      });
      if (previousDischarge) readmissionCount++;
    }
    const readmissionRate =
      ipdAdmissions.length > 0
        ? (readmissionCount / ipdAdmissions.length) * 100
        : 0;

    // 2. Average Length of Stay (ALOS)
    const dischargedEncounters = await this.prisma.encounter.findMany({
      where: {
        hospitalId,
        type: 'IPD',
        status: 'CLOSED',
        dischargeDate: { gte: startDate, lte: endDate },
      },
      select: { createdAt: true, dischargeDate: true },
    });

    let totalStayHours = 0;
    dischargedEncounters.forEach((enc) => {
      if (enc.dischargeDate && enc.createdAt) {
        totalStayHours +=
          (enc.dischargeDate.getTime() - enc.createdAt.getTime()) /
          (1000 * 60 * 60);
      }
    });
    const averageLOSDays =
      dischargedEncounters.length > 0
        ? totalStayHours / dischargedEncounters.length / 24
        : 0;

    // 3. Medication Error / Override Rate
    const totalMeds = await this.prisma.medicationAdministration.count({
      where: { hospitalId, administeredAt: { gte: startDate, lte: endDate } },
    });
    const overrideMeds = await this.prisma.medicationAdministration.count({
      where: {
        hospitalId,
        isEmergencyOverride: true,
        administeredAt: { gte: startDate, lte: endDate },
      },
    });
    const medicationOverrideRate =
      totalMeds > 0 ? (overrideMeds / totalMeds) * 100 : 0;

    // 4. Care Gap Closure Rate
    const totalGaps = await this.prisma.careGap.count({
      where: {
        patient: { hospitalId },
        createdAt: { lte: endDate },
        OR: [{ closedAt: null }, { closedAt: { gte: startDate } }],
      },
    });
    const closedGaps = await this.prisma.careGap.count({
      where: {
        patient: { hospitalId },
        status: 'CLOSED',
        closedAt: { gte: startDate, lte: endDate },
      },
    });
    const careGapClosureRate =
      totalGaps > 0 ? (closedGaps / totalGaps) * 100 : 0;

    // 5. CDSS Alert Fatigue (Override Rate)
    const totalAlerts = await this.prisma.cDSSAlert.count({
      where: { hospitalId, createdAt: { gte: startDate, lte: endDate } },
    });
    const overriddenAlerts = await this.prisma.cDSSAlert.count({
      where: {
        hospitalId,
        status: 'OVERRIDDEN',
        createdAt: { gte: startDate, lte: endDate },
      },
    });
    const cdssOverrideRate =
      totalAlerts > 0 ? (overriddenAlerts / totalAlerts) * 100 : 0;

    return {
      period: { startDate, endDate },
      readmissionRate: Number(readmissionRate.toFixed(2)),
      readmissionCount,
      totalIPDAdmissions: ipdAdmissions.length,
      averageLOSDays: Number(averageLOSDays.toFixed(2)),
      dischargedCount: dischargedEncounters.length,
      medicationOverrideRate: Number(medicationOverrideRate.toFixed(2)),
      careGapClosureRate: Number(careGapClosureRate.toFixed(2)),
      cdssOverrideRate: Number(cdssOverrideRate.toFixed(2)),
      generationDate: new Date(),
    };
  }
}
