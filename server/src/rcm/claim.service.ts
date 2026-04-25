import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimScrubberService } from './scrubber/claim-scrubber.service';
import { ClaimStatus } from '@prisma/client';

/**
 * خدمة إدارة المطالبات التأمينية
 * تغطي دورة حياة المطالبة كاملة: إنشاء → فحص → إرسال → متابعة → تحصيل
 */
@Injectable()
export class ClaimService {
  private readonly logger = new Logger(ClaimService.name);

  constructor(
    private prisma: PrismaService,
    private scrubber: ClaimScrubberService,
  ) {}

  /**
   * إنشاء مطالبة جديدة من فاتورة
   */
  async createClaim(hospitalId: number, invoiceId: number) {
    // التحقق من الفاتورة
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, hospitalId },
      include: {
        patient: true,
        insuranceProvider: true,
        encounter: true,
      },
    });

    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    if (!invoice.insuranceProviderId) {
      throw new BadRequestException('الفاتورة لا تحتوي على تأمين');
    }

    // التحقق من عدم وجود مطالبة مكررة
    const existing = await this.prisma.claim.findFirst({
      where: { invoiceId, status: { notIn: ['VOID'] } },
    });
    if (existing) {
      throw new BadRequestException(`يوجد مطالبة مفتوحة بالفعل: ${existing.claimNumber}`);
    }

    // توليد رقم المطالبة
    const claimNumber = await this.generateClaimNumber(hospitalId);

    const claim = await this.prisma.claim.create({
      data: {
        hospitalId,
        invoiceId,
        claimNumber,
        claimedAmount: invoice.insuranceShare || invoice.totalAmount,
        status: ClaimStatus.DRAFT,
      },
      include: {
        invoice: { include: { patient: true, insuranceProvider: true } },
      },
    });

    this.logger.log(`✅ تم إنشاء مطالبة ${claimNumber} للفاتورة #${invoiceId}`);
    return claim;
  }

  /**
   * إنشاء مطالبات جماعية من فواتير متعددة
   */
  async createBatchClaims(hospitalId: number, invoiceIds: number[]) {
    const results = {
      created: [] as any[],
      errors: [] as { invoiceId: number; error: string }[],
    };

    for (const invoiceId of invoiceIds) {
      try {
        const claim = await this.createClaim(hospitalId, invoiceId);
        results.created.push(claim);
      } catch (err: any) {
        results.errors.push({ invoiceId, error: err.message });
      }
    }

    return results;
  }

  /**
   * فحص المطالبة (Scrubbing) — التحقق من صحتها قبل الإرسال
   */
  async scrubClaim(claimId: number) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        invoice: {
          include: {
            patient: true,
            insuranceProvider: { include: { plans: true } },
            encounter: { include: { encounterDiagnoses: true } },
            charges: true,
          },
        },
      },
    });

    if (!claim) throw new NotFoundException('المطالبة غير موجودة');

    // تنفيذ الفحص
    const scrubResults = await this.scrubber.scrub(claim);

    // حفظ نتائج الفحص
    await this.prisma.claimScrubResult.deleteMany({
      where: { claimId: claim.id },
    });

    if (scrubResults.length > 0) {
      await this.prisma.claimScrubResult.createMany({
        data: scrubResults.map((r) => ({
          claimId: claim.id,
          ruleCode: r.ruleCode,
          severity: r.severity,
          message: r.message,
          field: r.field || null,
          autoFixed: r.autoFixed || false,
        })),
      });
    }

    // تحديد الحالة بناءً على النتائج
    const hasErrors = scrubResults.some((r) => r.severity === 'ERROR');
    const newStatus = hasErrors ? ClaimStatus.SCRUB_FAILED : ClaimStatus.SCRUBBED;

    await this.updateClaimStatus(claim.id, newStatus, 'نتيجة الفحص التلقائي');

    return {
      claim: await this.getClaimById(claim.id),
      scrubResults,
      passed: !hasErrors,
      errorCount: scrubResults.filter((r) => r.severity === 'ERROR').length,
      warningCount: scrubResults.filter((r) => r.severity === 'WARNING').length,
    };
  }

  /**
   * تحديث حالة المطالبة مع تسجيل التاريخ
   */
  async updateClaimStatus(
    claimId: number,
    newStatus: ClaimStatus,
    notes?: string,
    changedById?: number,
  ) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });
    if (!claim) throw new NotFoundException('المطالبة غير موجودة');

    const [updatedClaim] = await this.prisma.$transaction([
      this.prisma.claim.update({
        where: { id: claimId },
        data: {
          status: newStatus,
          ...(newStatus === ClaimStatus.SUBMITTED && { submittedAt: new Date() }),
          ...(newStatus === ClaimStatus.PAID && { paidAt: new Date() }),
        },
      }),
      this.prisma.claimHistory.create({
        data: {
          claimId,
          fromStatus: claim.status,
          toStatus: newStatus,
          changedById,
          notes,
        },
      }),
    ]);

    this.logger.log(
      `📋 مطالبة ${claim.claimNumber}: ${claim.status} → ${newStatus}`,
    );

    return updatedClaim;
  }

  /**
   * تسجيل الدفع على المطالبة
   */
  async postPayment(
    claimId: number,
    data: {
      paidAmount: number;
      adjustmentAmount?: number;
      adjustmentReason?: string;
    },
  ) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });
    if (!claim) throw new NotFoundException('المطالبة غير موجودة');

    const totalPaid = Number(claim.paidAmount || 0) + data.paidAmount;
    const claimedAmount = Number(claim.claimedAmount);
    const newStatus =
      totalPaid >= claimedAmount
        ? ClaimStatus.PAID
        : ClaimStatus.PARTIALLY_PAID;

    const updated = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        paidAmount: totalPaid,
        adjustmentAmount: data.adjustmentAmount,
        adjustmentReason: data.adjustmentReason,
        status: newStatus,
        paidAt: newStatus === ClaimStatus.PAID ? new Date() : undefined,
      },
    });

    await this.prisma.claimHistory.create({
      data: {
        claimId,
        fromStatus: claim.status,
        toStatus: newStatus,
        notes: `تم ترحيل دفعة: ${data.paidAmount}`,
      },
    });

    this.logger.log(
      `💰 ترحيل دفعة ${data.paidAmount} على مطالبة ${claim.claimNumber}`,
    );

    return updated;
  }

  /**
   * رفض المطالبة
   */
  async denyClaim(
    claimId: number,
    data: { denialCode: string; denialReason: string; appealDeadline?: Date },
  ) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });
    if (!claim) throw new NotFoundException('المطالبة غير موجودة');

    const updated = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        status: ClaimStatus.REJECTED,
        denialCode: data.denialCode,
        denialReason: data.denialReason,
        appealDeadline: data.appealDeadline,
      },
    });

    await this.prisma.claimHistory.create({
      data: {
        claimId,
        fromStatus: claim.status,
        toStatus: ClaimStatus.REJECTED,
        notes: `${data.denialCode}: ${data.denialReason}`,
      },
    });

    return updated;
  }

  /**
   * تقديم استئناف
   */
  async appealClaim(claimId: number, appealNotes: string, changedById?: number) {
    return this.prisma.claim.update({
      where: { id: claimId },
      data: {
        status: ClaimStatus.APPEALED,
        appealNotes,
      },
    }).then(async (updated) => {
      await this.prisma.claimHistory.create({
        data: {
          claimId,
          fromStatus: ClaimStatus.REJECTED,
          toStatus: ClaimStatus.APPEALED,
          changedById,
          notes: appealNotes,
        },
      });
      return updated;
    });
  }

  /**
   * جلب مطالبة بالتفاصيل
   */
  async getClaimById(claimId: number) {
    return this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        invoice: {
          include: { patient: true, insuranceProvider: true, charges: true },
        },
        batch: true,
        scrubResults: { orderBy: { severity: 'asc' } },
        history: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  /**
   * قائمة المطالبات مع الفلترة والتصفح
   */
  async findClaims(
    hospitalId: number,
    filters?: {
      status?: ClaimStatus;
      fromDate?: Date;
      toDate?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { hospitalId };
    if (filters?.status) where.status = filters.status;
    if (filters?.fromDate || filters?.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = filters.fromDate;
      if (filters.toDate) where.createdAt.lte = filters.toDate;
    }

    const [claims, total] = await this.prisma.$transaction([
      this.prisma.claim.findMany({
        where,
        include: {
          invoice: {
            include: { patient: true, insuranceProvider: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.claim.count({ where }),
    ]);

    return {
      data: claims,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * لوحة تحكم المطالبات — ملخص سريع
   */
  async getClaimsDashboard(hospitalId: number) {
    const [statusCounts, totalClaimed, totalPaid, recentDenials] =
      await this.prisma.$transaction([
        this.prisma.claim.groupBy({
          by: ['status'],
          where: { hospitalId },
          _count: true,
          _sum: { claimedAmount: true },
          orderBy: { status: 'asc' },
        }),
        this.prisma.claim.aggregate({
          where: { hospitalId },
          _sum: { claimedAmount: true },
        }),
        this.prisma.claim.aggregate({
          where: { hospitalId, status: { in: ['PAID', 'PARTIALLY_PAID'] } },
          _sum: { paidAmount: true },
        }),
        this.prisma.claim.findMany({
          where: { hospitalId, status: ClaimStatus.REJECTED },
          include: { invoice: { include: { patient: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 5,
        }),
      ]);

    return {
      byStatus: statusCounts.map((s) => ({
        status: s.status,
        count: s._count,
        amount: Number(s._sum?.claimedAmount || 0),
      })),
      totals: {
        claimed: Number(totalClaimed._sum.claimedAmount || 0),
        paid: Number(totalPaid._sum.paidAmount || 0),
        collectionRate:
          Number(totalClaimed._sum.claimedAmount || 0) > 0
            ? (
                (Number(totalPaid._sum.paidAmount || 0) /
                  Number(totalClaimed._sum.claimedAmount || 1)) *
                100
              ).toFixed(1)
            : '0',
      },
      recentDenials,
    };
  }

  /**
   * توليد رقم مطالبة فريد
   */
  private async generateClaimNumber(hospitalId: number): Promise<string> {
    const today = new Date();
    const prefix = `CLM-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;

    const lastClaim = await this.prisma.claim.findFirst({
      where: {
        hospitalId,
        claimNumber: { startsWith: prefix },
      },
      orderBy: { claimNumber: 'desc' },
    });

    let seq = 1;
    if (lastClaim) {
      const parts = lastClaim.claimNumber.split('-');
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }

    return `${prefix}-${String(seq).padStart(5, '0')}`;
  }
}
