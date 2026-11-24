import {
  composeStructuredReportText,
  computeCkdEpi2021Egfr,
  computeRadiologyAddendumHash,
  computeRadiologyReportHash,
  evaluateRadiologySafety,
} from './radiology-report.util';

describe('Radiology Clinical Modernization Utilities (Batch 20)', () => {
  it('composes structured report sections cleanly and falls back to plain reportText', () => {
    const composed = composeStructuredReportText({
      indicationText: 'Persistent cough',
      techniqueText: 'PA and lateral chest radiograph',
      findingsText: 'Lungs are clear. No pleural effusion.',
      impressionText: 'No acute cardiopulmonary process.',
      biradsScore: 'N/A',
    });
    expect(composed).toContain('CLINICAL INDICATION:\nPersistent cough');
    expect(composed).toContain('FINDINGS:\nLungs are clear.');
    expect(composed).toContain(
      'IMPRESSION:\nNo acute cardiopulmonary process.',
    );
    expect(composed).toContain('ASSESSMENT CATEGORY: N/A');

    expect(
      composeStructuredReportText({ reportText: 'Plain fallback report' }),
    ).toBe('Plain fallback report');
  });

  it('produces deterministic SHA-256 report and addendum hashes sensitive to tampering', () => {
    const signedAt = new Date('2026-11-24T12:00:00.000Z');
    const base = {
      hospitalId: 1,
      radiologyOrderId: 42,
      studyId: 7,
      indicationText: 'Headache',
      techniqueText: 'Non-contrast CT Head',
      findingsText: 'No acute hemorrhage.',
      impressionText: 'Normal CT head.',
      biradsScore: null,
      reportText: 'Normal CT head.',
      signedById: 9,
      signedAt,
    };

    const h1 = computeRadiologyReportHash(base);
    const h2 = computeRadiologyReportHash({ ...base });
    const hTampered = computeRadiologyReportHash({
      ...base,
      impressionText: 'Acute subdural hematoma.',
    });

    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(hTampered);

    const addHash = computeRadiologyAddendumHash({
      hospitalId: 1,
      radiologyOrderId: 42,
      addendumNumber: 1,
      reason: 'Peer review correlation',
      addendumText: 'Correlated with prior MRI; unchanged.',
      isCriticalFinding: false,
      authorId: 9,
      signedAt,
      previousReportHash: h1,
    });
    expect(addHash).toMatch(/^[0-9a-f]{64}$/);
    expect(addHash).not.toBe(h1);
  });

  it('computes CKD-EPI 2021 eGFR and blocks contrast allergy, low eGFR, and pregnancy radiation without override', () => {
    const egfrSevere = computeCkdEpi2021Egfr({
      serumCreatinineMgDl: 3.5,
      ageYears: 60,
      gender: 'MALE',
    });
    expect(egfrSevere).not.toBeNull();
    expect(egfrSevere!).toBeLessThan(30);

    const blocked = evaluateRadiologySafety({
      studies: [
        {
          id: 10,
          code: 'CT-ABD-C',
          name: 'CT Abdomen with IV Contrast',
          modality: 'CT',
          requiresContrast: true,
          contrastType: 'IODINATED',
          ionizingRadiation: true,
          minEgfrThreshold: 30,
        },
      ],
      patient: {
        gender: 'FEMALE',
        dateOfBirth: new Date('1996-05-01T00:00:00Z'),
      },
      allergies: [{ allergen: 'Iodinated Contrast Media', severity: 'SEVERE' }],
      latestCreatinineMgDl: 3.5,
      pregnancyStatus: 'PREGNANT',
      referenceDate: new Date('2026-11-24T00:00:00Z'),
    });

    expect(blocked.canProceed).toBe(false);
    expect(blocked.requiresContrastOverride).toBe(true);
    expect(blocked.requiresRadiationOverride).toBe(true);
    expect(blocked.alerts.map((a) => a.code)).toEqual(
      expect.arrayContaining([
        'CONTRAST_ALLERGY',
        'LOW_EGFR_CONTRAST',
        'PREGNANCY_IONIZING_RADIATION',
      ]),
    );

    const overridden = evaluateRadiologySafety({
      studies: [
        {
          id: 10,
          code: 'CT-ABD-C',
          name: 'CT Abdomen with IV Contrast',
          modality: 'CT',
          requiresContrast: true,
          contrastType: 'IODINATED',
          ionizingRadiation: true,
          minEgfrThreshold: 30,
        },
      ],
      patient: {
        gender: 'FEMALE',
        dateOfBirth: new Date('1996-05-01T00:00:00Z'),
      },
      allergies: [{ allergen: 'Iodinated Contrast Media', severity: 'SEVERE' }],
      latestCreatinineMgDl: 3.5,
      pregnancyStatus: 'PREGNANT',
      contrastOverrideReason:
        'Pre-medicated with steroids; life-saving trauma CT',
      radiationOverrideReason:
        'Life-threatening maternal trauma, shielded pelvis',
      referenceDate: new Date('2026-11-24T00:00:00Z'),
    });

    expect(overridden.canProceed).toBe(true);
  });
});
