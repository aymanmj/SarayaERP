// server/src/nursing/five-rights.util.ts
import { Money } from '../common/utils/money.util';

export type VerificationScope =
  | 'MANUAL'
  | 'PATIENT_AND_DRUG'
  | 'FULL_FIVE_RIGHTS';

export type TimeWindowStatus = 'ON_TIME' | 'EARLY' | 'LATE' | 'UNSCHEDULED';

export interface FiveRightsEvaluation {
  isPatientMatch: boolean;
  isDrugMatch: boolean;
  isBarcodeMatch: boolean;
  isDoseMatch: boolean | null;
  isRouteMatch: boolean | null;
  isTimeWindowMatch: boolean | null;
  timeVarianceMinutes: number | null;
  timeWindowStatus: TimeWindowStatus;
  verificationScope: VerificationScope;
  isVerified5Rights: boolean;
  mismatchReasons: string[];
}

export const DEFAULT_TIME_WINDOW_MINUTES = 60;

const ROUTE_ALIASES: Readonly<Record<string, string>> = {
  PO: 'ORAL',
  ORAL: 'ORAL',
  'BY MOUTH': 'ORAL',
  'PER OS': 'ORAL',
  فموي: 'ORAL',
  'عن طريق الفم': 'ORAL',
  IV: 'IV',
  'I.V': 'IV',
  'I.V.': 'IV',
  INTRAVENOUS: 'IV',
  'IV PUSH': 'IV',
  'IV INFUSION': 'IV',
  وريدي: 'IV',
  IM: 'IM',
  'I.M': 'IM',
  'I.M.': 'IM',
  INTRAMUSCULAR: 'IM',
  عضلي: 'IM',
  SC: 'SC',
  SQ: 'SC',
  SUBQ: 'SC',
  SUBCUT: 'SC',
  SUBCUTANEOUS: 'SC',
  'تحت الجلد': 'SC',
  SL: 'SL',
  SUBLINGUAL: 'SL',
  'تحت اللسان': 'SL',
  TOP: 'TOPICAL',
  TOPICAL: 'TOPICAL',
  موضعي: 'TOPICAL',
  INH: 'INHALATION',
  INHALATION: 'INHALATION',
  NEB: 'INHALATION',
  NEBULIZER: 'INHALATION',
  استنشاق: 'INHALATION',
  PR: 'RECTAL',
  RECTAL: 'RECTAL',
  شرجي: 'RECTAL',
  OPHTH: 'OPHTHALMIC',
  OPHTHALMIC: 'OPHTHALMIC',
  EYE: 'OPHTHALMIC',
  عيني: 'OPHTHALMIC',
  OTIC: 'OTIC',
  EAR: 'OTIC',
  أذني: 'OTIC',
  NG: 'NG',
  NGT: 'NG',
  NASOGASTRIC: 'NG',
};

const UNIT_CONVERSIONS: Readonly<
  Record<string, { dimension: string; factor: string }>
> = {
  mcg: { dimension: 'mass', factor: '0.001' },
  ug: { dimension: 'mass', factor: '0.001' },
  µg: { dimension: 'mass', factor: '0.001' },
  mg: { dimension: 'mass', factor: '1' },
  g: { dimension: 'mass', factor: '1000' },
  gm: { dimension: 'mass', factor: '1000' },
  gram: { dimension: 'mass', factor: '1000' },
  grams: { dimension: 'mass', factor: '1000' },
  ml: { dimension: 'volume', factor: '1' },
  cc: { dimension: 'volume', factor: '1' },
  l: { dimension: 'volume', factor: '1000' },
  iu: { dimension: 'unit', factor: '1' },
  u: { dimension: 'unit', factor: '1' },
  unit: { dimension: 'unit', factor: '1' },
  units: { dimension: 'unit', factor: '1' },
  tab: { dimension: 'count', factor: '1' },
  tabs: { dimension: 'count', factor: '1' },
  tablet: { dimension: 'count', factor: '1' },
  tablets: { dimension: 'count', factor: '1' },
  cap: { dimension: 'count', factor: '1' },
  caps: { dimension: 'count', factor: '1' },
  capsule: { dimension: 'count', factor: '1' },
  capsules: { dimension: 'count', factor: '1' },
  amp: { dimension: 'ampoule', factor: '1' },
  ampoule: { dimension: 'ampoule', factor: '1' },
  vial: { dimension: 'vial', factor: '1' },
  puff: { dimension: 'puff', factor: '1' },
  puffs: { dimension: 'puff', factor: '1' },
  drop: { dimension: 'drop', factor: '1' },
  drops: { dimension: 'drop', factor: '1' },
};

function parseClinicalDose(raw: string): {
  dimension: string;
  canonicalValue: ReturnType<typeof Money.decimal>;
} | null {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Zµ]+)?$/);
  if (!match) return null;
  const numStr = match[1];
  const unitKey = (match[2] ?? '').toLowerCase();
  if (!unitKey) {
    return { dimension: 'scalar', canonicalValue: Money.decimal(numStr) };
  }
  const conv = UNIT_CONVERSIONS[unitKey];
  if (!conv) return null;
  return {
    dimension: conv.dimension,
    canonicalValue: Money.decimal(numStr).times(conv.factor),
  };
}

/**
 * Right #3 — Clinical Dose Comparison:
 * Supports exact decimal unit conversions (e.g., 0.5 g === 500 mg, 500 mcg === 0.5 mg, 1 L === 1000 mL)
 * and falls back to normalized case-insensitive comparison for structured free-text doses.
 */
