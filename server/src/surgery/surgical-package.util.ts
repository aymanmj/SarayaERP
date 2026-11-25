// server/src/surgery/surgical-package.util.ts
import { createHash } from 'node:crypto';
import { Money } from '../common/utils/money.util';

export type PackageCategory =
  | 'ROOM'
  | 'SURGERY'
  | 'ANESTHESIA'
  | 'LAB'
  | 'RADIOLOGY'
  | 'PHARMACY'
  | 'CONSUMABLES'
  | 'CONSULTATION'
  | 'PROCEDURE';

export type PackageCoverageMode =
  | 'INCLUDED_UNLIMITED'
  | 'INCLUDED_CAPPED'
  | 'EXCLUDED';

export interface PackageInclusionRule {
  category: PackageCategory;
  coverageMode: PackageCoverageMode;
  capAmount?: string | number | null;
}

export interface PackageChargeLine {
  category: PackageCategory;
  amount: string | number;
}

export interface PackageCategoryBreakdown {
  category: PackageCategory;
  coverageMode: PackageCoverageMode;
  capAmount: string | null;
  actualAmount: string;
  coveredAmount: string;
  overageAmount: string;
}

export interface PackageReconciliationResult {
  packagePrice: string;
  actualChargesTotal: string;
  coveredByPackageAmount: string;
  overageAmount: string;
  netBillableTotal: string;
  /** Positive variance means hospital billed more than actual itemized cost (margin); negative means cost overrun */
  packageVariance: string;
  breakdown: PackageCategoryBreakdown[];
}

/**
 * Maps SarayaERP ServiceType / ChargeSource into canonical CAP08 SurgicalPackage categories.
 */
export function mapChargeToPackageCategory(
  serviceType?: string | null,
  sourceType?: string | null,
): PackageCategory {
  const src = (sourceType ?? '').toUpperCase();
  const svc = (serviceType ?? '').toUpperCase();
  if (src === 'SURGERY' || svc === 'SURGERY') return 'SURGERY';
  if (src === 'LAB_ORDER' || svc === 'LAB') return 'LAB';
  if (src === 'RADIOLOGY_ORDER' || svc === 'RADIOLOGY') return 'RADIOLOGY';
  if (
    src === 'PHARMACY' ||
    src === 'PHARMACY_PRESCRIPTION' ||
    svc === 'PHARMACY'
  ) {
    return 'PHARMACY';
  }
  if (
    src === 'BED' ||
    src === 'BED_CHARGE' ||
    src === 'ICU' ||
    svc === 'BED' ||
    svc === 'ROOM'
  ) {
    return 'ROOM';
  }
  if (
    src === 'SURGERY_CONSUMABLE' ||
    src === 'CONSUMPTION' ||
    svc === 'SUPPLY' ||
    svc === 'CONSUMABLES'
  ) {
    return 'CONSUMABLES';
  }
  if (svc === 'ANESTHESIA') return 'ANESTHESIA';
  if (svc === 'PROCEDURE') return 'PROCEDURE';
  return 'CONSULTATION';
}

/**
 * Pure Money-Decimal DRG / Surgical Package Bundled Billing Reconciliation Engine:
 * - Aggregates actual charges per category
 * - Applies INCLUDED_UNLIMITED / INCLUDED_CAPPED / EXCLUDED rules (categories with no rule default to EXCLUDED)
 * - Computes exact overageAmount, netBillableTotal = packagePrice + overageAmount, and packageVariance
 */
