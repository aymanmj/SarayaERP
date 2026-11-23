import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ClaimStatus, Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import { NphiesClaimService } from '../integration/nphies/nphies-claim.service';
import { PrismaService } from '../prisma/prisma.service';
import { MONEY_INPUT_PATTERN } from './era-processing.service';

const UUID_V4_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export type AdjudicateClaimDecisionInput = {
  claimId: number;
  approvedAmount: number | string;
  denialCode?: string;
  denialReason?: string;
  adjustmentReason?: string;
};

export type AdjudicateClaimBatchInput = {
  requestId: string;
  paymentDate?: string;
  decisions: AdjudicateClaimDecisionInput[];
};

function parseNonNegativeMoney(
  value: number | string,
  fieldLabel: string,
): Prisma.Decimal {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!MONEY_INPUT_PATTERN.test(trimmed)) {
      throw new BadRequestException(`صيغة المبلغ غير صالحة في ${fieldLabel}`);
    }
    return Money.decimal(trimmed);
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`قيمة المبلغ غير صالحة في ${fieldLabel}`);
  }
  return Money.decimal(value);
}

const BATCH_INCLUDE = {
  provider: { select: { id: true, name: true, code: true } },
  adjudicatedBy: { select: { id: true, fullName: true, username: true } },
  eraTransaction: {
    select: { id: true, eraNumber: true, status: true, totalPaid: true },
  },
  gatewayFeeEntry: {
    select: {
      id: true,
      b2bInvoiceNumber: true,
      totalFeeAmount: true,
      flatFeeTotal: true,
      percentageFeeTotal: true,
      status: true,
      settlementBankReference: true,
    },
  },
  claims: {
    orderBy: { id: 'asc' as const },
    select: {
      id: true,
      claimNumber: true,
      status: true,
      claimedAmount: true,
      paidAmount: true,
      adjustmentAmount: true,
      denialCode: true,
      denialReason: true,
      externalClaimId: true,
      invoiceId: true,
    },
  },
} satisfies Prisma.ClaimBatchInclude;

/**
 * خدمة الدفعات التأمينية وغرفة المقاصة الوطنية الليبية
 */
@Injectable()
export class BatchSubmissionService {
  private readonly logger = new Logger(BatchSubmissionService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private nphiesClaimService?: NphiesClaimService,
    @Optional() private cls?: ClsService,
  ) {}

