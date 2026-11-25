// server/src/radiology/radiation-dose.util.spec.ts
import { evaluateRadiationDose } from './radiation-dose.util';

describe('RadiationDoseUtil (CAP13 — ICRP-103 RDSR & Cumulative Patient Safety)', () => {
  it('computes CT effective dose from DLP via ICRP-103 k-factors and flags DRL exceedance', () => {
    // CT Chest DLP 750 mGy·cm -> exceeds DRL (600); effective dose = 750 * 0.014 = 10.5000 mSv
    const res = evaluateRadiationDose({
      modality: 'CT',
      bodyRegion: 'CHEST',
      dlpMgyCm: 750,
      prior12mMsv: 12.25,
    });
    expect(res.effectiveDoseMsv).toBe('10.5000');
    expect(res.exceedsDrl).toBe(true);
    expect(res.cumulative12mMsv).toBe('22.7500');
    expect(res.cumulativeWarning).toBe(false);
    expect(res.requiresIncidentEscalation).toBe(false);
    expect(res.tier).toBe('NORMAL');
  });

  it('triggers 50 mSv warning and 100 mSv IAEA clinical incident escalation thresholds', () => {
    const warn = evaluateRadiationDose({
      modality: 'CT',
      bodyRegion: 'ABDOMEN',
      dlpMgyCm: 600, // 9.0000 mSv
      prior12mMsv: 45,
    });
    expect(warn.cumulative12mMsv).toBe('54.0000');
    expect(warn.cumulativeWarning).toBe(true);
    expect(warn.requiresIncidentEscalation).toBe(false);
    expect(warn.tier).toBe('ELEVATED_50MSV');

    const crit = evaluateRadiationDose({
      modality: 'CT',
      bodyRegion: 'ABDOMEN_PELVIS',
      dlpMgyCm: 1100, // 16.5000 mSv (> 1000 DRL)
      prior12mMsv: 88,
    });
    expect(crit.exceedsDrl).toBe(true);
    expect(crit.cumulative12mMsv).toBe('104.5000');
    expect(crit.cumulativeWarning).toBe(true);
    expect(crit.requiresIncidentEscalation).toBe(true);
    expect(crit.tier).toBe('CRITICAL_100MSV');
  });
});
