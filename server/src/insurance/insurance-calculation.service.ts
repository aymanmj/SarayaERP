// src/insurance/insurance-calculation.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CopayType,
  CoverageRuleType,
  CoverageRule,
  Prisma,
} from '@prisma/client';
import { Money, type MoneyValue } from '../common/utils/money.util';

export type CoverageResult = {
  covered: boolean;
  patientShare: number;
  insuranceShare: number;
  requiresPreAuth: boolean;
  preAuthCode?: string;
  reason?: string;
  ruleApplied?: string;
  contractedPrice?: number;
};

@Injectable()
export class InsuranceCalculationService {
  constructor(private prisma: PrismaService) {}

  async calculateCoverage(
    patientId: number,
    serviceItemId: number,
    servicePrice: number,
    options?: {
      preserveServicePrice?: boolean;
      benefitUnits?: string | number;
    },
  ): Promise<CoverageResult> {
    const result = await calculateCoverageExact(
      this.prisma,
      patientId,
      serviceItemId,
      servicePrice,
      options,
    );
    return {
      covered: result.covered,
      patientShare: Money.toDb(result.patientShare),
      insuranceShare: Money.toDb(result.insuranceShare),
      requiresPreAuth: result.requiresPreAuth,
      preAuthCode: result.preAuthCode,
      reason: result.reason,
      ruleApplied: result.ruleApplied,
      contractedPrice:
        result.contractedPrice === undefined
          ? undefined
          : Money.toDb(result.contractedPrice),
    };
  }
}

function percentageShare(amount: MoneyValue, rate: MoneyValue) {
  const decimal = Money.decimal(rate);
  return Money.toDbString(
    Money.decimal(amount).times(decimal.gt(1) ? decimal.div(100) : decimal),
  );
}

export async function calculateCoverageExact(
  db: Pick<
    Prisma.TransactionClient,
    'patient' | 'serviceItem' | 'priceListItem' | 'preAuthorization'
  >,
  patientId: number,
  serviceItemId: number,
  servicePrice: MoneyValue,
  options?: {
    preserveServicePrice?: boolean;
    benefitUnits?: string | number;
    deferPreAuth?: boolean;
  },
): Promise<
  Omit<
    CoverageResult,
    'patientShare' | 'insuranceShare' | 'contractedPrice'
  > & {
    patientShare: string;
    insuranceShare: string;
    contractedPrice?: string;
    policyId?: number;
    providerId?: number;
    maxCoverageAmount?: string | null;
  }
