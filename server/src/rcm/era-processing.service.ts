import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { ClaimStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Money } from '../common/utils/money.util';
import { lockFinancialInvoice } from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { collectClaim } from './claim-receipt';
import { claimCollectionBalance } from './claim-collection-balance';

export const MONEY_INPUT_PATTERN = /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/;
const UUID_V4_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export type EraLineItemInput = {
  claimNumber: string;
  patientName?: string;
  serviceDate?: Date | string;
  billedAmount: number | string;
  allowedAmount?: number | string;
  paidAmount: number | string;
  adjustmentAmount?: number | string;
  adjustmentCode?: string;
  adjustmentReason?: string;
  denialCode?: string;
  denialReason?: string;
};

export type ProcessEraPayloadInput = {
  insuranceProviderId: number;
  eraNumber: string;
  paymentDate?: Date | string;
  totalPaid: number | string;
  checkNumber?: string;
  bankReference?: string;
  rawPayload?: Prisma.InputJsonValue;
  lineItems: EraLineItemInput[];
};

export type PostEraFinancialInput = {
  requestId: string;
  bankReference: string;
  confirmed: boolean;
};

function parseNonNegativeMoney(
  value: number | string,
  fieldLabel: string,
): Prisma.Decimal {
  if (typeof value === 'string') {
    if (!MONEY_INPUT_PATTERN.test(value)) {
      throw new BadRequestException(`صيغة المبلغ غير صالحة في ${fieldLabel}`);
    }
    return Money.decimal(value);
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`قيمة المبلغ غير صالحة في ${fieldLabel}`);
  }
  return Money.decimal(value);
}

