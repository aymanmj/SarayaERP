// server/src/radiology/radiation-dose.util.ts
import { Money } from '../common/utils/money.util';

export type RadiationModality =
  | 'CT'
  | 'DX'
  | 'CR'
  | 'MG'
  | 'RF'
  | 'XA'
  | 'NM'
  | 'PT';

export type CumulativeDoseTier =
  | 'NORMAL'
  | 'ELEVATED_50MSV'
  | 'CRITICAL_100MSV';

/** ICRP-103 / AAPM Report 96 Adult CT conversion k-factors (mSv / (mGy·cm)) */
const CT_K_FACTORS: Readonly<Record<string, string>> = {
  HEAD: '0.0021',
  BRAIN: '0.0021',
  NECK: '0.0059',
  CHEST: '0.0140',
  THORAX: '0.0140',
  ABDOMEN: '0.0150',
  PELVIS: '0.0150',
  ABDOMEN_PELVIS: '0.0150',
  CHEST_ABDOMEN_PELVIS: '0.0150',
  SPINE: '0.0150',
  EXTREMITY: '0.0008',
};

/** Diagnostic Reference Levels (DLP mGy·cm for CT) */
const CT_DRL_DLP: Readonly<Record<string, number>> = {
  HEAD: 1050,
  BRAIN: 1050,
  NECK: 650,
  CHEST: 600,
  THORAX: 600,
  ABDOMEN: 800,
  PELVIS: 750,
  ABDOMEN_PELVIS: 1000,
  CHEST_ABDOMEN_PELVIS: 1200,
  SPINE: 900,
};

export interface RadiationDoseEvaluation {
  effectiveDoseMsv: string;
  exceedsDrl: boolean;
  cumulative12mMsv: string;
  cumulativeWarning: boolean;
  requiresIncidentEscalation: boolean;
  tier: CumulativeDoseTier;
}

export function evaluateRadiationDose(params: {
  modality: RadiationModality;
  bodyRegion?: string | null;
  dlpMgyCm?: string | number | null;
  effectiveDoseMsv?: string | number | null;
  prior12mMsv: string | number;
}): RadiationDoseEvaluation {
  const regionKey = (params.bodyRegion ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  let effDec: ReturnType<typeof Money.decimal>;
  if (
    params.effectiveDoseMsv !== undefined &&
    params.effectiveDoseMsv !== null
  ) {
    effDec = Money.decimal(params.effectiveDoseMsv);
  } else if (
    params.modality === 'CT' &&
    params.dlpMgyCm !== undefined &&
    params.dlpMgyCm !== null
  ) {
    const kFactor = CT_K_FACTORS[regionKey] ?? '0.0150';
    effDec = Money.decimal(params.dlpMgyCm).times(kFactor);
  } else {
    effDec = Money.decimal(0);
  }

  effDec = Money.roundDecimal(effDec, 4);

  let exceedsDrl = false;
  if (
    params.modality === 'CT' &&
    params.dlpMgyCm !== undefined &&
    params.dlpMgyCm !== null
  ) {
    const drlLimit = CT_DRL_DLP[regionKey] ?? 1200;
    if (Money.decimal(params.dlpMgyCm).gt(drlLimit)) {
      exceedsDrl = true;
    }
  } else if (
    (params.modality === 'DX' || params.modality === 'CR') &&
    effDec.gt(2)
  ) {
    exceedsDrl = true;
  }

  const cumulativeDec = Money.roundDecimal(
    Money.decimal(params.prior12mMsv).plus(effDec),
    4,
  );
  const tier: CumulativeDoseTier = cumulativeDec.gte(100)
    ? 'CRITICAL_100MSV'
    : cumulativeDec.gte(50)
      ? 'ELEVATED_50MSV'
      : 'NORMAL';

  return {
    effectiveDoseMsv: effDec.toFixed(4),
    exceedsDrl,
    cumulative12mMsv: cumulativeDec.toFixed(4),
    cumulativeWarning: cumulativeDec.gte(50),
    requiresIncidentEscalation: cumulativeDec.gte(100),
    tier,
  };
}
