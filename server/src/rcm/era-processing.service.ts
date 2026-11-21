import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { Money } from '../common/utils/money.util';

/**
 * خدمة معالجة إشعارات التحويل الإلكتروني (ERA - Electronic Remittance Advice)
 *
 * الميزات:
 * 1. استلام وتخزين ملفات ERA الواردة من NPHIES أو بوابات التأمين.
 * 2. مطابقة المبالغ المدفوعة (Reconciliation) مع المطالبات المحلية (Claims).
 * 3. تحليل أكواد الرفض/التعديلات (Adjustments & Denials).
 * 4. تطبيق RLS تلقائياً لكل مستشفى (Multi-Tenancy).
 */
@Injectable()
export class EraProcessingService {
  private readonly logger = new Logger(EraProcessingService.name);

  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  /**
   * تسجيل ملف ERA جديد واستخراج المطالبات الواردة فيه
   */
  async processEraPayload(data: {
    insuranceProviderId: number;
    eraNumber: string;
    paymentDate: Date;
    totalPaid: number;
    checkNumber?: string;
    bankReference?: string;
    rawPayload: any;
    lineItems: Array<{
      claimNumber: string;
      patientName?: string;
      serviceDate?: Date;
      billedAmount: number;
      allowedAmount?: number;
      paidAmount: number;
      adjustmentAmount?: number;
      adjustmentCode?: string;
      adjustmentReason?: string;
      denialCode?: string;
      denialReason?: string;
    }>;
  }) {
    const hospitalId = this.cls.get('hospitalId');
    if (!hospitalId) {
      throw new BadRequestException('معرّف المستشفى غير متوفر في السياق');
    }

    // 1. حساب الإجماليات للمطابقة (Reconciliation)
    const totalClaims = data.lineItems.length;
    const totalAdjustments = Money.toDb(
      Money.sum(...data.lineItems.map((item) => item.adjustmentAmount || 0)),
    );
    const computedTotalPaid = Money.toDb(
      Money.sum(...data.lineItems.map((item) => item.paidAmount)),
    );

    // التحقق من صحة إجمالي الملف
    if (
      !Money.eq(Money.round(computedTotalPaid), Money.round(data.totalPaid))
    ) {
      this.logger.warn(
        `ERA ${data.eraNumber}: إجمالي المدفوعات لا يتطابق. مدعّى: ${data.totalPaid}, محسوب: ${computedTotalPaid}`,
      );
    }

    // 2. محاولة مطابقة المطالبات داخلياً
    const matchedItems = await Promise.all(
      data.lineItems.map(async (item) => {
        // البحث عن المطالبة إما برقمها الداخلي أو الـ External ID الخاص بـ NPHIES
        const claim = await this.prisma.claim.findFirst({
          where: {
            hospitalId, // ضمان الأمان (RLS)
            status: { not: 'VOID' },
            OR: [
              { claimNumber: item.claimNumber },
              { externalClaimId: item.claimNumber },
            ],
          },
        });

        // تصنيف الحالة
        let status = 'UNMATCHED';
        if (claim) {
          if (Money.isZero(item.paidAmount) && item.denialCode) {
            status = 'DENIED';
          } else if (Money.lt(item.paidAmount, claim.claimedAmount)) {
            status = 'UNDERPAID';
          } else {
            status = 'MATCHED';
          }
        }

        return {
          ...item,
          claimId: claim?.id || null,
          status,
        };
      }),
    );

    // 3. تخزين الـ ERA في قاعدة البيانات
    const era = await this.prisma.eRATransaction.create({
      data: {
        hospitalId,
        insuranceProviderId: data.insuranceProviderId,
        eraNumber: data.eraNumber,
        paymentDate: data.paymentDate,
        totalPaid: data.totalPaid,
        totalClaims,
        totalAdjustments,
        checkNumber: data.checkNumber,
        bankReference: data.bankReference,
        rawPayload: data.rawPayload,
        status: 'PROCESSING',
        lineItems: {
          create: matchedItems,
        },
      },
      include: {
        lineItems: true,
      },
    });

    this.logger.log(
      `📥 تم استلام ERA رقم ${era.eraNumber} بنجاح. المطالبات: ${totalClaims}`,
    );
    return era;
  }

