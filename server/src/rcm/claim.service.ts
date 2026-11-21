import { collectClaim, type ClaimReceiptInput } from './claim-receipt';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimScrubberService } from './scrubber/claim-scrubber.service';
import { ClaimStatus, Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { Money } from '../common/utils/money.util';

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
    @Optional() private cls?: ClsService,
  ) {}

  private resolveHospitalId(hospitalId?: number): number | undefined {
    return hospitalId ?? this.cls?.get('hospitalId');
  }

  /**
   * إنشاء مطالبة جديدة من فاتورة
   */
  async createClaim(hospitalId: number, invoiceId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27008, ${hospitalId}::int)`;
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      // التحقق من الفاتورة
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, hospitalId },
        include: {
          patient: true,
          insuranceProvider: true,
          encounter: true,
          insuranceSettlementAllocations: { select: { id: true }, take: 1 },
          prepaidPrescription: {
            select: { status: true, _count: { select: { dispenses: true } } },
          },
        },
      });

      if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
      if (invoice.claimStatus === 'WITHDRAWN')
        throw new BadRequestException(
          'المطالبة مسحوبة ولا يمكن إنشاء مطالبة بديلة على الفاتورة نفسها',
        );
      if (invoice.insuranceSettlementAllocations?.length)
        throw new BadRequestException(
          'ذمة التأمين مسددة في تسوية مثبتة لهذه الفاتورة',
        );
      if (invoice.prepaidPrescription?._count.dispenses === 0)
        throw new BadRequestException(
          'يلزم صرف الوصفة قبل إصدار المطالبة التأمينية',
        );
      if (invoice.status === 'CANCELLED') {
        throw new BadRequestException('لا يمكن إنشاء مطالبة لفاتورة ملغاة');
      }
      if (!invoice.insuranceProviderId) {
        throw new BadRequestException('الفاتورة لا تحتوي على تأمين');
      }
      let claimedAmount = invoice.insuranceShare;
      if (invoice.prepaidPrescription?.status === 'PARTIALLY_COMPLETED') {
        const correction = await tx.invoiceAdjustment.findFirst({
          where: {
            hospitalId,
            invoiceId,
            status: 'POSTED',
            partialDispense: true,
          },
          select: { insuranceDelta: true },
        });
        if (!correction)
          throw new BadRequestException(
            'يلزم اعتماد تصحيح الصرف الجزئي قبل المطالبة',
          );
        claimedAmount = Money.sumDecimal(
          claimedAmount,
          correction.insuranceDelta,
        );
      }
      if (Money.lte(claimedAmount ?? 0, 0)) {
        throw new BadRequestException(
          'الفاتورة لا تحتوي على حصة تأمينية موجبة للمطالبة',
        );
      }

      // التحقق من عدم وجود مطالبة مكررة
      const existing = await tx.claim.findFirst({
        where: { hospitalId, invoiceId, status: { notIn: ['VOID'] } },
      });
      if (existing) {
        throw new BadRequestException(
          `يوجد مطالبة مفتوحة بالفعل: ${existing.claimNumber}`,
        );
      }

      // توليد رقم المطالبة
      const claimNumber = await this.generateClaimNumber(hospitalId, tx);

      const claim = await tx.claim.create({
        data: {
          hospitalId,
          invoiceId,
          claimNumber,
          claimedAmount: Money.toDbString(claimedAmount),
          status: ClaimStatus.DRAFT,
        },
        include: {
          invoice: { include: { patient: true, insuranceProvider: true } },
        },
      });

      this.logger.log(
        `✅ تم إنشاء مطالبة ${claimNumber} للفاتورة #${invoiceId}`,
      );
      return claim;
    });
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
        results.errors.push({
          invoiceId,
          error: err instanceof Error ? err.message : 'تعذر إنشاء المطالبة',
        });
      }
    }

    return results;
  }

  /**
   * فحص المطالبة (Scrubbing) — التحقق من صحتها قبل الإرسال
   */
  async scrubClaim(claimId: number, hospitalId?: number) {
    const tenantId = this.resolveHospitalId(hospitalId);
    const claim = await this.prisma.claim.findFirst({
      where: {
        id: claimId,
        ...(tenantId ? { hospitalId: tenantId } : {}),
      },
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
    if (claim.status === 'VOID')
      throw new BadRequestException('المطالبة المسحوبة مغلقة');

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
    const newStatus = hasErrors
      ? ClaimStatus.SCRUB_FAILED
      : ClaimStatus.SCRUBBED;

    await this.updateClaimStatus(
      claim.id,
      newStatus,
      'نتيجة الفحص التلقائي',
      undefined,
      claim.hospitalId,
    );

    return {
      claim: await this.getClaimById(claim.id, claim.hospitalId),
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
    hospitalId?: number,
  ) {
    if (newStatus === 'VOID')
      throw new BadRequestException(
        'سحب المطالبة يتطلب توثيق تأكيد شركة التأمين',
      );
    if (newStatus === 'PAID' || newStatus === 'PARTIALLY_PAID')
      throw new BadRequestException('حالة التحصيل تستنتج من دفتر الدفعات فقط');
    const tenantId = this.resolveHospitalId(hospitalId);
    const claim = await this.prisma.claim.findFirst({
      where: {
        id: claimId,
        ...(tenantId ? { hospitalId: tenantId } : {}),
      },
    });
    if (!claim) throw new NotFoundException('المطالبة غير موجودة');
    if (claim.status === 'VOID')
      throw new BadRequestException('المطالبة المسحوبة مغلقة');
    if (Money.gt(claim.paidAmount ?? 0, 0) || claim.status === 'PAID')
      throw new BadRequestException(
        'المطالبة محصلة؛يلزم تصحيح مالي مستقل بدل تغيير حالتها',
      );

    const [updatedClaim] = await this.prisma.$transaction([
      this.prisma.claim.update({
        where: { id: claimId },
        data: {
          status: newStatus,
          ...(newStatus === ClaimStatus.SUBMITTED && {
            submittedAt: new Date(),
          }),
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
    data: ClaimReceiptInput,
    hospitalId: number,
    userId: number,
  ) {
    return this.prisma.$transaction(
      (tx) => collectClaim(tx, hospitalId, userId, claimId, data),
      { maxWait: 10000, timeout: 20000 },
    );
  }

  /**
   * رفض المطالبة
   */
  async denyClaim(
    claimId: number,
    data: { denialCode: string; denialReason: string; appealDeadline?: Date },
    hospitalId?: number,
  ) {
    const tenantId = this.resolveHospitalId(hospitalId);
    const claim = await this.prisma.claim.findFirst({
      where: {
        id: claimId,
        ...(tenantId ? { hospitalId: tenantId } : {}),
      },
    });
    if (!claim) throw new NotFoundException('المطالبة غير موجودة');
    if (claim.status === 'VOID')
      throw new BadRequestException('المطالبة المسحوبة مغلقة');
    if (Money.gt(claim.paidAmount ?? 0, 0) || claim.status === 'PAID')
      throw new BadRequestException(
        'المطالبة محصلة؛يلزم تصحيح مالي مستقل بدل تغيير حالتها',
      );

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
  async appealClaim(
    claimId: number,
    appealNotes: string,
    changedById?: number,
    hospitalId?: number,
  ) {
    const tenantId = this.resolveHospitalId(hospitalId);
    const claim = await this.prisma.claim.findFirst({
      where: {
        id: claimId,
        ...(tenantId ? { hospitalId: tenantId } : {}),
      },
    });
    if (!claim) throw new NotFoundException('المطالبة غير موجودة');
    if (claim.status === 'VOID')
      throw new BadRequestException('المطالبة المسحوبة مغلقة');
    if (Money.gt(claim.paidAmount ?? 0, 0) || claim.status === 'PAID')
      throw new BadRequestException(
        'المطالبة محصلة؛يلزم تصحيح مالي مستقل بدل تغيير حالتها',
      );

    return this.prisma.claim
      .update({
        where: { id: claimId },
        data: {
          status: ClaimStatus.APPEALED,
          appealNotes,
        },
      })
      .then(async (updated) => {
        await this.prisma.claimHistory.create({
          data: {
            claimId,
            fromStatus: claim.status,
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
  async getClaimById(claimId: number, hospitalId?: number) {
    const tenantId = this.resolveHospitalId(hospitalId);
    const claim = await this.prisma.claim.findFirst({
      where: {
        id: claimId,
        ...(tenantId ? { hospitalId: tenantId } : {}),
      },
      include: {
        invoice: {
          include: { patient: true, insuranceProvider: true, charges: true },
        },
        batch: true,
        scrubResults: { orderBy: { severity: 'asc' } },
        history: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!claim) {
      throw new NotFoundException('المطالبة غير موجودة');
    }
    const credits = await this.prisma.invoiceAdjustment.aggregate({
      where: {
        hospitalId: claim.hospitalId,
        invoiceId: claim.invoiceId,
        status: 'POSTED',
        insuranceOnly: true,
      },
      _sum: { insuranceDelta: true },
    });
    const effectiveShare = Money.sumDecimal(
      claim.claimedAmount,
      credits._sum.insuranceDelta,
    );
    return {
      ...claim,
      effectiveClaimedAmount: Money.toDbString(effectiveShare),
    };
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

    const where: Prisma.ClaimWhereInput = { hospitalId };
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
            include: {
              patient: true,
              insuranceProvider: true,
              adjustments: {
                where: { insuranceOnly: true, status: 'POSTED' },
                select: { insuranceDelta: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.claim.count({ where }),
    ]);

    return {
      data: claims.map(
        ({ invoice: { adjustments, ...invoice }, ...claim }) => ({
          ...claim,
          invoice,
          effectiveClaimedAmount: Money.toDbString(
            Money.sumDecimal(
              claim.claimedAmount,
              ...adjustments.map((item) => item.insuranceDelta),
            ),
          ),
        }),
      ),
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
    const [statusCounts, totalClaimed, totalPaid, recentDenials, credits] =
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
        this.prisma.invoiceAdjustment.aggregate({
          where: {
            hospitalId,
            status: 'POSTED',
            insuranceOnly: true,
            invoice: { claims: { some: { hospitalId } } },
          },
          _sum: { insuranceDelta: true },
        }),
      ]);

    const claimedTotal = Money.fromPrisma(totalClaimed._sum.claimedAmount);
    const paidTotal = Money.fromPrisma(totalPaid._sum.paidAmount);
    const effectiveClaimed = Money.sumDecimal(
      totalClaimed._sum.claimedAmount,
      credits._sum.insuranceDelta,
    );

    return {
      byStatus: statusCounts.map((s) => ({
        status: s.status,
        count: s._count,
        amount: Money.fromPrisma(s._sum?.claimedAmount),
      })),
      totals: {
        claimed: claimedTotal,
        effectiveClaimed: effectiveClaimed.toFixed(3),
        paid: paidTotal,
        collectionRate: effectiveClaimed.gt(0)
          ? Money.divide(totalPaid._sum.paidAmount, effectiveClaimed)
              .times(100)
              .toFixed(1)
          : '0',
      },
      recentDenials,
    };
  }

  /**
   * توليد رقم مطالبة فريد
   */
  private async generateClaimNumber(
    hospitalId: number,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    const today = new Date();
    const prefix = `CLM-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;

    const lastClaim = await db.claim.findFirst({
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
