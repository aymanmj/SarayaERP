import { createHash } from 'node:crypto';

export const RADIOLOGY_REPORT_STATUSES = [
  'DRAFT',
  'PRELIMINARY',
  'FINAL',
  'AMENDED',
] as const;
export type RadiologyReportStatus = (typeof RADIOLOGY_REPORT_STATUSES)[number];

export const RADIOLOGY_PREGNANCY_STATUSES = [
  'NOT_PREGNANT',
  'PREGNANT',
  'UNKNOWN',
  'NOT_APPLICABLE',
] as const;
export type RadiologyPregnancyStatus =
  (typeof RADIOLOGY_PREGNANCY_STATUSES)[number];

export const RADIOLOGY_CONTRAST_TYPES = [
  'IODINATED',
  'GADOLINIUM',
  'ORAL',
  'OTHER',
] as const;
export type RadiologyContrastType = (typeof RADIOLOGY_CONTRAST_TYPES)[number];

export const RADIOLOGY_MODALITIES = [
  'DX',
  'CR',
  'CT',
  'MR',
  'US',
  'MG',
  'RF',
  'XA',
  'NM',
  'PT',
  'DXA',
  'OT',
] as const;
export type RadiologyModality = (typeof RADIOLOGY_MODALITIES)[number];

export const IONIZING_MODALITIES = new Set<string>([
  'DX',
  'CR',
  'CT',
  'MG',
  'RF',
  'XA',
  'NM',
  'PT',
  'DXA',
]);

export interface StructuredReportSections {
  indicationText?: string | null;
  techniqueText?: string | null;
  findingsText?: string | null;
  impressionText?: string | null;
  biradsScore?: string | null;
  reportText?: string | null;
}

/**
 * Composes a clean, standardized clinical radiology report text from structured
 * sections (Indication / Technique / Findings / Impression / Category) while
 * preserving plain-text reportText if no structured sections were supplied.
 */
export function composeStructuredReportText(
  sections: StructuredReportSections,
): string | null {
  const parts: string[] = [];
  const clean = (v?: string | null) => {
    const trimmed = v?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  };

  const indication = clean(sections.indicationText);
  const technique = clean(sections.techniqueText);
  const findings = clean(sections.findingsText);
  const impression = clean(sections.impressionText);
  const birads = clean(sections.biradsScore);

  if (indication) parts.push(`CLINICAL INDICATION:\n${indication}`);
  if (technique) parts.push(`TECHNIQUE:\n${technique}`);
  if (findings) parts.push(`FINDINGS:\n${findings}`);
  if (impression) parts.push(`IMPRESSION:\n${impression}`);
  if (birads) parts.push(`ASSESSMENT CATEGORY: ${birads}`);

  if (parts.length > 0) {
    return parts.join('\n\n');
  }
  return clean(sections.reportText);
}

/**
 * Deterministic SHA-256 signature hash for an electronically signed Radiology report.
 */