function deterministicUuidV4(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * خدمة معالجة إشعارات التحويل الإلكتروني (ERA - Electronic Remittance Advice)
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
  async processEraPayload(
    data: ProcessEraPayloadInput,
    hospitalIdParam?: number,
  ) {
    const hospitalId = hospitalIdParam ?? this.cls.get<number>('hospitalId');
    if (!hospitalId) {
      throw new BadRequestException('معرّف المستشفى غير متوفر في السياق');
    }

    const eraNumber = data.eraNumber?.trim();
    if (!eraNumber || eraNumber.length < 3 || eraNumber.length > 100) {
      throw new BadRequestException('رقم ملف ERA مطلوب (3 إلى 100 حرف)');
    }
    if (!Array.isArray(data.lineItems) || data.lineItems.length === 0) {
      throw new BadRequestException('يلزم سطر مطالبة واحد على الأقل في ERA');
    }
    if (data.lineItems.length > 200) {
      throw new BadRequestException('الحد الأقصى لسطور ملف ERA الواحد 200 بند');
    }

    const provider = await this.prisma.insuranceProvider.findFirst({
      where: { id: data.insuranceProviderId, hospitalId, isActive: true },
      select: { id: true },
    });
    if (!provider) {
      throw new BadRequestException('شركة التأمين غير نشطة ضمن المنشأة');
    }

    const totalPaidDec = parseNonNegativeMoney(data.totalPaid, 'totalPaid');
    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : null;
    if (paymentDate && Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException('تاريخ الدفع في ERA غير صالح');
    }

    const existingEra = await this.prisma.eRATransaction.findUnique({
      where: { eraNumber },
      include: { lineItems: { orderBy: { id: 'asc' } } },
    });
    if (existingEra) {
      if (existingEra.hospitalId !== hospitalId) {
        throw new ConflictException('رقم ملف ERA مستخدم مسبقًا');
      }
      if (
        existingEra.insuranceProviderId === data.insuranceProviderId &&
        Money.eq(existingEra.totalPaid, totalPaidDec) &&
        existingEra.totalClaims === data.lineItems.length
      ) {
        return existingEra;
      }
      throw new ConflictException('رقم ملف ERA مستخدم لبيانات مختلفة');
    }

    const parsedLines = data.lineItems.map((item, idx) => {
      const claimNumber = item.claimNumber?.trim();
      if (!claimNumber) {
        throw new BadRequestException(
          `رقم المطالبة مطلوب في السطر رقم ${idx + 1}`,
        );
      }
      const billed = parseNonNegativeMoney(
        item.billedAmount,
        `lineItems[${idx}].billedAmount`,
      );
      const allowed =
        item.allowedAmount != null
          ? parseNonNegativeMoney(
              item.allowedAmount,
              `lineItems[${idx}].allowedAmount`,
            )
          : null;
      const paid = parseNonNegativeMoney(
        item.paidAmount,
        `lineItems[${idx}].paidAmount`,
      );
      const adjustment =
        item.adjustmentAmount != null
          ? parseNonNegativeMoney(
              item.adjustmentAmount,
              `lineItems[${idx}].adjustmentAmount`,
            )
          : null;
      const serviceDate = item.serviceDate ? new Date(item.serviceDate) : null;
      if (serviceDate && Number.isNaN(serviceDate.getTime())) {
        throw new BadRequestException(
          `تاريخ الخدمة غير صالح في السطر رقم ${idx + 1}`,
        );
      }
      return {
        claimNumber,
        patientName: item.patientName?.trim() || undefined,
        serviceDate: serviceDate ?? undefined,
        billed,
        allowed,
        paid,
        adjustment,
        adjustmentCode: item.adjustmentCode?.trim() || undefined,
        adjustmentReason: item.adjustmentReason?.trim() || undefined,
        denialCode: item.denialCode?.trim() || undefined,
        denialReason: item.denialReason?.trim() || undefined,
      };
    });

    const totalClaims = parsedLines.length;
    const totalAdjustmentsDec = Money.sumDecimal(
      ...parsedLines.map((item) => item.adjustment ?? 0),
    );
    const computedTotalPaidDec = Money.sumDecimal(
      ...parsedLines.map((item) => item.paid),
    );
    const totalsMatch = Money.eq(computedTotalPaidDec, totalPaidDec);
    if (!totalsMatch) {
      this.logger.warn(
        `ERA ${eraNumber}: إجمالي المدفوعات لا يتطابق. مدعّى: ${Money.toDbString(totalPaidDec)}, محسوب: ${Money.toDbString(computedTotalPaidDec)}`,
      );
    }

    const matchedItems = await Promise.all(
      parsedLines.map(async (item) => {
        const claim = await this.prisma.claim.findFirst({
          where: {
            hospitalId,
            status: { not: 'VOID' },
            invoice: { insuranceProviderId: data.insuranceProviderId },
            OR: [
              { claimNumber: item.claimNumber },
              { externalClaimId: item.claimNumber },
            ],
          },
          select: { id: true, claimedAmount: true },
        });

        let status = 'UNMATCHED';
        if (claim) {
          if (item.paid.isZero() && item.denialCode) {
            status = 'DENIED';
          } else if (item.paid.lt(claim.claimedAmount)) {
            status = 'UNDERPAID';
          } else {
            status = 'MATCHED';
          }
        }

        return {
          claimId: claim?.id ?? null,
          claimNumber: item.claimNumber,
          patientName: item.patientName,
          serviceDate: item.serviceDate,
          billedAmount: Money.toDbString(item.billed),
          allowedAmount: item.allowed ? Money.toDbString(item.allowed) : null,
          paidAmount: Money.toDbString(item.paid),
          adjustmentAmount: item.adjustment
            ? Money.toDbString(item.adjustment)
            : null,
          adjustmentCode: item.adjustmentCode,
          adjustmentReason: item.adjustmentReason,
          denialCode: item.denialCode,
          denialReason: item.denialReason,
          status,
        };
      }),
    );

    const era = await this.prisma.eRATransaction.create({
      data: {
        hospitalId,
        insuranceProviderId: data.insuranceProviderId,
        eraNumber,
        paymentDate,
        totalPaid: Money.toDbString(totalPaidDec),
        totalClaims,
        totalAdjustments: Money.toDbString(totalAdjustmentsDec),
        checkNumber: data.checkNumber?.trim() || undefined,
        bankReference: data.bankReference?.trim().toUpperCase() || undefined,
        rawPayload: data.rawPayload ?? Prisma.JsonNull,
        status: totalsMatch ? 'PROCESSING' : 'DISCREPANCY',
        lineItems: {
          create: matchedItems,
        },
      },
      include: {
        insuranceProvider: { select: { id: true, name: true, code: true } },
        lineItems: { orderBy: { id: 'asc' } },
      },
    });

    this.logger.log(
      `📥 تم استلام ERA رقم ${era.eraNumber} بنجاح. المطالبات: ${totalClaims}`,
    );
    return era;
  }

  async listEras(
    hospitalId: number,
    filters?: { providerId?: number; status?: string },
  ) {
    return this.prisma.eRATransaction.findMany({
      where: {
        hospitalId,
        ...(filters?.providerId
          ? { insuranceProviderId: filters.providerId }
          : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: {
        insuranceProvider: { select: { id: true, name: true, code: true } },
        lineItems: { orderBy: { id: 'asc' } },
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async getEraById(hospitalId: number, eraId: number) {
    const era = await this.prisma.eRATransaction.findFirst({
      where: { id: eraId, hospitalId },
      include: {
        insuranceProvider: { select: { id: true, name: true, code: true } },
        lineItems: { orderBy: { id: 'asc' } },
      },
    });
    if (!era) {
      throw new NotFoundException('لم يتم العثور على ملف ERA');
    }
    return era;
  }

  /**
   * الترحيل المالي الذري لملف ERA وربط كل سطر مسدد بإيصال تحصيل وقيد محاسبي معتمد
   */
  async postEraFinancialSettlement(
    hospitalId: number,
    userId: number,
    eraId: number,
    input: PostEraFinancialInput,
    txParam?: Prisma.TransactionClient,
  ) {
    const bankReference = input.bankReference?.trim().toUpperCase() ?? '';
    if (
      !UUID_V4_PATTERN.test(input.requestId ?? '') ||
      input.confirmed !== true ||
      bankReference.length < 5 ||
      bankReference.length > 200
    ) {
      throw new BadRequestException(
        'يلزم معرف طلب UUID v4 وتأكيد صريح ومرجع تحويل بنكي لا يقل عن 5 أحرف',
      );
    }

    const requestKey = `era-post:${hospitalId}:${eraId}:${input.requestId.toLowerCase()}`;

    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::integer)`;

      if (
        !(await tx.user.findFirst({
          where: { hospitalId, id: userId, isActive: true, isDeleted: false },
          select: { id: true },
        }))
      ) {
        throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
      }

      await tx.$queryRaw`SELECT id FROM "ERATransaction" WHERE id = ${eraId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const era = await tx.eRATransaction.findFirst({
        where: { id: eraId, hospitalId },
        include: {
          lineItems: { orderBy: { id: 'asc' } },
          claimBatch: { select: { id: true } },
        },
      });
      if (!era) {
        throw new NotFoundException('لم يتم العثور على ملف ERA');
      }

      if (era.status === 'RECONCILED') {
        if (
          era.postingRequestKey === requestKey &&
          era.bankReference === bankReference &&
          era.reconciledById === userId
        ) {
          return {
            success: true,
            eraId: era.id,
            eraNumber: era.eraNumber,
            bankReference: era.bankReference,
            postedReceiptsCount: era.lineItems.filter(
              (item) => item.receiptId != null,
            ).length,
            deniedClaimsCount: era.lineItems.filter(
              (item) => item.receiptId == null && item.status === 'DENIED',
            ).length,
            totalPaid: Money.toDbString(era.totalPaid),
          };
        }
        throw new ConflictException(
          'تم ترحيل ملف ERA مسبقًا بمعرف أو مرجع مختلف',
        );
      }

      if (
        !(await tx.insuranceProvider.findFirst({
          where: { id: era.insuranceProviderId, hospitalId, isActive: true },
          select: { id: true },
        }))
      ) {
        throw new BadRequestException('شركة التأمين غير نشطة ضمن المنشأة');
      }

      if (!era.lineItems.length) {
        throw new BadRequestException('ملف ERA لا يحتوي على بنود للمعالجة');
      }

      const claimIds = era.lineItems.map((item) => item.claimId);
      if (
        era.lineItems.some(
          (item) => !item.claimId || item.status === 'UNMATCHED',
        )
      ) {
        throw new BadRequestException(
          'توجد بنود غير مطابقة بمطالبات داخلية في ملف ERA؛ يلزم ربطها قبل الترحيل المالي',
        );
      }

      const uniqueClaimIds = new Set(claimIds);
      if (uniqueClaimIds.size !== era.lineItems.length) {
        throw new BadRequestException(
          'يحتوي ملف ERA على أسطر مكررة لنفس المطالبة',
        );
      }

      const sumLinePaid = Money.sumDecimal(
        ...era.lineItems.map((item) => item.paidAmount),
      );
      if (!Money.eq(sumLinePaid, era.totalPaid)) {
        throw new BadRequestException(
          'إجمالي مدفوعات أسطر ERA لا يطابق إجمالي التحويل المصرّح به',
        );
      }

      const orderedLines = [...era.lineItems].sort(
        (a, b) => (a.claimId ?? 0) - (b.claimId ?? 0),
      );

      let postedReceiptsCount = 0;
      let deniedClaimsCount = 0;

      for (const line of orderedLines) {
        const claimId = line.claimId!;
        const claimRecord = await tx.claim.findFirst({
          where: { id: claimId, hospitalId },
          include: { invoice: { select: { insuranceProviderId: true } } },
        });
        if (
          !claimRecord ||
          claimRecord.status === 'VOID' ||
          claimRecord.invoice.insuranceProviderId !== era.insuranceProviderId
        ) {
          throw new BadRequestException(
            `المطالبة #${claimId} لا تخص شركة التأمين أو غير صالحة للترحيل`,
          );
        }

        if (Money.isPositive(line.paidAmount)) {
          const lineRequestId = deterministicUuidV4(
            `era-line:${hospitalId}:${era.id}:${line.id}:${input.requestId.toLowerCase()}`,
          );
          const adjTag = line.adjustmentCode ? ` · ${line.adjustmentCode}` : '';
          await collectClaim(tx, hospitalId, userId, claimId, {
            requestId: lineRequestId,
            paidAmount: Money.toDbString(line.paidAmount),
            adjustmentReason: `ERA ${era.eraNumber} (${bankReference})${adjTag}`,
          });

          const receiptKey = `claim-receipt:${hospitalId}:${lineRequestId}`;
          const receipt = await tx.claimReceipt.findUniqueOrThrow({
            where: { requestKey: receiptKey },
            select: { id: true },
          });
          await tx.eRALineItem.update({
            where: { id: line.id },
            data: { receiptId: receipt.id },
          });
          postedReceiptsCount++;
        } else if (
          Money.isZero(line.paidAmount) &&
          (line.status === 'DENIED' || Boolean(line.denialCode))
        ) {
          await lockFinancialInvoice(tx, hospitalId, claimRecord.invoiceId);
          await tx.$queryRaw`SELECT id FROM "Claim" WHERE id = ${claimId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
          const lockedClaim = await tx.claim.findFirstOrThrow({
            where: { id: claimId, hospitalId },
          });
          const denialCode = line.denialCode?.trim() || 'DENIED';
          const denialReason =
            line.denialReason?.trim() ||
            line.adjustmentReason?.trim() ||
            `مرفوضة وفق إشعار التحويل الإلكتروني ${era.eraNumber}`;
          const alreadyRejectedByBatch =
            era.claimBatch != null &&
            lockedClaim.status === ClaimStatus.REJECTED &&
            lockedClaim.denialCode === denialCode;
          if (
            !alreadyRejectedByBatch &&
            !['SUBMITTED', 'ACCEPTED', 'APPEAL_SUBMITTED'].includes(
              lockedClaim.status,
            )
          ) {
            throw new BadRequestException(
              `حالة المطالبة #${claimId} لا تسمح بتسجيل رفض ERA`,
            );
          }
          const { net } = await claimCollectionBalance(tx, hospitalId, claimId);
          if (!net.isZero()) {
            throw new BadRequestException(
              `المطالبة #${claimId} عليها تحصيلات ولا يمكن قلبها إلى مرفوضة تلقائيًا`,
            );
          }

          if (!alreadyRejectedByBatch) {
            await tx.claim.update({
              where: { id: claimId },
              data: {
                status: ClaimStatus.REJECTED,
                denialCode,
                denialReason,
              },
            });
            await tx.invoice.update({
              where: { id: lockedClaim.invoiceId },
              data: { claimStatus: 'REJECTED' },
            });
            await tx.claimHistory.create({
              data: {
                claimId,
                fromStatus: lockedClaim.status,
                toStatus: ClaimStatus.REJECTED,
                changedById: userId,
                notes: `ERA ${era.eraNumber}: رفض (${denialCode}) - ${denialReason}`,
              },
            });
          }
          deniedClaimsCount++;
        } else {
          throw new BadRequestException(
            'يوجد بند في ملف ERA بدون مبلغ تحصيل أو كود رفض صالح',
          );
        }
      }

      const reconciledAt = new Date();
      await tx.eRATransaction.update({
        where: { id: era.id },
        data: {
          status: 'RECONCILED',
          reconciledAt,
          reconciledById: userId,
          bankReference,
          postingRequestKey: requestKey,
        },
      });

      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        entity: 'ERATransaction',
        entityId: era.id,
        action: 'POST_ERA_FINANCIAL_RECONCILIATION',
        details: {
          eraNumber: era.eraNumber,
          bankReference,
          totalPaid: Money.toDbString(era.totalPaid),
          postedReceiptsCount,
          deniedClaimsCount,
          lineCount: era.lineItems.length,
        },
      });

      return {
        success: true,
        eraId: era.id,
        eraNumber: era.eraNumber,
        bankReference,
        postedReceiptsCount,
        deniedClaimsCount,
        totalPaid: Money.toDbString(era.totalPaid),
      };
    };

    return txParam
      ? run(txParam)
      : this.prisma.$transaction(run, { maxWait: 10000, timeout: 30000 });
  }

  /**
   * المسار القديم المحمي (RV12): يرفض تجاوز الأرصدة المالية دون ترحيل بنكي موثق
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

        await tx.claim.update({
          where: { id: existingClaim.id },
          data: {
            status: newStatus,
            paidAmount: Money.toDbString(item.paidAmount),
            adjustmentAmount:
              item.adjustmentAmount != null
                ? Money.toDbString(item.adjustmentAmount)
                : undefined,
            adjustmentReason: item.adjustmentReason || item.adjustmentCode,
            denialCode: item.denialCode,
            denialReason: item.denialReason,
            paidAt: era.paymentDate,
          },
        });

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
  private determineClaimStatus(lineItemStatus: string): ClaimStatus {
    switch (lineItemStatus) {
      case 'DENIED':
        return ClaimStatus.REJECTED;
      case 'UNDERPAID':
        return ClaimStatus.PARTIALLY_PAID;
      case 'MATCHED':
        return ClaimStatus.PAID;
      default:
        return ClaimStatus.SUBMITTED;
    }
  }
}
