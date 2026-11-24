import {
  computeAnesthesiaRecordHash,
  computeDeliverySafetyHash,
  computeWhoChecklistHash,
  evaluateDeliverySafety,
  evaluateSurgicalCount,
} from './surgical-safety.util';

describe('Surgical Safety, Count, Anesthesia & Delivery Utilities (CAP05)', () => {
  it('evaluates surgical count matches and variances deterministically', () => {
    expect(
      evaluateSurgicalCount({
        initialCount: 10,
        addedCount: 5,
        finalCount: 15,
      }),
    ).toEqual({ expectedFinal: 15, variance: 0, isMatched: true });

    expect(
      evaluateSurgicalCount({
        initialCount: 10,
        addedCount: 5,
        finalCount: 14,
      }),
    ).toEqual({ expectedFinal: 15, variance: -1, isMatched: false });
  });

  it('produces tamper-evident SHA-256 hashes for WHO checklist, anesthesia record, and delivery safety', () => {
    const signedAt = new Date('2026-11-24T14:00:00.000Z');
    const c1 = computeWhoChecklistHash({
      hospitalId: 1,
      surgeryCaseId: 50,
      phase: 'TIME_OUT',
      checklistItems: { teamIntroduced: true, siteVerified: true },
      siteMarked: true,
      consentConfirmed: true,
      allergyChecked: true,
      antibioticProphylaxisGiven: true,
      imagingDisplayed: true,
      performedById: 2,
      verifiedById: 3,
      signedAt,
    });
    const c2 = computeWhoChecklistHash({
      hospitalId: 1,
      surgeryCaseId: 50,
      phase: 'TIME_OUT',
      checklistItems: { teamIntroduced: true, siteVerified: false },
      siteMarked: true,
      consentConfirmed: true,
      allergyChecked: true,
      antibioticProphylaxisGiven: true,
      imagingDisplayed: true,
      performedById: 2,
      verifiedById: 3,
      signedAt,
    });
    expect(c1).toMatch(/^[0-9a-f]{64}$/);
    expect(c1).not.toBe(c2);

    const a1 = computeAnesthesiaRecordHash({
      hospitalId: 1,
      surgeryCaseId: 50,
      anesthesiologistId: 4,
      asaClass: 'ASA_2',
      isEmergency: false,
      anesthesiaType: 'GENERAL',
      airwayManagement: 'ETT 7.5',
      fluidsInMl: 1500,
      estimatedBloodLossMl: 250,
      urineOutputMl: 300,
      pacuAldreteScore: 9,
      complications: null,
      signedById: 4,
      signedAt,
    });
    expect(a1).toMatch(/^[0-9a-f]{64}$/);

    const d1 = computeDeliverySafetyHash({
      hospitalId: 1,
      deliveryAdmissionId: 9,
      encounterId: 88,
      deliveryMethod: 'CS_EMERGENCY',
      bloodLossMl: 1200,
      babyCount: 1,
      pphAlertTriggered: true,
      signedById: 5,
      signedAt,
    });
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('detects WHO/ACOG PPH thresholds (>=500mL NVD, >=1000mL CS) and low APGAR/NICU/STILLBORN', () => {
    const safeNvd = evaluateDeliverySafety({
      deliveryMethod: 'NVD',
      bloodLossMl: 350,
      babies: [{ apgarScore1: 8, apgarScore5: 9, status: 'ALIVE' }],
    });
    expect(safeNvd.pphTriggered).toBe(false);
    expect(safeNvd.neonatalAlertTriggered).toBe(false);
    expect(safeNvd.alerts).toHaveLength(0);

    const pphNvd = evaluateDeliverySafety({
      deliveryMethod: 'NVD',
      bloodLossMl: 650,
      babies: [{ apgarScore1: 5, apgarScore5: 6, status: 'NICU' }],
    });
    expect(pphNvd.pphTriggered).toBe(true);
    expect(pphNvd.pphThresholdMl).toBe(500);
    expect(pphNvd.neonatalAlertTriggered).toBe(true);
    expect(pphNvd.alerts.length).toBeGreaterThanOrEqual(2);

    const csUnderThreshold = evaluateDeliverySafety({
      deliveryMethod: 'CS_ELECTIVE',
      bloodLossMl: 800,
      babies: [{ apgarScore1: 9, apgarScore5: 10, status: 'ALIVE' }],
    });
    expect(csUnderThreshold.pphTriggered).toBe(false);
    expect(csUnderThreshold.pphThresholdMl).toBe(1000);

    const csPph = evaluateDeliverySafety({
      deliveryMethod: 'CS_EMERGENCY',
      bloodLossMl: 1250,
      babies: [{ apgarScore1: 0, apgarScore5: 0, status: 'STILLBORN' }],
    });
    expect(csPph.pphTriggered).toBe(true);
    expect(csPph.neonatalAlertTriggered).toBe(true);
  });
});