> {
  // 1. جلب بيانات المريض والبوليصة والخطة
  const effectiveServiceItemId = serviceItemId;
  const effectiveServicePrice = servicePrice;
  const effectiveOptions = options;
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    include: {
      insurancePolicy: {
        include: {
          provider: true,
          plan: {
            include: {
              rules: true,
            },
          },
        },
      },
    },
  });

  // جلب تفاصيل الخدمة
  const serviceItem = await db.serviceItem.findUnique({
    where: { id: effectiveServiceItemId },
    include: { category: true },
  });

  // --- الحالة 0: مريض نقدي (لا يوجد تأمين أو البوليصة غير نشطة/منتهية/خارج المنشأة) ---
  const policy = patient?.insurancePolicy;
  const now = new Date();
  const isNotStartedYet =
    policy?.startDate != null && new Date(policy.startDate) > now;
  const isExpired = policy?.endDate != null && new Date(policy.endDate) < now;
  const isProviderInactive = policy?.provider?.isActive === false;
  const isTenantMismatch =
    (patient && serviceItem && patient.hospitalId !== serviceItem.hospitalId) ||
    (patient &&
      policy?.provider &&
      policy.provider.hospitalId !== patient.hospitalId) ||
    (policy?.plan && policy.plan.providerId !== policy.insuranceProviderId);

  if (
    !policy ||
    !policy.isActive ||
    isNotStartedYet ||
    isExpired ||
    isProviderInactive ||
    isTenantMismatch
  ) {
    return {
      covered: false,
      patientShare: Money.toDbString(effectiveServicePrice),
      insuranceShare: '0.000',
      requiresPreAuth: false,
      reason: isTenantMismatch
        ? 'Tenant mismatch between patient, policy, or service'
        : isProviderInactive
          ? 'Insurance provider is inactive'
          : isNotStartedYet
            ? 'Insurance policy has not started yet'
            : isExpired
              ? 'Insurance policy has expired'
              : 'Patient has no active insurance policy',
      ruleApplied: 'CASH_PATIENT',
    };
  }

  const plan = policy.plan;

  const coveragePolicy = {
    policyId: policy.id,
    providerId: policy.insuranceProviderId,
    maxCoverageAmount:
      policy.maxCoverageAmount == null
        ? null
        : Money.toDbString(policy.maxCoverageAmount),
  };
  let finalServicePrice = Money.toDbString(effectiveServicePrice);
  if (policy.priceListId && !effectiveOptions?.preserveServicePrice) {
    const contractItem = await db.priceListItem.findFirst({
      where: {
        priceListId: policy.priceListId,
        serviceItemId: effectiveServiceItemId,
      },
    });
    if (contractItem) {
      finalServicePrice = Money.toDbString(contractItem.price);
    }
  }

  // --- الحالة 1: بوليصة بدون خطة (Legacy) ---
  if (!plan) {
    const patientShare = percentageShare(
      finalServicePrice,
      policy.patientCopayRate,
    );
    return {
      covered: true,
      patientShare,
      insuranceShare: Money.toDbString(
        Money.subtractDecimal(finalServicePrice, patientShare),
      ),
      ...coveragePolicy,
      requiresPreAuth: false,
      ruleApplied: 'LEGACY_POLICY_RATE',
      contractedPrice: !Money.eq(finalServicePrice, servicePrice)
        ? finalServicePrice
        : undefined,
    };
  }

  // --- الحالة 2: المحرك الذكي ---
  let appliedRule: CoverageRule | null | undefined = null;

  // البحث عن قاعدة للخدمة مباشرة
  const itemRule = plan.rules.find(
    (r) => r.serviceItemId === effectiveServiceItemId,
  );

  // البحث عن قاعدة للفئة
  const categoryRule =
    !itemRule && serviceItem?.categoryId
      ? plan.rules.find((r) => r.serviceCategoryId === serviceItem.categoryId)
      : null;

  appliedRule = itemRule || categoryRule;

  // أ) هل الخدمة مستثناة؟
  if (appliedRule && appliedRule.ruleType === CoverageRuleType.EXCLUSION) {
    return {
      covered: false,
      patientShare: finalServicePrice,
      insuranceShare: '0.000',
      ...coveragePolicy,
      requiresPreAuth: false,
      reason: 'Service is excluded in the insurance plan',
      ruleApplied: `EXCLUSION_${appliedRule.id}`,
      contractedPrice: !Money.eq(finalServicePrice, servicePrice)
        ? finalServicePrice
        : undefined,
    };
  }

  // ب) حساب التحمل (Copay) باستخدام Money Utility
  const benefitUnits = effectiveOptions?.preserveServicePrice
    ? Money.decimal(options?.benefitUnits ?? 1)
    : Money.decimal(1);
  if (!benefitUnits.isPositive() || benefitUnits.gt(1))
    throw new Error('Invalid prorated benefit units');
  let patientShare: string;

  if (appliedRule) {
    const val = appliedRule.copayValue;
    if (appliedRule.copayType === CopayType.PERCENTAGE) {
      patientShare = percentageShare(finalServicePrice, val);
    } else {
      patientShare = Money.toDbString(Money.decimal(val).times(benefitUnits));
    }
  } else {
    // القاعدة الافتراضية
    patientShare = percentageShare(finalServicePrice, plan.defaultCopayRate);
  }

  // ج) سقف التحمل
  if (plan.maxCopayAmount) {
    const maxCopay = Money.toDbString(
      Money.decimal(plan.maxCopayAmount).times(benefitUnits),
    );
    if (Money.gt(patientShare, maxCopay)) {
      patientShare = maxCopay;
    }
  }

  // التأكد من عدم تجاوز سعر الخدمة
  if (Money.gt(patientShare, finalServicePrice)) {
    patientShare = finalServicePrice;
  }

  const insuranceShare = Money.toDbString(
    Money.subtractDecimal(finalServicePrice, patientShare),
  );

  // د) الموافقة المسبقة
  let requiresPreAuth = appliedRule?.requiresApproval ?? false;
  let preAuthCode: string | undefined = undefined;

  if (requiresPreAuth && !options?.deferPreAuth) {
    const validAuth = await db.preAuthorization.findFirst({
      where: {
        ...(patient?.hospitalId ? { hospitalId: patient.hospitalId } : {}),
        patientId: patientId,
        policyId: policy.id,
        serviceItemId: effectiveServiceItemId,
        prescription: null,
        isPrescriptionRequest: false,
        status: 'APPROVED',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (validAuth) {
      requiresPreAuth = false;
      preAuthCode = validAuth.authCode ?? undefined;
    }
  }

  return {
    covered: true,
    ...coveragePolicy,
    patientShare,
    insuranceShare,
    requiresPreAuth,
    preAuthCode,
    ruleApplied: appliedRule ? `RULE_${appliedRule.id}` : 'PLAN_DEFAULT',
    contractedPrice: !Money.eq(finalServicePrice, servicePrice)
      ? finalServicePrice
      : undefined,
  };
}