  listBatches(
    hospitalId: number,
    filters?: { providerId?: number; status?: string },
  ) {
    return this.prisma.claimBatch.findMany({
      where: {
        hospitalId,
        ...(filters?.providerId ? { providerId: filters.providerId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: BATCH_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async getBatchById(hospitalId: number, batchId: number) {
    const batch = await this.prisma.claimBatch.findFirst({
      where: { id: batchId, hospitalId },
      include: BATCH_INCLUDE,
    });
    if (!batch) {
      throw new NotFoundException('لم يتم العثور على دفعة المطالبات');
    }
    return batch;
  }

  /**
   * إنشاء دفعة جديدة من المطالبات المفحوصة (SCRUBBED) لشركة تأمين ضمن المنشأة.
   */
  async createBatch(
    providerId: number,
    maxClaims: number = 100,
    hospitalIdParam?: number,
  ) {
    const hospitalId = hospitalIdParam ?? this.cls?.get<number>('hospitalId');
    if (!hospitalId) {
      throw new BadRequestException('معرّف المستشفى غير متوفر في السياق');
    }

    const limit = Math.max(1, Math.min(200, Math.trunc(maxClaims || 100)));

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27008, ${hospitalId}::integer)`;

      const provider = await tx.insuranceProvider.findFirst({
        where: { id: providerId, hospitalId, isActive: true },
        select: { id: true },
      });
      if (!provider) {
        throw new NotFoundException(
          'شركة التأمين غير موجودة أو غير نشطة ضمن المنشأة',
        );
      }

      const readyClaims = await tx.claim.findMany({
        where: {
          hospitalId,
          status: ClaimStatus.SCRUBBED,
          batchId: null,
          invoice: {
            insuranceProviderId: providerId,
            OR: [
              { prepaidPrescription: null },
              {
                prepaidPrescription: {
                  status: { not: 'PARTIALLY_COMPLETED' },
                },
              },
            ],
          },
        },
        orderBy: { id: 'asc' },
        take: limit,
        include: {
          invoice: true,
        },
      });

      if (readyClaims.length === 0) {
        throw new BadRequestException(
          'لا توجد مطالبات مفحوصة (SCRUBBED) جاهزة لهذه الشركة',
        );
      }

      const totalAmount = Money.toDbString(
        Money.sumDecimal(...readyClaims.map((claim) => claim.claimedAmount)),
      );
      const batchNumber = `BATCH-${hospitalId}-${providerId}-${Date.now()}`;

      const batch = await tx.claimBatch.create({
        data: {
          hospitalId,
          providerId,
          batchNumber,
          clearingChannel: 'LOCAL_CLEARINGHOUSE',
          totalClaims: readyClaims.length,
          totalAmount,
          status: 'OPEN',
        },
      });

      await tx.claim.updateMany({
        where: {
          hospitalId,
          id: { in: readyClaims.map((c) => c.id) },
        },
        data: { batchId: batch.id },
      });

      return tx.claimBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: BATCH_INCLUDE,
      });
    });
  }

  /**
   * إرسال الدفعة إلى غرفة المقاصة الوطنية الليبية (LOCAL_CLEARINGHOUSE افتراضيًا)
   */
  async submitBatchToClearinghouse(
    batchId: number,
    userId: number,
    hospitalIdParam?: number,
    options?: {
      requestId?: string;
      channel?: 'LOCAL_CLEARINGHOUSE' | 'NPHIES';
    },
  ) {
    const hospitalId = hospitalIdParam ?? this.cls?.get<number>('hospitalId');
    if (!hospitalId) {
      throw new BadRequestException('معرّف المستشفى غير متوفر في السياق');
    }

    const channel = options?.channel ?? 'LOCAL_CLEARINGHOUSE';
    if (channel === 'NPHIES') {
      throw new BadRequestException(
        'تكامل نفيس (NPHIES) معلق مؤقتًا؛ استخدم غرفة المقاصة الوطنية الليبية (LOCAL_CLEARINGHOUSE)',
      );
    }

    if (
      options?.requestId != null &&
      !UUID_V4_PATTERN.test(options.requestId)
    ) {
      throw new BadRequestException('معرّف طلب الإرسال يجب أن يكون UUID v4');
    }

    const requestKey = options?.requestId
      ? `batch-submit:${hospitalId}:${batchId}:${options.requestId.toLowerCase()}`
      : null;

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(27008, ${hospitalId}::integer)`;

        const activeUser = await tx.user.findFirst({
          where: {
            id: userId,
            hospitalId,
            isActive: true,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (!activeUser) {
          throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
        }

        const locked = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM "ClaimBatch"
          WHERE id = ${batchId} AND "hospitalId" = ${hospitalId}
          FOR UPDATE
        `;
        if (locked.length === 0) {
          throw new NotFoundException('الدفعة غير موجودة');
        }

        const batch = await tx.claimBatch.findFirstOrThrow({
          where: { id: batchId, hospitalId },
          include: { claims: { orderBy: { id: 'asc' } } },
        });

        if (batch.status === 'SUBMITTED') {
          if (requestKey && batch.submissionRequestKey === requestKey) {
            return {
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              clearingChannel: batch.clearingChannel,
              status: batch.status,
              totalProcessed: batch.claims.length,
              successCount: batch.claims.length,
              failureCount: 0,
            };
          }
          throw new ConflictException('تم إرسال الدفعة مسبقاً');
        }

        if (batch.status !== 'OPEN') {
          throw new ConflictException('حالة الدفعة لا تسمح بالإرسال');
        }

        if (batch.claims.length === 0) {
          throw new BadRequestException('الدفعة لا تحتوي على مطالبات للإرسال');
        }

        if (batch.claims.some((c) => c.status !== ClaimStatus.SCRUBBED)) {
          throw new BadRequestException(
            'يلزم أن تكون جميع مطالبات الدفعة في حالة SCRUBBED قبل الإرسال',
          );
        }

        const submittedAt = new Date();
        for (const claim of batch.claims) {
          const externalClaimId = `LY-CLH-${batch.id}-${claim.id}`;
          await tx.claim.update({
            where: { id: claim.id },
            data: {
              status: ClaimStatus.SUBMITTED,
              submittedAt,
              externalClaimId,
            },
          });
          await tx.invoice.update({
            where: { id: claim.invoiceId },
            data: { claimStatus: 'SUBMITTED' },
          });
          await tx.claimHistory.create({
            data: {
              claimId: claim.id,
              fromStatus: claim.status,
              toStatus: ClaimStatus.SUBMITTED,
              changedById: userId,
              notes: `إرسال الدفعة ${batch.batchNumber} عبر غرفة المقاصة الوطنية (${externalClaimId})`,
            },
          });
        }

        await tx.claimBatch.update({
          where: { id: batch.id },
          data: {
            status: 'SUBMITTED',
            submittedAt,
            clearingChannel: 'LOCAL_CLEARINGHOUSE',
            submissionRequestKey: requestKey,
          },
        });

        await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId,
          entity: 'ClaimBatch',
          entityId: batch.id,
          action: 'SUBMIT_CLAIM_BATCH_CLEARINGHOUSE',
          details: {
            batchNumber: batch.batchNumber,
            clearingChannel: 'LOCAL_CLEARINGHOUSE',
            totalClaims: batch.claims.length,
            totalAmount: Money.toDbString(batch.totalAmount),
          },
        });

        this.logger.log(
          `📤 إرسال الدفعة ${batch.batchNumber} لغرفة المقاصة الوطنية: ${batch.claims.length} مطالبة`,
        );

        return {
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          clearingChannel: 'LOCAL_CLEARINGHOUSE',
          status: 'SUBMITTED',
          totalProcessed: batch.claims.length,
          successCount: batch.claims.length,
          failureCount: 0,
        };
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }

  /**
   * مسار قديم للتوافق؛ يوجّه لرفض NPHIES المعلّق مؤقتًا
   */
  submitBatchToNphies(
    batchId: number,
    userId: number,
    hospitalIdParam?: number,
  ) {
    return this.submitBatchToClearinghouse(batchId, userId, hospitalIdParam, {
      channel: 'NPHIES',
    });
  }

  /**
   * البت في دفعة مطالبات داخل بوابة الجهة الضامنة وتوليد إشعار ERA مالي آليًا للمحاسبة
   */
  async adjudicateBatchInClearinghouse(
    hospitalId: number,
    userId: number,
    batchId: number,
    input: AdjudicateClaimBatchInput,
  ) {
    if (!UUID_V4_PATTERN.test(input.requestId ?? '')) {
      throw new BadRequestException('يلزم معرف طلب بصيغة UUID v4 صالحة');
    }
    if (!Array.isArray(input.decisions) || input.decisions.length === 0) {
      throw new BadRequestException(
        'يلزم إدخال قرارات البت لجميع مطالبات الدفعة',
      );
    }

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : null;
    if (paymentDate && Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException('تاريخ الاستحقاق/الدفع غير صالح');
    }

    const requestKey = `batch-adjudicate:${hospitalId}:${batchId}:${input.requestId.toLowerCase()}`;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(27008, ${hospitalId}::integer)`;

          const activeUser = await tx.user.findFirst({
            where: {
              id: userId,
              hospitalId,
              isActive: true,
              isDeleted: false,
            },
            select: { id: true },
          });
          if (!activeUser) {
            throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
          }

          const lockedBatch = await tx.$queryRaw<Array<{ id: number }>>`
            SELECT id FROM "ClaimBatch"
            WHERE id = ${batchId} AND "hospitalId" = ${hospitalId}
            FOR UPDATE
          `;
          if (lockedBatch.length === 0) {
            throw new NotFoundException('الدفعة غير موجودة');
          }

          const batch = await tx.claimBatch.findFirstOrThrow({
            where: { id: batchId, hospitalId },
            include: {
              eraTransaction: {
                include: { lineItems: { orderBy: { id: 'asc' } } },
              },
              claims: {
                orderBy: { id: 'asc' },
                include: {
                  invoice: {
                    include: {
                      patient: { select: { fullName: true } },
                    },
                  },
                },
              },
            },
          });

          if (batch.status === 'CLOSED') {
            if (batch.adjudicationRequestKey === requestKey) {
              return {
                success: true,
                batchId: batch.id,
                batchNumber: batch.batchNumber,
                status: batch.status,
                approvedAmount: Money.toDbString(batch.approvedAmount ?? 0),
                rejectedClaimsCount: batch.rejectedClaimsCount,
                eraTransaction: batch.eraTransaction,
              };
            }
            throw new ConflictException('تمت مراجعة وإغلاق هذه الدفعة مسبقًا');
          }

          if (batch.status !== 'SUBMITTED') {
            throw new BadRequestException(
              'يلزم إرسال الدفعة إلى غرفة المقاصة قبل البت فيها',
            );
          }

          const decisionMap = new Map<number, AdjudicateClaimDecisionInput>();
          for (const d of input.decisions) {
            if (!Number.isInteger(d.claimId) || d.claimId <= 0) {
              throw new BadRequestException(
                'معرّف المطالبة في القرار غير صالح',
              );
            }
            if (decisionMap.has(d.claimId)) {
              throw new BadRequestException(
                `قرار مكرر لنفس المطالبة #${d.claimId}`,
              );
            }
            decisionMap.set(d.claimId, d);
          }

          if (decisionMap.size !== batch.claims.length) {
            throw new BadRequestException(
              'يجب أن تغطي القرارات جميع مطالبات الدفعة بالضبط',
            );
          }
          for (const claim of batch.claims) {
            if (!decisionMap.has(claim.id)) {
              throw new BadRequestException(
                `ينقص قرار البت للمطالبة #${claim.claimNumber}`,
              );
            }
            if (claim.status !== ClaimStatus.SUBMITTED) {
              throw new BadRequestException(
                `المطالبة #${claim.claimNumber} ليست بحالة مرسلة للبت فيها`,
              );
            }
          }

          await tx.$queryRaw`
            SELECT id FROM "Claim"
            WHERE "batchId" = ${batch.id} AND "hospitalId" = ${hospitalId}
            ORDER BY id
            FOR UPDATE
          `;

          const totalApprovedList: Prisma.Decimal[] = [];
          const totalAdjustmentList: Prisma.Decimal[] = [];
          let deniedCount = 0;

          const eraLines: Array<{
            claimId: number;
            claimNumber: string;
            patientName: string;
            billedAmount: string;
            allowedAmount: string;
            paidAmount: string;
            adjustmentAmount: string | null;
            adjustmentCode?: string;
            adjustmentReason?: string;
            denialCode?: string;
            denialReason?: string;
            status: string;
          }> = [];

          for (const claim of batch.claims) {
            const decision = decisionMap.get(claim.id)!;
            const approvedDec = parseNonNegativeMoney(
              decision.approvedAmount,
              `decisions[${claim.claimNumber}].approvedAmount`,
            );
            const claimedDec = Money.decimal(claim.claimedAmount);
            if (approvedDec.gt(claimedDec)) {
              throw new BadRequestException(
                `المبلغ المعتمد للمطالبة ${claim.claimNumber} يتجاوز قيمتها المطالب بها`,
              );
            }

            const adjustmentDec = Money.subtractDecimal(
              claimedDec,
              approvedDec,
            );
            const adjustmentStr = Money.toDbString(adjustmentDec);
            const approvedStr = Money.toDbString(approvedDec);
            const billedStr = Money.toDbString(claimedDec);

            totalApprovedList.push(approvedDec);
            totalAdjustmentList.push(adjustmentDec);

            if (approvedDec.isZero()) {
              const denialCode = (decision.denialCode ?? '').trim();
              if (denialCode.length < 2) {
                throw new BadRequestException(
                  `يلزم إدخال كود رفض لا يقل عن حرفين للمطالبة ${claim.claimNumber}`,
                );
              }
              const denialReason =
                (decision.denialReason ?? '').trim() ||
                'مرفوضة من لجنة المراجعة الطبية للجهة الضامنة';

              await tx.claim.update({
                where: { id: claim.id },
                data: {
                  status: ClaimStatus.REJECTED,
                  denialCode,
                  denialReason,
                  adjustmentReason: denialReason,
                },
              });
              await tx.invoice.update({
                where: { id: claim.invoiceId },
                data: { claimStatus: 'REJECTED' },
              });
              await tx.claimHistory.create({
                data: {
                  claimId: claim.id,
                  fromStatus: claim.status,
                  toStatus: ClaimStatus.REJECTED,
                  changedById: userId,
                  notes: `قرار المقاصة (${batch.batchNumber}): رفض (${denialCode}) - ${denialReason}`,
                },
              });
              deniedCount++;

              eraLines.push({
                claimId: claim.id,
                claimNumber: claim.claimNumber,
                patientName: claim.invoice.patient.fullName,
                billedAmount: billedStr,
                allowedAmount: '0.000',
                paidAmount: '0.000',
                adjustmentAmount: adjustmentStr,
                denialCode,
                denialReason,
                status: 'DENIED',
              });
            } else {
              const adjReason =
                (decision.adjustmentReason ?? '').trim() ||
                (adjustmentDec.isPositive()
                  ? 'فرق تسوية تعاقدي معتمد بالمقاصة'
                  : undefined);

              await tx.claim.update({
                where: { id: claim.id },
                data: {
                  status: ClaimStatus.ACCEPTED,
                  adjustmentReason: adjReason ?? null,
                },
              });
              await tx.claimHistory.create({
                data: {
                  claimId: claim.id,
                  fromStatus: claim.status,
                  toStatus: ClaimStatus.ACCEPTED,
                  changedById: userId,
                  notes: `اعتماد المقاصة (${batch.batchNumber}): المبلغ المعتمد ${approvedStr}`,
                },
              });

              eraLines.push({
                claimId: claim.id,
                claimNumber: claim.claimNumber,
                patientName: claim.invoice.patient.fullName,
                billedAmount: billedStr,
                allowedAmount: approvedStr,
                paidAmount: approvedStr,
                adjustmentAmount: adjustmentDec.isPositive()
                  ? adjustmentStr
                  : null,
                ...(adjustmentDec.isPositive()
                  ? { adjustmentCode: 'CO-45', adjustmentReason: adjReason }
                  : {}),
                status: approvedDec.lt(claimedDec) ? 'UNDERPAID' : 'MATCHED',
              });
            }
          }

          const totalApprovedStr = Money.toDbString(
            Money.sumDecimal(...totalApprovedList),
          );
          const totalAdjustmentsStr = Money.toDbString(
            Money.sumDecimal(...totalAdjustmentList),
          );
          const eraNumber = `ERA-CLH-${batch.id}`;

          const era = await tx.eRATransaction.create({
            data: {
              hospitalId,
              insuranceProviderId: batch.providerId,
              eraNumber,
              paymentDate,
              totalPaid: totalApprovedStr,
              totalClaims: batch.claims.length,
              totalAdjustments: totalAdjustmentsStr,
              status: 'PROCESSING',
              notes: `تم التوليد آليًا من مراجعة الدفعة ${batch.batchNumber}`,
              lineItems: { create: eraLines },
            },
            include: {
              lineItems: { orderBy: { id: 'asc' } },
            },
          });

          const adjudicatedAt = new Date();
          await tx.claimBatch.update({
            where: { id: batch.id },
            data: {
              status: 'CLOSED',
              closedAt: adjudicatedAt,
              adjudicatedAt,
              adjudicatedById: userId,
              adjudicationRequestKey: requestKey,
              eraTransactionId: era.id,
              approvedAmount: totalApprovedStr,
              rejectedClaimsCount: deniedCount,
            },
          });

          await appendChainedAuditInTransaction(tx, {
            hospitalId,
            userId,
            entity: 'ClaimBatch',
            entityId: batch.id,
            action: 'ADJUDICATE_CLAIM_BATCH_CLEARINGHOUSE',
            details: {
              batchNumber: batch.batchNumber,
              eraTransactionId: era.id,
              eraNumber: era.eraNumber,
              approvedAmount: totalApprovedStr,
              totalAdjustments: totalAdjustmentsStr,
              rejectedClaimsCount: deniedCount,
            },
          });

          return {
            success: true,
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            status: 'CLOSED',
            approvedAmount: totalApprovedStr,
            rejectedClaimsCount: deniedCount,
            eraTransaction: era,
          };
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'تمت مراجعة الدفعة أو إنشاء إشعار ERA مسبقًا',
        );
      }
      throw err;
    }
  }
}
