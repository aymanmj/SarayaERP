import { createHash } from 'node:crypto';
import type { BabyStatus, DeliveryMethod } from '@prisma/client';

export const WHO_CHECKLIST_PHASES = [
  'SIGN_IN',
  'TIME_OUT',
  'SIGN_OUT',
] as const;
export type WhoChecklistPhase = (typeof WHO_CHECKLIST_PHASES)[number];

export const SURGICAL_COUNT_CATEGORIES = [
  'SPONGE',
  'SHARP',
  'INSTRUMENT',
  'NEEDLE',
  'OTHER',
] as const;
export type SurgicalCountCategory = (typeof SURGICAL_COUNT_CATEGORIES)[number];

export const ASA_CLASSES = [
  'ASA_1',
  'ASA_2',
  'ASA_3',
  'ASA_4',
  'ASA_5',
  'ASA_6',
] as const;
export type AsaClass = (typeof ASA_CLASSES)[number];

export const ANESTHESIA_TYPES = [
  'GENERAL',
  'SPINAL',
  'EPIDURAL',
  'COMBINED_SPINAL_EPIDURAL',
  'REGIONAL_BLOCK',
  'MAC_SEDATION',
  'LOCAL',
] as const;
export type AnesthesiaType = (typeof ANESTHESIA_TYPES)[number];

export function computeWhoChecklistHash(input: {
  hospitalId: number;
  surgeryCaseId: number;
  phase: WhoChecklistPhase;
  checklistItems: Record<string, unknown>;
  siteMarked: boolean;
  consentConfirmed: boolean;
  allergyChecked: boolean;
  antibioticProphylaxisGiven: boolean;
  imagingDisplayed: boolean;
  performedById: number;
  verifiedById: number | null;
  signedAt: Date;
}): string {
  const canonical = JSON.stringify({
    v: 1,
    hospitalId: input.hospitalId,
    surgeryCaseId: input.surgeryCaseId,
    phase: input.phase,
    checklistItems: input.checklistItems,
    siteMarked: input.siteMarked,
    consentConfirmed: input.consentConfirmed,
    allergyChecked: input.allergyChecked,
    antibioticProphylaxisGiven: input.antibioticProphylaxisGiven,
    imagingDisplayed: input.imagingDisplayed,
    performedById: input.performedById,
    verifiedById: input.verifiedById,
    signedAt: input.signedAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function computeAnesthesiaRecordHash(input: {
  hospitalId: number;
  surgeryCaseId: number;
  anesthesiologistId: number;
  asaClass: string;
  isEmergency: boolean;
  anesthesiaType: string;
  airwayManagement: string | null;
  fluidsInMl: number;
  estimatedBloodLossMl: number;
  urineOutputMl: number;
  pacuAldreteScore: number | null;
  complications: string | null;
  signedById: number;
  signedAt: Date;
}): string {
  const canonical = JSON.stringify({
    v: 1,
    hospitalId: input.hospitalId,
    surgeryCaseId: input.surgeryCaseId,
    anesthesiologistId: input.anesthesiologistId,
    asaClass: input.asaClass,
    isEmergency: input.isEmergency,
    anesthesiaType: input.anesthesiaType,
    airwayManagement: input.airwayManagement,
    fluidsInMl: input.fluidsInMl,
    estimatedBloodLossMl: input.estimatedBloodLossMl,
    urineOutputMl: input.urineOutputMl,
    pacuAldreteScore: input.pacuAldreteScore,
    complications: input.complications,
    signedById: input.signedById,
    signedAt: input.signedAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function computeDeliverySafetyHash(input: {
  hospitalId: number;
  deliveryAdmissionId: number;
  encounterId: number;
  deliveryMethod: DeliveryMethod;
  bloodLossMl: number | null;
  babyCount: number;
  pphAlertTriggered: boolean;
  signedById: number;
  signedAt: Date;
}): string {
  const canonical = JSON.stringify({
    v: 1,
    hospitalId: input.hospitalId,
    deliveryAdmissionId: input.deliveryAdmissionId,
    encounterId: input.encounterId,
    deliveryMethod: input.deliveryMethod,
    bloodLossMl: input.bloodLossMl,
    babyCount: input.babyCount,
    pphAlertTriggered: input.pphAlertTriggered,
    signedById: input.signedById,
    signedAt: input.signedAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function evaluateSurgicalCount(input: {
  initialCount: number;
  addedCount: number;
  finalCount: number;
}): { expectedFinal: number; variance: number; isMatched: boolean } {
  const expectedFinal = input.initialCount + input.addedCount;
  const variance = input.finalCount - expectedFinal;
  return {
    expectedFinal,
    variance,
    isMatched: variance === 0,
  };
}

export interface DeliverySafetyEvaluation {
  pphTriggered: boolean;
  pphThresholdMl: number;
  neonatalAlertTriggered: boolean;
  alerts: string[];
}

/**
 * WHO / ACOG Obstetrical Delivery Safety Evaluation:
 * - Postpartum Hemorrhage (PPH): >= 500 mL for vaginal birth, >= 1000 mL for Cesarean section.
 * - Neonatal Distress / Stillbirth: APGAR 1 or 5 < 7, or NICU/STILLBORN outcome.
 */
export function evaluateDeliverySafety(input: {
  deliveryMethod: DeliveryMethod;
  bloodLossMl: number | null;
  babies: Array<{
    apgarScore1?: number | null;
    apgarScore5?: number | null;
    status?: BabyStatus;
  }>;
}): DeliverySafetyEvaluation {
  const isCesarean =
    input.deliveryMethod === 'CS_ELECTIVE' ||
    input.deliveryMethod === 'CS_EMERGENCY';
  const pphThresholdMl = isCesarean ? 1000 : 500;
  const alerts: string[] = [];

  const pphTriggered =
    input.bloodLossMl !== null && input.bloodLossMl >= pphThresholdMl;
  if (pphTriggered) {
    alerts.push(
      `نزيف ما بعد الولادة (PPH): فقدان الدم المسجّل (${input.bloodLossMl} mL) يساوي أو يتجاوز الحد المعتمد (${pphThresholdMl} mL).`,
    );
  }

  let neonatalAlertTriggered = false;
  for (let i = 0; i < input.babies.length; i++) {
    const baby = input.babies[i];
    if (baby.status === 'STILLBORN') {
      neonatalAlertTriggered = true;
      alerts.push(
        `المولود #${i + 1}: حالة ولادة متوفاة (STILLBORN) تستدعي مراجعة حادثة سريرية.`,
      );
    } else if (baby.status === 'NICU') {
      neonatalAlertTriggered = true;
      alerts.push(`المولود #${i + 1}: دخول عناية مركزة لحديثي الولادة (NICU).`);
    }
    if (
      (baby.apgarScore1 != null && baby.apgarScore1 < 7) ||
      (baby.apgarScore5 != null && baby.apgarScore5 < 7)
    ) {
      neonatalAlertTriggered = true;
      alerts.push(
        `المولود #${i + 1}: درجة أبغار منخفضة (APGAR 1m=${baby.apgarScore1 ?? '—'}, 5m=${baby.apgarScore5 ?? '—'}).`,
      );
    }
  }

  return {
    pphTriggered,
    pphThresholdMl,
    neonatalAlertTriggered,
    alerts,
  };
}
