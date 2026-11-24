import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';

export interface ReferenceRangeCandidate {
  id: number;
  gender: string;
  ageMinDays: number;
  ageMaxDays: number;
  normalLow: { toString(): string } | string | number | null;
  normalHigh: { toString(): string } | string | number | null;
  criticalLow: { toString(): string } | string | number | null;
  criticalHigh: { toString(): string } | string | number | null;
  unit: string | null;
  textRange: string | null;
}

export interface EvaluatedLabFlag {
  flag: 'LL' | 'L' | 'N' | 'H' | 'HH' | null;
  isCritical: boolean;
  formattedRange: string | null;
  matchedRangeId: number | null;
}

export function computePatientAgeDays(
  dateOfBirth: Date | null | undefined,
  asOf: Date = new Date(),
): number | null {
  if (!dateOfBirth) return null;
  const diffMs = asOf.getTime() - dateOfBirth.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86_400_000);
}

export function selectReferenceRange(
  candidates: ReferenceRangeCandidate[],
  patientGender: string | null | undefined,
  patientAgeDays: number | null,
): ReferenceRangeCandidate | null {
  if (!candidates.length) return null;
  const normGender = (patientGender || 'ANY').toUpperCase();
  const ageDays = patientAgeDays ?? 365 * 30; // Adult fallback if DOB missing

  const eligible = candidates.filter((r) => {
    const genderOk =
      r.gender === 'ANY' || r.gender.toUpperCase() === normGender;
    const ageOk = ageDays >= r.ageMinDays && ageDays <= r.ageMaxDays;
    return genderOk && ageOk;
  });

  if (!eligible.length) return null;

  // Prefer exact gender match over ANY, then narrowest age bracket
  eligible.sort((a, b) => {
    const aExact = a.gender.toUpperCase() === normGender ? 0 : 1;
    const bExact = b.gender.toUpperCase() === normGender ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aSpan = a.ageMaxDays - a.ageMinDays;
    const bSpan = b.ageMaxDays - b.ageMinDays;
    return aSpan - bSpan;
  });

  return eligible[0];
}

export function evaluateNumericResultAgainstRange(
  rawValue: string | null | undefined,
  range: ReferenceRangeCandidate | null,
): EvaluatedLabFlag {
  if (!range) {
    return {
      flag: null,
      isCritical: false,
      formattedRange: null,
      matchedRangeId: null,
    };
  }

  const formattedRange =
    range.textRange ||
    (range.normalLow !== null && range.normalHigh !== null
      ? `${range.normalLow.toString()} - ${range.normalHigh.toString()}${range.unit ? ` ${range.unit}` : ''}`
      : null);

  if (!rawValue || !/^-?\d+(\.\d+)?$/.test(rawValue.trim())) {
    return {
      flag: null,
      isCritical: false,
      formattedRange,
      matchedRangeId: range.id,
    };
  }

  const val = new Decimal(rawValue.trim());
  if (
    range.criticalLow !== null &&
    val.lte(new Decimal(range.criticalLow.toString()))
  ) {
    return {
      flag: 'LL',
      isCritical: true,
      formattedRange,
      matchedRangeId: range.id,
    };
  }
  if (
    range.criticalHigh !== null &&
    val.gte(new Decimal(range.criticalHigh.toString()))
  ) {
    return {
      flag: 'HH',
      isCritical: true,
      formattedRange,
      matchedRangeId: range.id,
    };
  }
  if (
    range.normalLow !== null &&
    val.lt(new Decimal(range.normalLow.toString()))
  ) {
    return {
      flag: 'L',
      isCritical: false,
      formattedRange,
      matchedRangeId: range.id,
    };
  }
  if (
    range.normalHigh !== null &&
    val.gt(new Decimal(range.normalHigh.toString()))
  ) {
    return {
      flag: 'H',
      isCritical: false,
      formattedRange,
      matchedRangeId: range.id,
    };
  }

  return {
    flag: 'N',
    isCritical: false,
    formattedRange,
    matchedRangeId: range.id,
  };
}

export function computeLabVerificationHash(payload: {
  hospitalId: number;
  labOrderId: number;
  testCode: string;
  resultValue: string | null;
  resultUnit: string | null;
  referenceRange: string | null;
  parameters: Array<{
    parameterId?: number | null;
    parameterName: string;
    value: string;
    unit?: string | null;
    range?: string | null;
    flag?: string | null;
  }>;
}): string {
  const normalizedParams = [...payload.parameters]
    .map((p) => ({
      parameterId: p.parameterId ?? null,
      parameterName: p.parameterName.trim(),
      value: p.value.trim(),
      unit: p.unit?.trim() || null,
      range: p.range?.trim() || null,
      flag: p.flag?.trim() || null,
    }))
    .sort((a, b) => a.parameterName.localeCompare(b.parameterName));

  const canonical = JSON.stringify({
    hospitalId: payload.hospitalId,
    labOrderId: payload.labOrderId,
    testCode: payload.testCode,
    resultValue: payload.resultValue?.trim() || null,
    resultUnit: payload.resultUnit?.trim() || null,
    referenceRange: payload.referenceRange?.trim() || null,
    parameters: normalizedParams,
  });

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
