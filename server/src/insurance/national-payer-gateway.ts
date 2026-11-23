import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money, type MoneyValue } from '../common/utils/money.util';
import { readCoverageBalance } from './coverage-balance';

export const MONEY_INPUT_PATTERN = /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/;
const UUID_V4_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export type NationalCoverageBalanceResult = {
  policyId: number;
  cap: string | null;
  usedAmount: string;
  remainingAmount: string | null;
  requiresReconciliation: boolean;
  mpiLinked: boolean;
  globalPatientId: number | null;
  linkedHospitalsCount: number;
  networkUsedAmount: string;
  otherHospitalsUsedAmount: string;
  networkRemainingAmount: string | null;
};

export type PayerPreAuthDecisionInput = {
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
  decisionReason: string;
  authCode?: string;
  approvedAmount?: number | string;
  expiresAt?: string;
};

type GatewayDb = Pick<
  Prisma.TransactionClient,
  'patient' | 'insuranceCoverageBalance' | 'invoice' | 'preAuthorization'
> & {
  $queryRaw: PrismaClient['$queryRaw'];
};

type LinkedCoverageRow = {
  hospitalId: number;
  insuranceMemberId: string | null;
  policyId: number | null;
  usedAmount: unknown;
  policyNumber: string | null;
};

function parseMoneyInput(
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

export async function readNationalPatientCoverage(
  db: GatewayDb,
  hospitalId: number,
  patientId: number,
): Promise<NationalCoverageBalanceResult | null> {
  const patient = await db.patient.findFirst({
    where: { id: patientId, hospitalId, isDeleted: false },
    select: {
      id: true,
      hospitalId: true,
      globalPatientId: true,
      insuranceMemberId: true,
      insurancePolicy: {
        select: {
          id: true,
          policyNumber: true,
          maxCoverageAmount: true,
          provider: { select: { id: true, hospitalId: true } },
        },
      },
    },
  });
  if (!patient) {
    throw new NotFoundException('المريض غير موجود');
  }
  const policy = patient.insurancePolicy;
  if (!policy || policy.provider.hospitalId !== hospitalId) {
    return null;
  }

  const localBalance = await readCoverageBalance(db, {
    hospitalId,
    patientId,
    policyId: policy.id,
    providerId: policy.provider.id,
    cap: policy.maxCoverageAmount,
  });

  if (patient.globalPatientId == null) {
    return {
      ...localBalance,
      mpiLinked: false,
      globalPatientId: null,
      linkedHospitalsCount: 1,
      networkUsedAmount: localBalance.usedAmount,
      otherHospitalsUsedAmount: '0.000',
      networkRemainingAmount: localBalance.remainingAmount,
    };
  }

  const linkedRows = await db.$queryRaw<LinkedCoverageRow[]>`
    SELECT
      p."hospitalId",
      p."insuranceMemberId",
      cb."policyId",
      cb."usedAmount",
      pol."policyNumber"
    FROM "Patient" p
    LEFT JOIN "InsuranceCoverageBalance" cb ON cb."patientId" = p.id
    LEFT JOIN "InsurancePolicy" pol ON pol.id = cb."policyId"
    WHERE p."globalPatientId" = ${patient.globalPatientId}::integer
      AND p."isDeleted" = false
  `;

  const localPolicyNumber = policy.policyNumber?.trim() || null;
  const localMemberId = patient.insuranceMemberId?.trim() || null;
  const hospitalSet = new Set<number>([hospitalId]);
  const usedSegments: MoneyValue[] = [];

  for (const row of linkedRows) {
    hospitalSet.add(Number(row.hospitalId));
    if (row.policyId == null || row.usedAmount == null) {
      continue;
    }
    const sameMember =
      localMemberId != null && row.insuranceMemberId?.trim() === localMemberId;
    const samePolicy = row.policyId === policy.id;
    const samePolicyNumber =
      localPolicyNumber != null &&
      row.policyNumber?.trim() === localPolicyNumber;
    if (samePolicy || samePolicyNumber || sameMember) {
      usedSegments.push(row.usedAmount as MoneyValue);
    }
  }

  const summedNetworkDec = Money.sumDecimal(...usedSegments);
  const localUsedDec = Money.decimal(localBalance.usedAmount);
  const networkUsedDec = summedNetworkDec.gt(localUsedDec)
    ? summedNetworkDec
    : localUsedDec;
  const otherHospitalsDec = Money.decimalMax(
    0,
    Money.subtractDecimal(networkUsedDec, localUsedDec),
  );
  const networkRemainingAmount =
    policy.maxCoverageAmount == null || localBalance.requiresReconciliation
      ? null
      : Money.toDbString(
          Money.decimalMax(
            0,
            Money.subtractDecimal(policy.maxCoverageAmount, networkUsedDec),
          ),
        );

  return {
    ...localBalance,
    mpiLinked: true,
    globalPatientId: patient.globalPatientId,
    linkedHospitalsCount: hospitalSet.size,
    networkUsedAmount: Money.toDbString(networkUsedDec),
    otherHospitalsUsedAmount: Money.toDbString(otherHospitalsDec),
    networkRemainingAmount,
  };
}

export async function listPayerPreAuthInbox(
  prisma: PrismaClient,
  hospitalId: number,
  filters?: { providerId?: number; status?: string },
) {
  const preAuths = await prisma.preAuthorization.findMany({
    where: {
      hospitalId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.providerId
        ? { policy: { insuranceProviderId: filters.providerId } }
        : {}),
    },
    include: {
      patient: {
        select: {
          id: true,
          mrn: true,
          fullName: true,
          globalPatientId: true,
          insuranceMemberId: true,
        },
      },
      policy: {
        include: {
          provider: { select: { id: true, name: true, code: true } },
        },
      },
      serviceItem: { select: { id: true, code: true, name: true, type: true } },
      reviewedBy: { select: { id: true, fullName: true, username: true } },
      attachments: {
        orderBy: [
          { retiredAt: { sort: 'asc', nulls: 'first' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        select: {
          id: true,
          category: true,
          title: true,
          originalFileName: true,
          contentType: true,
          sizeBytes: true,
          sha256: true,
          createdAt: true,
          retiredAt: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  const coverageCache = new Map<number, NationalCoverageBalanceResult | null>();
  for (const auth of preAuths) {
    if (!coverageCache.has(auth.patientId)) {
      const cov = await readNationalPatientCoverage(
        prisma,
        hospitalId,
        auth.patientId,
      );
      coverageCache.set(auth.patientId, cov);
    }
  }

  return preAuths.map((auth) => ({
    ...auth,
    mpiCoverage: coverageCache.get(auth.patientId) ?? null,
  }));
}

export async function reviewPayerPreAuth(
  prisma: PrismaClient,
  ctx: { hospitalId: number; userId: number; preAuthId: number },
  input: PayerPreAuthDecisionInput,
) {
  if (!UUID_V4_PATTERN.test(input.requestId ?? '')) {
    throw new BadRequestException('يلزم معرف طلب بصيغة UUID v4 صالحة');
  }
  if (input.decision !== 'APPROVED' && input.decision !== 'REJECTED') {
    throw new BadRequestException('قرار البت يجب أن يكون APPROVED أو REJECTED');
  }
  const decisionReason = (input.decisionReason ?? '').trim();
  if (decisionReason.length < 5 || decisionReason.length > 1000) {
    throw new BadRequestException(
      'يلزم تدوين مبررات القرار الطبي أو التأميني (5 إلى 1000 حرف)',
    );
  }
  const authCode = (input.authCode ?? '').trim();
  if (
    input.decision === 'APPROVED' &&
    (authCode.length < 3 || authCode.length > 100)
  ) {
    throw new BadRequestException(
      'رقم اعتماد الجهة الضامنة مطلوب عند الموافقة (3 إلى 100 حرف)',
    );
  }
  const parsedApprovedInput =
    input.approvedAmount != null && input.approvedAmount !== ''
      ? parseMoneyInput(input.approvedAmount, 'approvedAmount')
      : null;
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new BadRequestException('تاريخ انتهاء الموافقة غير صالح');
  }

  const requestKey = `payer-preauth-review:${ctx.hospitalId}:${ctx.preAuthId}:${input.requestId.toLowerCase()}`;

  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(27009, ${ctx.hospitalId}::integer)`;

        const activeUser = await tx.user.findFirst({
          where: {
            id: ctx.userId,
            hospitalId: ctx.hospitalId,
            isActive: true,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (!activeUser) {
          throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
        }

        const lockedRows = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM "PreAuthorization"
          WHERE id = ${ctx.preAuthId} AND "hospitalId" = ${ctx.hospitalId}
          FOR UPDATE
        `;
        if (lockedRows.length === 0) {
          throw new NotFoundException('طلب الموافقة المسبقة غير موجود');
        }

        const existing = await tx.preAuthorization.findFirstOrThrow({
          where: { id: ctx.preAuthId, hospitalId: ctx.hospitalId },
          include: {
            serviceItem: { select: { id: true, type: true } },
            policy: {
              include: { provider: { select: { id: true, name: true } } },
            },
          },
        });

        if (existing.status !== 'PENDING') {
          if (
            existing.reviewRequestKey === requestKey &&
            existing.status === input.decision
          ) {
            return existing;
          }
          throw new ConflictException('تم البت في طلب الموافقة المسبقة مسبقًا');
        }

        let approvedAmountStr: string | null = null;
        if (input.decision === 'APPROVED') {
          const effectiveApproved =
            parsedApprovedInput ??
            (existing.requestedAmount != null
              ? Money.decimal(existing.requestedAmount)
              : null);

          if (
            existing.requestedAmount != null &&
            effectiveApproved != null &&
            Money.gt(effectiveApproved, existing.requestedAmount)
          ) {
            throw new BadRequestException(
              'المبلغ المعتمد لا يمكن أن يتجاوز المبلغ المطلوب',
            );
          }

          if (
            (existing.requestedAmount != null &&
              Money.isPositive(existing.requestedAmount)) ||
            existing.serviceItem?.type === 'PHARMACY'
          ) {
            if (
              effectiveApproved == null ||
              !Money.isPositive(effectiveApproved)
            ) {
              throw new BadRequestException(
                'يلزم تحديد مبلغ اعتماد موجب لهذا الطلب',
              );
            }
          }

          if (effectiveApproved != null) {
            approvedAmountStr = Money.toDbString(effectiveApproved);
            const coverage = await readNationalPatientCoverage(
              tx,
              ctx.hospitalId,
              existing.patientId,
            );
            if (
              coverage &&
              coverage.policyId === existing.policyId &&
              coverage.networkRemainingAmount != null &&
              Money.gt(approvedAmountStr, coverage.networkRemainingAmount)
            ) {
              throw new BadRequestException(
                `المبلغ المعتمد يتجاوز سقف التغطية المتبقي عبر الشبكة الوطنية MPI (${coverage.networkRemainingAmount})`,
              );
            }
          }
        }

        const updated = await tx.preAuthorization.update({
          where: { id: existing.id },
          data: {
            status: input.decision,
            decisionReason,
            authCode: input.decision === 'APPROVED' ? authCode : null,
            approvedAmount:
              input.decision === 'APPROVED' ? approvedAmountStr : null,
            expiresAt: input.decision === 'APPROVED' ? expiresAt : null,
            reviewedById: ctx.userId,
            reviewedAt: new Date(),
            reviewRequestKey: requestKey,
          },
          include: {
            patient: {
              select: {
                id: true,
                mrn: true,
                fullName: true,
                globalPatientId: true,
                insuranceMemberId: true,
              },
            },
            policy: {
              include: {
                provider: { select: { id: true, name: true, code: true } },
              },
            },
            reviewedBy: {
              select: { id: true, fullName: true, username: true },
            },
          },
        });

        await appendChainedAuditInTransaction(tx, {
          hospitalId: ctx.hospitalId,
          userId: ctx.userId,
          entity: 'PreAuthorization',
          entityId: updated.id,
          action: 'PAYER_REVIEW_PREAUTH',
          details: {
            decision: input.decision,
            decisionReason,
            authCode: updated.authCode,
            approvedAmount: updated.approvedAmount
              ? Money.toDbString(updated.approvedAmount)
              : null,
            policyId: existing.policyId,
            providerId: existing.policy.insuranceProviderId,
          },
        });

        return updated;
      },
      { maxWait: 10000, timeout: 30000 },
    );
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException('تم استخدام معرف مراجعة الموافقة مسبقًا');
    }
    throw err;
  }
}