  /**
   * تطبيق التسويات واعتماد المطالبات بناءً على ملف ERA
   */
  async reconcileEra(eraId: number, userId: number, hospitalIdParam?: number) {
    const hospitalId = hospitalIdParam ?? this.cls.get('hospitalId');
    const era = await this.prisma.eRATransaction.findFirst({
      where: {
        id: eraId,
        ...(hospitalId ? { hospitalId } : {}),
      },
      include: { lineItems: true },
    });

    if (!era) throw new NotFoundException('لم يتم العثور على ملف ERA');
    if (era.status === 'RECONCILED')
      throw new BadRequestException('تمت تسوية هذا الملف مسبقاً');

    if (
      era.lineItems.some(
        (item) =>
          !Money.isZero(item.paidAmount) ||
          !Money.isZero(item.adjustmentAmount ?? 0) ||
          item.status === 'MATCHED' ||
          item.status === 'UNDERPAID',
      )
    ) {
      throw new BadRequestException(
        'ترحيل ERA المالي يحتاج مطابقة بدفتر التحصيل؛استخدم تحصيل المطالبة المعتمد ولا تعِد تسجيل المبلغ يدويًا',
      );
    }

    let processedCount = 0;

    // استخدام Transaction لضمان سلامة التحديثات
    await this.prisma.$transaction(async (tx) => {
      if (
        await tx.claimReceipt.count({
          where: {
            hospitalId: era.hospitalId,
            claimId: {
              in: era.lineItems.flatMap((i) => (i.claimId ? [i.claimId] : [])),
            },
          },
        })
      )
        throw new BadRequestException(
          'توجد تحصيلات مثبتة لهذه المطالبة؛تلزم مطابقة ERA دون إعادة ترحيل الرصيد',
        );
      for (const item of era.lineItems) {
        if (!item.claimId) continue;

        const existingClaim = await tx.claim.findFirst({
          where: {
            id: item.claimId,
            hospitalId: era.hospitalId,
          },
        });
        if (!existingClaim) continue;
        if (existingClaim.status === 'VOID')
          throw new BadRequestException(
            'يحتاج ملف التسوية لمراجعة بند المطالبة المسحوبة',
          );

        const newStatus = this.determineClaimStatus(item.status);

        // تحديث المطالبة
        await tx.claim.update({
          where: { id: existingClaim.id },
          data: {
            status: newStatus,
            paidAmount: Money.toDb(item.paidAmount),
            adjustmentAmount:
              item.adjustmentAmount != null
                ? Money.toDb(item.adjustmentAmount)
                : undefined,
            adjustmentReason: item.adjustmentReason || item.adjustmentCode,
            denialCode: item.denialCode,
            denialReason: item.denialReason,
            paidAt: era.paymentDate,
          },
        });

        // تسجيل في تاريخ المطالبة
        await tx.claimHistory.create({
          data: {
            claimId: existingClaim.id,
            fromStatus: existingClaim.status,
            toStatus: newStatus,
            changedById: userId,
            notes: `ERA Reconciled (ERA: ${era.eraNumber}) - Paid: ${item.paidAmount}, Adj: ${item.adjustmentAmount}`,
          },
        });

        processedCount++;
      }

      // تحديث حالة ERA
      await tx.eRATransaction.update({
        where: { id: era.id },
        data: {
          status: 'RECONCILED',
          reconciledAt: new Date(),
          reconciledById: userId,
        },
      });
    });

    this.logger.log(
      `✅ تمت تسوية ERA ${era.eraNumber} بنجاح. المطالبات المعالجة: ${processedCount}`,
    );
    return { success: true, processedCount };
  }

  /**
   * مساعدة لتحديد حالة المطالبة (Prisma ClaimStatus)
   */
  private determineClaimStatus(lineItemStatus: string): any {
    switch (lineItemStatus) {
      case 'DENIED':
        return 'REJECTED';
      case 'UNDERPAID':
        return 'PARTIALLY_PAID';
      case 'MATCHED':
        return 'PAID';
      default:
        return 'SUBMITTED';
    }
  }
}
