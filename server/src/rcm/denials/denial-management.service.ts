import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaimStatus } from '@prisma/client';

/**
 * خدمة إدارة المطالبات المرفوضة والاستئناف
 * 
 * تتبع وتحلل أسباب رفض المطالبات وتدير عملية الاستئناف
 */
@Injectable()
export class DenialManagementService {
  private readonly logger = new Logger(DenialManagementService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * تحليل أسباب الرفض — لتحسين معدل القبول مستقبلاً
   */
  async getDenialAnalytics(hospitalId: number, fromDate?: Date, toDate?: Date) {
    const where: any = {
      hospitalId,
      status: { in: [ClaimStatus.REJECTED, ClaimStatus.APPEALED, ClaimStatus.APPEAL_DENIED] },
    };

    if (fromDate || toDate) {
      where.updatedAt = {};
      if (fromDate) where.updatedAt.gte = fromDate;
      if (toDate) where.updatedAt.lte = toDate;
    }

    // تحليل حسب كود الرفض
    const byDenialCode = await this.prisma.claim.groupBy({
      by: ['denialCode'],
      where,
      _count: true,
      _sum: { claimedAmount: true },
      orderBy: { _count: { denialCode: 'desc' } },
    });

    // إجمالي المرفوضات
    const totals = await this.prisma.claim.aggregate({
      where,
      _count: true,
      _sum: { claimedAmount: true },
    });

    // معدل الاستئناف الناجح
    const appealStats = await this.prisma.claim.groupBy({
      by: ['status'],
      where: {
        hospitalId,
        status: { in: [ClaimStatus.APPEALED, ClaimStatus.APPEAL_ACCEPTED, ClaimStatus.APPEAL_DENIED] },
      },
      _count: true,
    });

    return {
      totalDenials: totals._count,
      totalDeniedAmount: Number(totals._sum.claimedAmount || 0),
      byDenialCode: byDenialCode.map((d) => ({
        code: d.denialCode || 'UNKNOWN',
        count: d._count,
        amount: Number(d._sum.claimedAmount || 0),
      })),
      appealStats: appealStats.map((a) => ({
        status: a.status,
        count: a._count,
      })),
    };
  }

  /**
   * قائمة المطالبات التي تقترب مواعيد استئنافها
   */
  async getUpcomingAppealDeadlines(hospitalId: number, daysAhead: number = 7) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + daysAhead);

    return this.prisma.claim.findMany({
      where: {
        hospitalId,
        status: ClaimStatus.REJECTED,
        appealDeadline: {
          lte: deadline,
          gte: new Date(),
        },
      },
      include: {
        invoice: { include: { patient: true, insuranceProvider: true } },
      },
      orderBy: { appealDeadline: 'asc' },
    });
  }

  /**
   * المطالبات التي فات موعد استئنافها
   */
  async getExpiredAppeals(hospitalId: number) {
    return this.prisma.claim.findMany({
      where: {
        hospitalId,
        status: ClaimStatus.REJECTED,
        appealDeadline: { lt: new Date() },
      },
      include: {
        invoice: { include: { patient: true } },
      },
      orderBy: { appealDeadline: 'desc' },
    });
  }

  /**
   * تقرير الأداء: نسبة القبول من أول مرة (First Pass Rate)
   */
  async getFirstPassRate(hospitalId: number, fromDate?: Date, toDate?: Date) {
    const where: any = { hospitalId };
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    const total = await this.prisma.claim.count({
      where: { ...where, status: { not: ClaimStatus.DRAFT } },
    });

    const accepted = await this.prisma.claim.count({
      where: {
        ...where,
        status: { in: [ClaimStatus.ACCEPTED, ClaimStatus.PAID, ClaimStatus.PARTIALLY_PAID] },
      },
    });

    const rejected = await this.prisma.claim.count({
      where: {
        ...where,
        status: { in: [ClaimStatus.REJECTED, ClaimStatus.APPEAL_DENIED] },
      },
    });

    return {
      total,
      accepted,
      rejected,
      firstPassRate: total > 0 ? ((accepted / total) * 100).toFixed(1) : '0',
      rejectionRate: total > 0 ? ((rejected / total) * 100).toFixed(1) : '0',
    };
  }
}
