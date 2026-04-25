import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

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
    const totalAdjustments = data.lineItems.reduce((acc, item) => acc + (item.adjustmentAmount || 0), 0);
    const computedTotalPaid = data.lineItems.reduce((acc, item) => acc + item.paidAmount, 0);

    // التحقق من صحة إجمالي الملف
    if (Math.abs(computedTotalPaid - data.totalPaid) > 0.01) {
      this.logger.warn(`ERA ${data.eraNumber}: إجمالي المدفوعات لا يتطابق. مدعّى: ${data.totalPaid}, محسوب: ${computedTotalPaid}`);
    }

    // 2. محاولة مطابقة المطالبات داخلياً
    const matchedItems = await Promise.all(
      data.lineItems.map(async (item) => {
        // البحث عن المطالبة إما برقمها الداخلي أو الـ External ID الخاص بـ NPHIES
        const claim = await this.prisma.claim.findFirst({
          where: {
            hospitalId, // ضمان الأمان (RLS)
            OR: [
              { claimNumber: item.claimNumber },
              { externalClaimId: item.claimNumber },
            ],
          },
        });

        // تصنيف الحالة
        let status = 'UNMATCHED';
        if (claim) {
          if (item.paidAmount === 0 && item.denialCode) {
            status = 'DENIED';
          } else if (item.paidAmount < Number(claim.claimedAmount)) {
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
      })
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

    this.logger.log(`📥 تم استلام ERA رقم ${era.eraNumber} بنجاح. المطالبات: ${totalClaims}`);
    return era;
  }

  /**
   * تطبيق التسويات واعتماد المطالبات بناءً على ملف ERA
   */
  async reconcileEra(eraId: number, userId: number) {
    const era = await this.prisma.eRATransaction.findUnique({
      where: { id: eraId },
      include: { lineItems: true },
    });

    if (!era) throw new NotFoundException('لم يتم العثور على ملف ERA');
    if (era.status === 'RECONCILED') throw new BadRequestException('تمت تسوية هذا الملف مسبقاً');

    let processedCount = 0;

    // استخدام Transaction لضمان سلامة التحديثات
    await this.prisma.$transaction(async (tx) => {
      for (const item of era.lineItems) {
        if (!item.claimId) continue;

        const newStatus = this.determineClaimStatus(item.status);

        // تحديث المطالبة
        await tx.claim.update({
          where: { id: item.claimId },
          data: {
            status: newStatus,
            paidAmount: item.paidAmount,
            adjustmentAmount: item.adjustmentAmount,
            adjustmentReason: item.adjustmentReason || item.adjustmentCode,
            denialCode: item.denialCode,
            denialReason: item.denialReason,
            paidAt: era.paymentDate,
          },
        });

        // تسجيل في تاريخ المطالبة
        await tx.claimHistory.create({
          data: {
            claimId: item.claimId,
            fromStatus: 'SUBMITTED', // افتراض أنها كانت مرسلة
            toStatus: newStatus,
            changedById: userId,
            notes: `ERA Reconciled (ERA: ${era.eraNumber}) - Paid: ${item.paidAmount}, Adj: ${item.adjustmentAmount}`,
          },
        });

        processedCount++;
      }

      // تحديث حالة ERA
      await tx.eRATransaction.update({
        where: { id: eraId },
        data: {
          status: 'RECONCILED',
          reconciledAt: new Date(),
          reconciledById: userId,
        },
      });
    });

    this.logger.log(`✅ تمت تسوية ERA ${era.eraNumber} بنجاح. المطالبات المعالجة: ${processedCount}`);
    return { success: true, processedCount };
  }

  /**
   * مساعدة لتحديد حالة المطالبة (Prisma ClaimStatus)
   */
  private determineClaimStatus(lineItemStatus: string): any {
    switch (lineItemStatus) {
      case 'DENIED': return 'REJECTED';
      case 'UNDERPAID': return 'PARTIALLY_PAID';
      case 'MATCHED': return 'PAID';
      default: return 'SUBMITTED';
    }
  }
}
