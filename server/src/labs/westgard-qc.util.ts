// server/src/labs/westgard-qc.util.ts
import { Money } from '../common/utils/money.util';

export type WestgardRuleCode =
  | '1-2s'
  | '1-3s'
  | '2-2s'
  | 'R-4s'
  | '4-1s'
  | '10x';
export type QcRunStatus = 'PASS' | 'WARNING' | 'REJECT';

export interface WestgardEvaluation {
  zScore: string;
  status: QcRunStatus;
  violatedRules: WestgardRuleCode[];
}

/**
 * Pure Laboratory Westgard Multi-Rule QC Engine (CLIA / CAP / ISO 15189):
 * Evaluates current run against targetMean, targetSd, and chronological recentPreviousZScores
 * (ordered oldest -> newest, immediately preceding the current run).
 */
export function evaluateWestgardRules(
  measuredValue: string | number,
  targetMean: string | number,
  targetSd: string | number,
  recentPreviousZScores: Array<string | number> = [],
): WestgardEvaluation {
  const meanDec = Money.decimal(targetMean);
  const sdDec = Money.decimal(targetSd);
  if (sdDec.lte(0)) {
    throw new RangeError('Target SD must be strictly positive');
  }

  const currentZ = Money.decimal(measuredValue).minus(meanDec).div(sdDec);
  const prevZ = recentPreviousZScores.map((v) => Money.decimal(v));
  const series = [...prevZ, currentZ]; // oldest -> newest (current is last)

  const violated: WestgardRuleCode[] = [];
  let rejected = false;

  // 1-3s: Single control exceeds ±3SD (Random / Systematic error -> REJECT)
  if (currentZ.abs().gt(3)) {
    violated.push('1-3s');
    rejected = true;
  }

  // 2-2s: Two consecutive controls exceed +2SD or -2SD on the SAME side (-> REJECT)
  if (prevZ.length >= 1) {
    const lastPrev = prevZ[prevZ.length - 1];
    if (
      (currentZ.gt(2) && lastPrev.gt(2)) ||
      (currentZ.lt(-2) && lastPrev.lt(-2))
    ) {
      violated.push('2-2s');
      rejected = true;
    }

    // R-4s: Range between two consecutive runs >= 4SD on opposite sides (> +2 and < -2) (-> REJECT)
    if (
      ((currentZ.gt(2) && lastPrev.lt(-2)) ||
        (currentZ.lt(-2) && lastPrev.gt(2))) &&
      currentZ.minus(lastPrev).abs().gte(4)
    ) {
      violated.push('R-4s');
      rejected = true;
    }
  }

  // 4-1s: Four consecutive runs exceed +1SD or -1SD on the SAME side (-> REJECT)
  if (series.length >= 4) {
    const last4 = series.slice(-4);
    if (last4.every((z) => z.gt(1)) || last4.every((z) => z.lt(-1))) {
      violated.push('4-1s');
      rejected = true;
    }
  }

  // 10x: Ten consecutive runs fall on the SAME side of the mean (-> REJECT)
  if (series.length >= 10) {
    const last10 = series.slice(-10);
    if (last10.every((z) => z.gt(0)) || last10.every((z) => z.lt(0))) {
      violated.push('10x');
      rejected = true;
    }
  }

  // 1-2s: Warning rule (single control exceeds ±2SD without rejection rules)
  if (currentZ.abs().gt(2) && !rejected) {
    violated.push('1-2s');
  }

  const status: QcRunStatus = rejected
    ? 'REJECT'
    : violated.length > 0
      ? 'WARNING'
      : 'PASS';

  return {
    zScore: Money.roundDecimal(currentZ, 4).toFixed(4),
    status,
    violatedRules: violated,
  };
}
