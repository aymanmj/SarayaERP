import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NphiesClaimService } from '../integration/nphies/nphies-claim.service';
import { ClsService } from 'nestjs-cls';

/**
 * خدمة الدفعات التأمينية (Batch Submission Workflow)
 * 
 * تتيح تجميع المطالبات (Claims) الجاهزة في دفعات (Batches)
 * بناءً على شركة التأمين (Insurance Provider) وإرسالها دفعة واحدة.
 */
@Injectable()
export class BatchSubmissionService {
  private readonly logger = new Logger(BatchSubmissionService.name);

  constructor(
    private prisma: PrismaService,
    private nphiesClaimService: NphiesClaimService,
    private cls: ClsService,
  ) {}

  /**
   * إنشاء دفعة جديدة من المطالبات المفحوصة (Scrubbed) والموافق عليها.
   */
  async createBatch(providerId: number, maxClaims: number = 100) {
    const hospitalId = this.cls.get('hospitalId');
    if (!hospitalId) {
      throw new BadRequestException('معرّف المستشفى غير متوفر في السياق');
    }

    // البحث عن المطالبات الجاهزة للإرسال
    const readyClaims = await this.prisma.claim.findMany({
      where: {
        hospitalId,
        status: 'SCRUBBED', // فقط المطالبات المفحوصة والسليمة
        batchId: null,      // غير مرتبطة بدفعة أخرى
        invoice: {
          insuranceProviderId: providerId,
        },
      },
      take: maxClaims,
      include: {
        invoice: true,
      },
    });

    if (readyClaims.length === 0) {
      throw new BadRequestException('لا توجد مطالبات جاهزة لهذه الشركة');
    }

    const totalAmount = readyClaims.reduce((sum, claim) => sum + Number(claim.claimedAmount), 0);
    const batchNumber = `BATCH-${hospitalId}-${providerId}-${Date.now()}`;

    // إنشاء الدفعة وربط المطالبات بها
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.claimBatch.create({
        data: {
          hospitalId,
          providerId,
          batchNumber,
          totalClaims: readyClaims.length,
          totalAmount,
          status: 'OPEN',
        },
      });

      await tx.claim.updateMany({
        where: { id: { in: readyClaims.map(c => c.id) } },
        data: { batchId: batch.id },
      });

      return batch;
    });
  }

  /**
   * إرسال جميع مطالبات الدفعة إلى NPHIES
   */
  async submitBatchToNphies(batchId: number, userId: number) {
    const batch = await this.prisma.claimBatch.findUnique({
      where: { id: batchId },
      include: { claims: true },
    });

    if (!batch) throw new NotFoundException('الدفعة غير موجودة');
    if (batch.status === 'SUBMITTED') throw new BadRequestException('تم إرسال الدفعة مسبقاً');

    let successCount = 0;
    let failureCount = 0;

    // إرسال كل مطالبة بشكل فردي (أو مجمع حسب ما يدعمه NPHIES لاحقاً)
    for (const claim of batch.claims) {
      try {
        const result = await this.nphiesClaimService.submitClaim(claim.id);
        if (result.accepted) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        failureCount++;
        this.logger.error(`فشل إرسال المطالبة ${claim.id} ضمن الدفعة ${batchId}: ${error}`);
      }
    }

    // تحديث حالة الدفعة
    await this.prisma.claimBatch.update({
      where: { id: batchId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    this.logger.log(`📤 إرسال الدفعة ${batch.batchNumber}: نجاح ${successCount}، فشل ${failureCount}`);

    return {
      batchId,
      batchNumber: batch.batchNumber,
      totalProcessed: batch.claims.length,
      successCount,
      failureCount,
    };
  }
}
