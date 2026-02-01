// src/insurance/insurance-calculation.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// ✅ إضافة الـ Imports الضرورية من Prisma Client
import { CopayType, CoverageRuleType, CoverageRule } from '@prisma/client';
import { Money } from '../common/utils/money.util'; // ✅ [NEW]

export type CoverageResult = {
  covered: boolean;
  patientShare: number;
  insuranceShare: number;
  requiresPreAuth: boolean;
  preAuthCode?: string;
  reason?: string;
  ruleApplied?: string;
};

@Injectable()
export class InsuranceCalculationService {
  private readonly logger = new Logger(InsuranceCalculationService.name);

  constructor(private prisma: PrismaService) {}

  async calculateCoverage(
    patientId: number,
    serviceItemId: number,
    servicePrice: number,
  ): Promise<CoverageResult> {
    // 1. جلب بيانات المريض والبوليصة والخطة
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        insurancePolicy: {
          include: {
            plan: {
              include: {
                rules: true, // جلب القواعد
              },
            },
          },
        },
      },
    });

    // جلب تفاصيل الخدمة
    const serviceItem = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
      include: { category: true },
    });

    // --- الحالة 0: مريض نقدي (لا يوجد تأمين) ---
    if (!patient?.insurancePolicy || !patient.insurancePolicy.isActive) {
      return {
        covered: false,
        patientShare: Money.toDb(servicePrice),
        insuranceShare: 0,
        requiresPreAuth: false,
        reason: 'Patient has no active insurance policy',
        ruleApplied: 'CASH_PATIENT',
      };
    }

    const policy = patient.insurancePolicy;
    const plan = policy.plan;

    // --- الحالة 1: بوليصة بدون خطة (Legacy) ---
    if (!plan) {
      const copayRate = Money.fromPrisma(policy.patientCopayRate);
      const patientShare = Money.rate(servicePrice, copayRate);
      return {
        covered: true,
        patientShare: Money.toDb(patientShare),
        insuranceShare: Money.toDb(Money.sub(servicePrice, patientShare)),
        requiresPreAuth: false,
        ruleApplied: 'LEGACY_POLICY_RATE',
      };
    }

    // --- الحالة 2: المحرك الذكي ---

    // ✅ تعريف المتغير بنوع صريح لتجنب مشاكل TypeScript
    let appliedRule: CoverageRule | null | undefined = null;

    // البحث عن قاعدة للخدمة مباشرة
    const itemRule = plan.rules.find((r) => r.serviceItemId === serviceItemId);

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
        patientShare: Money.toDb(servicePrice),
        insuranceShare: 0,
        requiresPreAuth: false,
        reason: 'Service is excluded in the insurance plan',
        ruleApplied: `EXCLUSION_${appliedRule.id}`,
      };
    }

    // ب) حساب التحمل (Copay) باستخدام Money Utility
    let patientShare = 0;

    if (appliedRule) {
      const val = Money.fromPrisma(appliedRule.copayValue);
      if (appliedRule.copayType === CopayType.PERCENTAGE) {
        patientShare = Money.rate(servicePrice, val);
      } else {
        patientShare = val;
      }
    } else {
      // القاعدة الافتراضية
      const defaultRate = Money.fromPrisma(plan.defaultCopayRate);
      patientShare = Money.rate(servicePrice, defaultRate);
    }

    // ج) سقف التحمل
    if (plan.maxCopayAmount) {
      const maxCopay = Money.fromPrisma(plan.maxCopayAmount);
      if (Money.gt(patientShare, maxCopay)) {
        patientShare = maxCopay;
      }
    }

    // التأكد من عدم تجاوز سعر الخدمة
    if (Money.gt(patientShare, servicePrice)) {
      patientShare = servicePrice;
    }

    const insuranceShare = Money.sub(servicePrice, patientShare);

    // د) الموافقة المسبقة
    let requiresPreAuth = appliedRule?.requiresApproval ?? false;
    let preAuthCode: string | undefined = undefined;

    if (requiresPreAuth) {
      const validAuth = await this.prisma.preAuthorization.findFirst({
        where: {
          patientId: patientId,
          policyId: policy.id,
          serviceItemId: serviceItemId,
          status: 'APPROVED',
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
      patientShare: Money.toDb(patientShare),
      insuranceShare: Money.toDb(insuranceShare),
      requiresPreAuth,
      preAuthCode,
      ruleApplied: appliedRule ? `RULE_${appliedRule.id}` : 'PLAN_DEFAULT',
    };
  }
}