export function reconcileSurgicalPackage(
  packagePriceInput: string | number,
  rules: PackageInclusionRule[],
  charges: PackageChargeLine[],
): PackageReconciliationResult {
  const pkgPriceDec = Money.roundDecimal(packagePriceInput, 3);
  const ruleMap = new Map<PackageCategory, PackageInclusionRule>();
  for (const r of rules) {
    ruleMap.set(r.category, r);
  }

  const actualByCategory = new Map<PackageCategory, string>();
  for (const ch of charges) {
    const prev = actualByCategory.get(ch.category) ?? '0.000';
    actualByCategory.set(
      ch.category,
      Money.toDbString(Money.sumPosted(prev, ch.amount)),
    );
  }

  const allCategories = new Set<PackageCategory>([
    ...ruleMap.keys(),
    ...actualByCategory.keys(),
  ]);

  let actualTotalDec = Money.decimal(0);
  let coveredTotalDec = Money.decimal(0);
  let overageTotalDec = Money.decimal(0);
  const breakdown: PackageCategoryBreakdown[] = [];

  for (const cat of [...allCategories].sort()) {
    const rule = ruleMap.get(cat);
    const mode: PackageCoverageMode = rule?.coverageMode ?? 'EXCLUDED';
    const actualDec = Money.roundDecimal(actualByCategory.get(cat) ?? 0, 3);
    let coveredDec = Money.decimal(0);
    let overageDec = Money.decimal(0);
    let capStr: string | null = null;

    if (mode === 'INCLUDED_UNLIMITED') {
      coveredDec = actualDec;
      overageDec = Money.decimal(0);
    } else if (mode === 'INCLUDED_CAPPED') {
      const capDec = Money.roundDecimal(rule?.capAmount ?? 0, 3);
      capStr = Money.toDbString(capDec);
      if (actualDec.lte(capDec)) {
        coveredDec = actualDec;
        overageDec = Money.decimal(0);
      } else {
        coveredDec = capDec;
        overageDec = Money.roundDecimal(
          Money.subtractDecimal(actualDec, capDec),
          3,
        );
      }
    } else {
      coveredDec = Money.decimal(0);
      overageDec = actualDec;
    }

    actualTotalDec = Money.sumPosted(actualTotalDec, actualDec);
    coveredTotalDec = Money.sumPosted(coveredTotalDec, coveredDec);
    overageTotalDec = Money.sumPosted(overageTotalDec, overageDec);

    breakdown.push({
      category: cat,
      coverageMode: mode,
      capAmount: capStr,
      actualAmount: Money.toDbString(actualDec),
      coveredAmount: Money.toDbString(coveredDec),
      overageAmount: Money.toDbString(overageDec),
    });
  }

  const netBillableDec = Money.sumPosted(pkgPriceDec, overageTotalDec);
  const varianceDec = Money.roundDecimal(
    Money.subtractDecimal(netBillableDec, actualTotalDec),
    3,
  );

  return {
    packagePrice: Money.toDbString(pkgPriceDec),
    actualChargesTotal: Money.toDbString(actualTotalDec),
    coveredByPackageAmount: Money.toDbString(coveredTotalDec),
    overageAmount: Money.toDbString(overageTotalDec),
    netBillableTotal: Money.toDbString(netBillableDec),
    packageVariance: Money.toDbString(varianceDec),
    breakdown,
  };
}

export function computePackageSettlementHash(payload: {
  hospitalId: number;
  enrollmentId: number;
  encounterId: number;
  packageId: number;
  packagePriceSnapshot: string;
  actualChargesTotal: string;
  overageAmount: string;
  netBillableTotal: string;
  settledById: number;
}): string {
  const canonical = [
    `h=${payload.hospitalId}`,
    `enr=${payload.enrollmentId}`,
    `enc=${payload.encounterId}`,
    `pkg=${payload.packageId}`,
    `price=${payload.packagePriceSnapshot}`,
    `act=${payload.actualChargesTotal}`,
    `ovg=${payload.overageAmount}`,
    `net=${payload.netBillableTotal}`,
    `by=${payload.settledById}`,
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export interface PackageInvoiceSplitInput {
  packagePrice: string | number;
  overageAmount: string | number;
  insuranceCoveragePercent?: number;
  coverOverage?: boolean;
  maxCoverageAmount?: string | number | null;
}

export interface PackageInvoiceSplitResult {
  netBillableTotal: string;
  insuranceShare: string;
  patientShare: string;
  appliedCoveragePercent: string;
}

/**
 * Pure Money-Decimal DRG Bundled Invoice Patient / Insurance Split Engine:
 * - Covers `packagePrice` (plus `overageAmount` only when `coverOverage === true`)
 *   at `insuranceCoveragePercent` (0..100), capped by `maxCoverageAmount` if provided.
 * - Guarantees `insuranceShare + patientShare === netBillableTotal` to exact 3dp (0.001).
 */
export function computePackageInvoiceSplit(
  input: PackageInvoiceSplitInput,
): PackageInvoiceSplitResult {
  const pkgDec = Money.roundDecimal(input.packagePrice, 3);
  const ovgDec = Money.roundDecimal(input.overageAmount, 3);
  const netDec = Money.roundDecimal(pkgDec.plus(ovgDec), 3);

  const rawPct = input.insuranceCoveragePercent ?? 0;
  const clampedPct = Math.max(0, Math.min(100, rawPct));
  const pctDec = Money.decimal(clampedPct);

  if (pctDec.lte(0) || netDec.lte(0)) {
    return {
      netBillableTotal: Money.toDbString(netDec),
      insuranceShare: '0.000',
      patientShare: Money.toDbString(netDec),
      appliedCoveragePercent: '0.000000',
    };
  }

  const eligibleBase = input.coverOverage ? netDec : pkgDec;
  let insDec = Money.roundDecimal(eligibleBase.times(pctDec).div(100), 3);

  if (
    input.maxCoverageAmount !== undefined &&
    input.maxCoverageAmount !== null
  ) {
    const capDec = Money.roundDecimal(input.maxCoverageAmount, 3);
    if (capDec.gte(0) && insDec.gt(capDec)) {
      insDec = capDec;
    }
  }
  if (insDec.gt(netDec)) {
    insDec = netDec;
  }

  const patDec = Money.roundDecimal(netDec.minus(insDec), 3);
  return {
    netBillableTotal: Money.toDbString(netDec),
    insuranceShare: Money.toDbString(insDec),
    patientShare: Money.toDbString(patDec),
    appliedCoveragePercent: Money.toRateDbString(pctDec),
  };
}