export function computeRadiologyReportHash(input: {
  hospitalId: number;
  radiologyOrderId: number;
  studyId: number;
  indicationText?: string | null;
  techniqueText?: string | null;
  findingsText?: string | null;
  impressionText?: string | null;
  biradsScore?: string | null;
  reportText?: string | null;
  signedById: number;
  signedAt: Date;
}): string {
  const canonical = JSON.stringify({
    v: 1,
    hospitalId: input.hospitalId,
    radiologyOrderId: input.radiologyOrderId,
    studyId: input.studyId,
    indicationText: input.indicationText ?? null,
    techniqueText: input.techniqueText ?? null,
    findingsText: input.findingsText ?? null,
    impressionText: input.impressionText ?? null,
    biradsScore: input.biradsScore ?? null,
    reportText: input.reportText ?? null,
    signedById: input.signedById,
    signedAt: input.signedAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Deterministic SHA-256 chain hash for an append-only RadiologyReportAddendum.
 */
export function computeRadiologyAddendumHash(input: {
  hospitalId: number;
  radiologyOrderId: number;
  addendumNumber: number;
  reason: string;
  addendumText: string;
  isCriticalFinding: boolean;
  authorId: number;
  signedAt: Date;
  previousReportHash: string;
}): string {
  const canonical = JSON.stringify({
    v: 1,
    hospitalId: input.hospitalId,
    radiologyOrderId: input.radiologyOrderId,
    addendumNumber: input.addendumNumber,
    reason: input.reason.trim(),
    addendumText: input.addendumText.trim(),
    isCriticalFinding: input.isCriticalFinding,
    authorId: input.authorId,
    signedAt: input.signedAt.toISOString(),
    previousReportHash: input.previousReportHash,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Race-free CKD-EPI 2021 eGFR equation (mL/min/1.73m²).
 * Reference: Inker et al., NEJM 2021.
 */
export function computeCkdEpi2021Egfr(params: {
  serumCreatinineMgDl: number;
  ageYears: number;
  gender?: string | null;
}): number | null {
  const { serumCreatinineMgDl, ageYears, gender } = params;
  if (
    !Number.isFinite(serumCreatinineMgDl) ||
    serumCreatinineMgDl <= 0 ||
    !Number.isFinite(ageYears) ||
    ageYears < 1 ||
    ageYears > 130
  ) {
    return null;
  }
  const isFemale = (gender ?? '').toUpperCase() === 'FEMALE';
  const kappa = isFemale ? 0.7 : 0.9;
  const alpha = isFemale ? -0.241 : -0.302;
  const femaleFactor = isFemale ? 1.012 : 1.0;

  const ratio = serumCreatinineMgDl / kappa;
  const minPart = Math.pow(Math.min(ratio, 1), alpha);
  const maxPart = Math.pow(Math.max(ratio, 1), -1.2);
  const agePart = Math.pow(0.9938, ageYears);
  const egfr = 142 * minPart * maxPart * agePart * femaleFactor;
  return Math.round(egfr * 100) / 100;
}

export interface RadiologySafetyAlert {
  code:
    | 'CONTRAST_ALLERGY'
    | 'LOW_EGFR_CONTRAST'
    | 'BORDERLINE_EGFR_CONTRAST'
    | 'MISSING_EGFR_CONTRAST'
    | 'PREGNANCY_IONIZING_RADIATION'
    | 'PREGNANCY_SCREENING_REQUIRED';
  severity: 'HARD_BLOCK' | 'WARNING';
  studyId: number;
  studyCode: string;
  studyName: string;
  message: string;
}

export interface RadiologySafetyEvaluation {
  canProceed: boolean;
  requiresContrastOverride: boolean;
  requiresRadiationOverride: boolean;
  egfr: number | null;
  alerts: RadiologySafetyAlert[];
}

const CONTRAST_ALLERGY_PATTERN =
  /contrast|iodin|gadolinium|omnipaque|visipaque|ultravist|iopamidol|صبغ|يود/i;

export function evaluateRadiologySafety(input: {
  studies: Array<{
    id: number;
    code: string;
    name: string;
    modality?: string | null;
    requiresContrast: boolean;
    contrastType?: string | null;
    ionizingRadiation: boolean;
    minEgfrThreshold?: number | null;
  }>;
  patient: {
    gender?: string | null;
    dateOfBirth?: Date | null;
  };
  allergies: Array<{ allergen: string; severity?: string | null }>;
  latestCreatinineMgDl?: number | null;
  pregnancyStatus?: RadiologyPregnancyStatus | null;
  contrastOverrideReason?: string | null;
  radiationOverrideReason?: string | null;
  referenceDate?: Date;
}): RadiologySafetyEvaluation {
  const now = input.referenceDate ?? new Date();
  const alerts: RadiologySafetyAlert[] = [];

  let ageYears: number | null = null;
  if (input.patient.dateOfBirth) {
    const diffMs = now.getTime() - input.patient.dateOfBirth.getTime();
    if (diffMs > 0) {
      ageYears = Math.floor(diffMs / (365.2425 * 24 * 60 * 60 * 1000));
    }
  }

  const egfr =
    input.latestCreatinineMgDl != null && ageYears != null
      ? computeCkdEpi2021Egfr({
          serumCreatinineMgDl: input.latestCreatinineMgDl,
          ageYears,
          gender: input.patient.gender,
        })
      : null;

  const matchingContrastAllergies = input.allergies.filter((a) =>
    CONTRAST_ALLERGY_PATTERN.test(a.allergen),
  );
  const hasContrastOverride = Boolean(
    input.contrastOverrideReason &&
      input.contrastOverrideReason.trim().length >= 5,
  );
  const hasRadiationOverride = Boolean(
    input.radiationOverrideReason &&
      input.radiationOverrideReason.trim().length >= 5,
  );

  const isFemaleChildbearingAge =
    (input.patient.gender ?? '').toUpperCase() === 'FEMALE' &&
    ageYears != null &&
    ageYears >= 12 &&
    ageYears <= 55;

  let requiresContrastOverride = false;
  let requiresRadiationOverride = false;

  for (const study of input.studies) {
    const modality = (study.modality ?? '').toUpperCase();
    const isIonizing =
      study.ionizingRadiation || IONIZING_MODALITIES.has(modality);

    if (study.requiresContrast) {
      if (matchingContrastAllergies.length > 0) {
        const allergens = matchingContrastAllergies
          .map((a) => a.allergen)
          .join(', ');
        requiresContrastOverride = true;
        alerts.push({
          code: 'CONTRAST_ALLERGY',
          severity: hasContrastOverride ? 'WARNING' : 'HARD_BLOCK',
          studyId: study.id,
          studyCode: study.code,
          studyName: study.name,
          message: `تحذير حرج: للمريض حساسية مسجّلة تجاه الصبغة (${allergens}) قبل طلب فحص بالصبغة (${study.name}).`,
        });
      }

      const threshold =
        study.minEgfrThreshold != null &&
        Number.isFinite(study.minEgfrThreshold)
          ? study.minEgfrThreshold
          : 30;

      if (egfr !== null) {
        if (egfr < threshold) {
          requiresContrastOverride = true;
          alerts.push({
            code: 'LOW_EGFR_CONTRAST',
            severity: hasContrastOverride ? 'WARNING' : 'HARD_BLOCK',
            studyId: study.id,
            studyCode: study.code,
            studyName: study.name,
            message: `تحذير حرج لوظائف الكلى: معدل الترشيح eGFR = ${egfr} mL/min/1.73m² أقل من الحد الآمن (${threshold}) للصبغة.`,
          });
        } else if (egfr < 45) {
          alerts.push({
            code: 'BORDERLINE_EGFR_CONTRAST',
            severity: 'WARNING',
            studyId: study.id,
            studyCode: study.code,
            studyName: study.name,
            message: `تنبيه وظائف كلى حدّية: eGFR = ${egfr} mL/min/1.73m²؛ يُنصح بالإماهة الوقائية قبل الصبغة.`,
          });
        }
      } else {
        alerts.push({
          code: 'MISSING_EGFR_CONTRAST',
          severity: 'WARNING',
          studyId: study.id,
          studyCode: study.code,
          studyName: study.name,
          message: `تنبيه: لا تتوفر نتيجة كرياتينين حديثة لحساب eGFR قبل فحص الصبغة (${study.name}).`,
        });
      }
    }

    if (isIonizing && isFemaleChildbearingAge) {
      if (input.pregnancyStatus === 'PREGNANT') {
        requiresRadiationOverride = true;
        alerts.push({
          code: 'PREGNANCY_IONIZING_RADIATION',
          severity: hasRadiationOverride ? 'WARNING' : 'HARD_BLOCK',
          studyId: study.id,
          studyCode: study.code,
          studyName: study.name,
          message: `تحذير إشعاعي حرج: المريضة حامل ولا يجوز إجراء فحص بأشعة مؤيّنة (${study.name}) دون مبرّر سريري موثّق وموافقة.`,
        });
      } else if (!input.pregnancyStatus) {
        alerts.push({
          code: 'PREGNANCY_SCREENING_REQUIRED',
          severity: 'WARNING',
          studyId: study.id,
          studyCode: study.code,
          studyName: study.name,
          message: `تنبيه سلامة إشعاعية: يُرجى تأكيد حالة الحمل للمريضة (${ageYears} سنة) قبل التصوير بالأشعة المؤيّنة (${study.name}).`,
        });
      }
    }
  }

  const hasHardBlock = alerts.some((a) => a.severity === 'HARD_BLOCK');
  return {
    canProceed: !hasHardBlock,
    requiresContrastOverride,
    requiresRadiationOverride,
    egfr,
    alerts,
  };
}
