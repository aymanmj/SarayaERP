import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantService } from './tenant.service';

/**
 * خدمة التقارير الموحدة عبر الفروع
 * تتيح للإدارة العليا في الشبكة رؤية تقارير مجمعة من كل المستشفيات
 */
@Injectable()
export class ConsolidatedReportingService {
  private readonly logger = new Logger(ConsolidatedReportingService.name);

  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
  ) {}

  /**
   * ملخص الإيرادات الموحد لكل المستشفيات في المؤسسة
   */
  async getConsolidatedRevenue(
    organizationId: number,
    fromDate: Date,
    toDate: Date,
  ) {
    const hospitalIds =
      await this.tenantService.getOrganizationHospitalIds(organizationId);

    if (hospitalIds.length === 0) return { hospitals: [], total: 0 };

    const results = await this.prisma.invoice.groupBy({
      by: ['hospitalId'],
      where: {
        hospitalId: { in: hospitalIds },
        createdAt: { gte: fromDate, lte: toDate },
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
      },
      _sum: {
        totalAmount: true,
        paidAmount: true,
        insuranceShare: true,
        patientShare: true,
      },
      _count: true,
    });

    // جلب أسماء المستشفيات
    const hospitals = await this.prisma.hospital.findMany({
      where: { id: { in: hospitalIds } },
      select: { id: true, name: true, code: true },
    });

    const hospitalMap = new Map(hospitals.map((h) => [h.id, h]));

    const enriched = results.map((r) => ({
      hospital: hospitalMap.get(r.hospitalId),
      invoiceCount: r._count,
      totalRevenue: Number(r._sum.totalAmount || 0),
      paidAmount: Number(r._sum.paidAmount || 0),
      insuranceShare: Number(r._sum.insuranceShare || 0),
      patientShare: Number(r._sum.patientShare || 0),
    }));

    const grandTotal = enriched.reduce((sum, r) => sum + r.totalRevenue, 0);

    return {
      organizationId,
      period: { from: fromDate, to: toDate },
      hospitals: enriched,
      grandTotal,
      totalInvoices: enriched.reduce((sum, r) => sum + r.invoiceCount, 0),
    };
  }

  /**
   * إحصائيات المرضى الموحدة عبر الشبكة
   */
  async getConsolidatedPatientStats(organizationId: number) {
    const hospitalIds =
      await this.tenantService.getOrganizationHospitalIds(organizationId);

    if (hospitalIds.length === 0) return { hospitals: [], total: 0 };

    const results = await this.prisma.patient.groupBy({
      by: ['hospitalId'],
      where: {
        hospitalId: { in: hospitalIds },
        isDeleted: false,
      },
      _count: true,
    });

    const hospitals = await this.prisma.hospital.findMany({
      where: { id: { in: hospitalIds } },
      select: { id: true, name: true, code: true },
    });

    const hospitalMap = new Map(hospitals.map((h) => [h.id, h]));

    return {
      organizationId,
      hospitals: results.map((r) => ({
        hospital: hospitalMap.get(r.hospitalId),
        patientCount: r._count,
      })),
      totalPatients: results.reduce((sum, r) => sum + r._count, 0),
    };
  }

  /**
   * مقارنة أداء الفروع (الزيارات والإيرادات)
   */
  async getBranchComparison(
    organizationId: number,
    fromDate: Date,
    toDate: Date,
  ) {
    const hospitalIds =
      await this.tenantService.getOrganizationHospitalIds(organizationId);

    if (hospitalIds.length === 0) return [];

    // عدد الزيارات لكل فرع
    const encounters = await this.prisma.encounter.groupBy({
      by: ['hospitalId'],
      where: {
        hospitalId: { in: hospitalIds },
        createdAt: { gte: fromDate, lte: toDate },
        isDeleted: false,
      },
      _count: true,
    });

    // الإيرادات لكل فرع
    const revenue = await this.prisma.invoice.groupBy({
      by: ['hospitalId'],
      where: {
        hospitalId: { in: hospitalIds },
        createdAt: { gte: fromDate, lte: toDate },
      },
      _sum: { totalAmount: true, paidAmount: true },
    });

    const hospitals = await this.prisma.hospital.findMany({
      where: { id: { in: hospitalIds } },
      select: { id: true, name: true, code: true },
    });

    const encounterMap = new Map(encounters.map((e) => [e.hospitalId, e._count]));
    const revenueMap = new Map(
      revenue.map((r) => [
        r.hospitalId,
        { total: Number(r._sum.totalAmount || 0), paid: Number(r._sum.paidAmount || 0) },
      ]),
    );

    return hospitals.map((h) => ({
      hospital: h,
      encounters: encounterMap.get(h.id) || 0,
      revenue: revenueMap.get(h.id) || { total: 0, paid: 0 },
    }));
  }
}
