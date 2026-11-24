// server/src/hr/hr-financial.util.ts
import { createHash } from 'node:crypto';
import { Money } from '../common/utils/money.util';

export type MoneyInput = Parameters<typeof Money.decimal>[0];

export type TerminationType =
  | 'RESIGNATION'
  | 'TERMINATION'
  | 'END_OF_CONTRACT'
  | 'RETIREMENT'
  | 'DISCIPLINARY'
  | 'PROBATION_FAILURE';

export type PayBasis = 'MONTHLY' | 'HOURLY' | 'FIXED_SHIFT';

export type OvertimeDayType = 'NORMAL' | 'WEEKEND' | 'HOLIDAY';

export interface TaxBracketRule {
  fromAmount: MoneyInput;
  toAmount?: MoneyInput;
  rate: MoneyInput;
  fixedAmount?: MoneyInput;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Computes progressive income tax across ordered brackets using 100% Money Decimal arithmetic.
 */
export function calculateProgressiveTax(
  taxableIncomeInput: MoneyInput,
  brackets: TaxBracketRule[],
): string {
  const taxableDec = Money.roundDecimal(taxableIncomeInput ?? 0, 3);
  if (!taxableDec.gt(0) || !brackets.length) {
    return '0.000';
  }
  const active = brackets
    .filter((b) => b.isActive !== false)
    .slice()
    .sort((a, b) => {
      const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return Money.decimal(a.fromAmount).cmp(Money.decimal(b.fromAmount));
    });

  let totalTax = Money.decimal(0);
  for (const bracket of active) {
    const from = Money.decimal(bracket.fromAmount ?? 0);
    const rawTo = bracket.toAmount;
    const to =
      rawTo !== null && rawTo !== undefined && Money.decimal(rawTo).gt(from)
        ? Money.decimal(rawTo)
        : null;
    const rate = Money.decimal(bracket.rate ?? 0);
    const fixed = Money.decimal(bracket.fixedAmount ?? 0);

    if (taxableDec.lte(from)) continue;
    const upperBound = to && taxableDec.gt(to) ? to : taxableDec;
    const slice = upperBound.minus(from);
    if (!slice.gt(0)) continue;

    const isTerminal = !to || taxableDec.lte(to);
    const bracketTax = slice.mul(rate).plus(isTerminal ? fixed : 0);
    totalTax = totalTax.plus(bracketTax);
  }
  return Money.toDbString(Money.roundDecimal(totalTax, 3));
}

/**
 * Computes duration in hours between "HH:mm" start & end (supports overnight shifts e.g. 20:00 -> 08:00 = 12h).
 */
export function computeShiftDurationHours(
  startTime: string,
  endTime: string,
): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (
    !Number.isFinite(sh) ||
    !Number.isFinite(sm) ||
    !Number.isFinite(eh) ||
    !Number.isFinite(em)
  ) {
    return 8;
  }
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

/**
 * Resolves FIXED_SHIFT rate (6h / 12h / 24h) for hospital nursing/ER shift-based pay.
 */
export function resolveFixedShiftRate(
  shiftHours: number,
  rates: {
    fixedShift6hRate: MoneyInput;
    fixedShift12hRate: MoneyInput;
    fixedShift24hRate: MoneyInput;
  },
): string {
  const r6 = Money.decimal(rates.fixedShift6hRate ?? 0);
  const r12 = Money.decimal(rates.fixedShift12hRate ?? 0);
  const r24 = Money.decimal(rates.fixedShift24hRate ?? 0);

  if (shiftHours > 16 && r24.gt(0)) {
    return Money.toDbString(Money.roundDecimal(r24, 3));
  }
  if (shiftHours > 8 && r12.gt(0)) {
    return Money.toDbString(Money.roundDecimal(r12, 3));
  }
  if (r6.gt(0)) {
    return Money.toDbString(Money.roundDecimal(r6, 3));
  }
  if (r12.gt(0)) {
    return Money.toDbString(Money.roundDecimal(r12, 3));
  }
  if (r24.gt(0)) {
    return Money.toDbString(Money.roundDecimal(r24, 3));
  }
  return '0.000';
}

export const OVERTIME_DEFAULT_MULTIPLIERS: Record<OvertimeDayType, string> = {
  NORMAL: '1.500',
  WEEKEND: '2.000',
  HOLIDAY: '2.500',
};

export interface AdvanceScheduleResult {
  amount: string;
  installments: number;
  monthlyDeduction: string;
}

export function computeAdvanceSchedule(
  amountInput: MoneyInput,
  installments: number,
): AdvanceScheduleResult {
  const amountDec = Money.roundDecimal(amountInput, 3);
  if (!amountDec.gt(0)) {
    throw new Error('Advance amount must be positive');
  }
  if (
    !Number.isInteger(installments) ||
    installments < 1 ||
    installments > 120
  ) {
    throw new Error('Installments must be an integer between 1 and 120');
  }
  const monthlyDec = Money.roundDecimal(
    Money.divide(amountDec, installments),
    3,
  );
  return {
    amount: Money.toDbString(amountDec),
    installments,
    monthlyDeduction: Money.toDbString(monthlyDec),
  };
}

export interface EndOfServiceInput {
  basicSalary: MoneyInput;
  hireDate: Date;
  effectiveDate: Date;
  terminationType: TerminationType;
  unusedAnnualLeaveDays: MoneyInput;
  activeAdvancesTotal: MoneyInput;
  otherAdditions?: MoneyInput;
  otherDeductions?: MoneyInput;
}

export interface EndOfServiceCalculation {
  serviceYears: string;
  serviceMonths: number;
  serviceDays: number;
  basicSalary: string;
  dailyRate: string;
  lastMonthDays: number;
  lastMonthAmount: string;
  leaveDaysUnused: string;
  leaveCompensationAmount: string;
  gratuityMultiplier: string;
  gratuityAmount: string;
  otherAdditions: string;
  totalEarnings: string;
  advancesDeduction: string;
  otherDeductions: string;
  totalDeductions: string;
  netAmount: string;
}

/**
 * Pure Money-Decimal End-of-Service Indemnity Calculator (Libyan / Regional Labor Law standard,
 * harmonized with SarayaManager SettlementsService and upgraded to 100% Decimal arithmetic).
 *
 * Gratuity base:
 * - < 1 year: 0
 * - 1..5 years: 0.5 month basic salary per year of service
 * - > 5 years: 2.5 months + 1.0 month basic salary per year beyond 5
 *
 * Termination multiplier:
 * - TERMINATION / END_OF_CONTRACT / RETIREMENT: 1.0 (full)
 * - RESIGNATION: <2y = 0, 2..5y = 1/3, 5..10y = 2/3, >=10y = 1.0
 * - DISCIPLINARY / PROBATION_FAILURE: 0
 */
export function calculateEndOfService(
  input: EndOfServiceInput,
): EndOfServiceCalculation {
  const basicDec = Money.roundDecimal(input.basicSalary ?? 0, 3);
  const dailyRateUnrounded = Money.divide(basicDec, 30);
  const dailyRateDec = Money.roundDecimal(dailyRateUnrounded, 3);

  const hire = new Date(input.hireDate);
  const eff = new Date(input.effectiveDate);

  let years = eff.getUTCFullYear() - hire.getUTCFullYear();
  let months = eff.getUTCMonth() - hire.getUTCMonth();
  let days = eff.getUTCDate() - hire.getUTCDate();

  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(
      Date.UTC(eff.getUTCFullYear(), eff.getUTCMonth(), 0),
    ).getUTCDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  years = Math.max(0, years);
  months = Math.max(0, months);
  days = Math.max(0, days);

  // Exact Decimal serviceYears = years + months/12 + days/365.25 rounded to 3dp
  const serviceYearsDec = Money.roundDecimal(
    Money.decimal(years)
      .plus(Money.divide(months, 12))
      .plus(Money.divide(days, '365.25')),
    3,
  );

  // Prorated last-month salary
  const lastMonthDays = Math.min(30, Math.max(1, eff.getUTCDate()));
  const lastMonthAmountDec = Money.roundDecimal(
    Money.multiply(lastMonthDays, dailyRateUnrounded),
    3,
  );

  // Unused annual leave encashment
  const leaveDaysDec = Money.roundDecimal(
    Money.decimal(input.unusedAnnualLeaveDays ?? 0).gt(0)
      ? input.unusedAnnualLeaveDays
      : 0,
    3,
  );
  const leaveCompDec = Money.roundDecimal(
    Money.multiply(leaveDaysDec, dailyRateUnrounded),
    3,
  );

  // Raw gratuity before termination-type multiplier
  let rawGratuityDec = Money.decimal(0);
  if (serviceYearsDec.gte(1)) {
    if (serviceYearsDec.lte(5)) {
      rawGratuityDec = Money.multiply(basicDec, '0.5').mul(serviceYearsDec);
    } else {
      rawGratuityDec = Money.multiply(basicDec, '2.5').plus(
        serviceYearsDec.minus(5).mul(basicDec),
      );
    }
  }

  let multiplierDec = Money.decimal(1);
  if (input.terminationType === 'RESIGNATION') {
    if (serviceYearsDec.lt(2)) {
      multiplierDec = Money.decimal(0);
    } else if (serviceYearsDec.lt(5)) {
      multiplierDec = Money.divide(1, 3);
    } else if (serviceYearsDec.lt(10)) {
      multiplierDec = Money.divide(2, 3);
    } else {
      multiplierDec = Money.decimal(1);
    }
  } else if (
    input.terminationType === 'DISCIPLINARY' ||
    input.terminationType === 'PROBATION_FAILURE'
  ) {
    multiplierDec = Money.decimal(0);
  }

  const gratuityDec = Money.roundDecimal(rawGratuityDec.mul(multiplierDec), 3);

  const otherAddDec = Money.roundDecimal(input.otherAdditions ?? 0, 3);
  const advancesDedDec = Money.roundDecimal(input.activeAdvancesTotal ?? 0, 3);
  const otherDedDec = Money.roundDecimal(input.otherDeductions ?? 0, 3);

  const totalEarningsDec = Money.sumPosted(
    lastMonthAmountDec,
    leaveCompDec,
    gratuityDec,
    otherAddDec,
  );
  const totalDeductionsDec = Money.sumPosted(advancesDedDec, otherDedDec);
  const netAmountDec = Money.roundDecimal(
    Money.subtractDecimal(totalEarningsDec, totalDeductionsDec),
    3,
  );

  return {
    serviceYears: Money.toDbString(serviceYearsDec),
    serviceMonths: months,
    serviceDays: days,
    basicSalary: Money.toDbString(basicDec),
    dailyRate: Money.toDbString(dailyRateDec),
    lastMonthDays,
    lastMonthAmount: Money.toDbString(lastMonthAmountDec),
    leaveDaysUnused: Money.toDbString(leaveDaysDec),
    leaveCompensationAmount: Money.toDbString(leaveCompDec),
    gratuityMultiplier: Money.toDbString(Money.roundDecimal(multiplierDec, 3)),
    gratuityAmount: Money.toDbString(gratuityDec),
    otherAdditions: Money.toDbString(otherAddDec),
    totalEarnings: Money.toDbString(totalEarningsDec),
    advancesDeduction: Money.toDbString(advancesDedDec),
    otherDeductions: Money.toDbString(otherDedDec),
    totalDeductions: Money.toDbString(totalDeductionsDec),
    netAmount: Money.toDbString(netAmountDec),
  };
}

export function computeSettlementSignatureHash(payload: {
  hospitalId: number;
  settlementId: number;
  settlementNo: string;
  userId: number;
  terminationType: string;
  effectiveDateIso: string;
  totalEarnings: string;
  totalDeductions: string;
  netAmount: string;
  approvedById: number;
}): string {
  const canonical = [
    `h=${payload.hospitalId}`,
    `id=${payload.settlementId}`,
    `no=${payload.settlementNo}`,
    `u=${payload.userId}`,
    `type=${payload.terminationType}`,
    `eff=${payload.effectiveDateIso}`,
    `earn=${payload.totalEarnings}`,
    `ded=${payload.totalDeductions}`,
    `net=${payload.netAmount}`,
    `app=${payload.approvedById}`,
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