export function compareClinicalDoses(
  expectedDose: string,
  confirmedDose: string,
): boolean {
  const expClean = expectedDose.trim().replace(/\s+/g, ' ');
  const confClean = confirmedDose.trim().replace(/\s+/g, ' ');
  if (!expClean || !confClean) return false;
  if (expClean.toLowerCase() === confClean.toLowerCase()) return true;

  const parsedExp = parseClinicalDose(expClean);
  const parsedConf = parseClinicalDose(confClean);
  if (parsedExp && parsedConf) {
    if (parsedExp.dimension !== parsedConf.dimension) return false;
    return parsedExp.canonicalValue.eq(parsedConf.canonicalValue);
  }
  return false;
}

/**
 * Right #4 — Clinical Route Normalization & Comparison:
 * Recognizes canonical clinical aliases (PO/ORAL, IV/INTRAVENOUS, IM, SC/SUBQ, Arabic equivalents).
 */
export function normalizeClinicalRoute(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const upper = cleaned.toUpperCase();
  return ROUTE_ALIASES[upper] ?? ROUTE_ALIASES[cleaned] ?? upper;
}

export function compareClinicalRoutes(
  expectedRoute: string,
  confirmedRoute: string,
): boolean {
  if (!expectedRoute.trim() || !confirmedRoute.trim()) return false;
  return (
    normalizeClinicalRoute(expectedRoute) ===
    normalizeClinicalRoute(confirmedRoute)
  );
}

/**
 * Right #5 — Clinical Scheduled Time Window Evaluation:
 * Standard hospital safe window is ±60 minutes around `scheduledFor`.
 */
export function evaluateTimeWindow(
  scheduledFor: Date | null | undefined,
  administeredAt: Date = new Date(),
  windowMinutes: number = DEFAULT_TIME_WINDOW_MINUTES,
): {
  isTimeWindowMatch: boolean | null;
  timeVarianceMinutes: number | null;
  timeWindowStatus: TimeWindowStatus;
} {
  if (!scheduledFor) {
    return {
      isTimeWindowMatch: null,
      timeVarianceMinutes: null,
      timeWindowStatus: 'UNSCHEDULED',
    };
  }
  const diffMinutes = Math.round(
    (administeredAt.getTime() - scheduledFor.getTime()) / 60000,
  );
  if (Math.abs(diffMinutes) <= windowMinutes) {
    return {
      isTimeWindowMatch: true,
      timeVarianceMinutes: diffMinutes,
      timeWindowStatus: 'ON_TIME',
    };
  }
  return {
    isTimeWindowMatch: false,
    timeVarianceMinutes: diffMinutes,
    timeWindowStatus: diffMinutes < 0 ? 'EARLY' : 'LATE',
  };
}

export function evaluateFiveRights(params: {
  isPatientMatch: boolean;
  isDrugMatch: boolean;
  expectedDose: string;
  expectedRoute: string;
  confirmedDose?: string;
  confirmedRoute?: string;
  scheduledFor?: Date | null;
  administeredAt?: Date;
  pharmacistVerified: boolean;
  windowMinutes?: number;
}): FiveRightsEvaluation {
  const isBarcodeMatch = params.isPatientMatch && params.isDrugMatch;
  const mismatchReasons: string[] = [];

  if (!params.isPatientMatch) mismatchReasons.push('PATIENT_BARCODE_MISMATCH');
  if (!params.isDrugMatch) mismatchReasons.push('DRUG_BARCODE_MISMATCH');

  const hasDose =
    typeof params.confirmedDose === 'string' &&
    params.confirmedDose.trim().length > 0;
  const hasRoute =
    typeof params.confirmedRoute === 'string' &&
    params.confirmedRoute.trim().length > 0;

  const isDoseMatch = hasDose
    ? compareClinicalDoses(params.expectedDose, params.confirmedDose!)
    : null;
  if (isDoseMatch === false) mismatchReasons.push('DOSE_MISMATCH');

  const isRouteMatch = hasRoute
    ? compareClinicalRoutes(params.expectedRoute, params.confirmedRoute!)
    : null;
  if (isRouteMatch === false) mismatchReasons.push('ROUTE_MISMATCH');

  const timeEval = evaluateTimeWindow(
    params.scheduledFor,
    params.administeredAt ?? new Date(),
    params.windowMinutes ?? DEFAULT_TIME_WINDOW_MINUTES,
  );

  // Full 5-Rights mode is activated whenever dose & route are confirmed alongside barcodes
  const isFull5RightsAttempt = hasDose && hasRoute && !!params.scheduledFor;
  if (isFull5RightsAttempt && timeEval.isTimeWindowMatch === false) {
    mismatchReasons.push(
      timeEval.timeWindowStatus === 'EARLY'
        ? 'TIME_WINDOW_TOO_EARLY'
        : 'TIME_WINDOW_TOO_LATE',
    );
  }

  const verificationScope: VerificationScope = isFull5RightsAttempt
    ? 'FULL_FIVE_RIGHTS'
    : 'PATIENT_AND_DRUG';

  const isVerified5Rights =
    verificationScope === 'FULL_FIVE_RIGHTS' &&
    isBarcodeMatch &&
    isDoseMatch === true &&
    isRouteMatch === true &&
    timeEval.isTimeWindowMatch === true &&
    params.pharmacistVerified;

  return {
    isPatientMatch: params.isPatientMatch,
    isDrugMatch: params.isDrugMatch,
    isBarcodeMatch,
    isDoseMatch,
    isRouteMatch,
    isTimeWindowMatch: timeEval.isTimeWindowMatch,
    timeVarianceMinutes: timeEval.timeVarianceMinutes,
    timeWindowStatus: timeEval.timeWindowStatus,
    verificationScope,
    isVerified5Rights,
    mismatchReasons,
  };
}
