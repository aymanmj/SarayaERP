// server/src/nursing/five-rights.util.spec.ts
import {
  compareClinicalDoses,
  compareClinicalRoutes,
  evaluateFiveRights,
  evaluateTimeWindow,
} from './five-rights.util';

describe('FiveRightsUtil (CAP03 / UI14 Clinical 5-Rights Medication Safety)', () => {
  it('compares clinical doses accurately across metric units without float drift', () => {
    expect(compareClinicalDoses('500 mg', '500mg')).toBe(true);
    expect(compareClinicalDoses('0.5 g', '500 mg')).toBe(true);
    expect(compareClinicalDoses('500 mcg', '0.5 mg')).toBe(true);
    expect(compareClinicalDoses('1 L', '1000 mL')).toBe(true);
    expect(compareClinicalDoses('500 mg', '1000 mg')).toBe(false);
    expect(compareClinicalDoses('500 mg', '500 mL')).toBe(false);
  });

  it('normalizes clinical routes across standard English and Arabic aliases', () => {
    expect(compareClinicalRoutes('PO', 'Oral')).toBe(true);
    expect(compareClinicalRoutes('PO', 'فموي')).toBe(true);
    expect(compareClinicalRoutes('IV', 'Intravenous')).toBe(true);
    expect(compareClinicalRoutes('SC', 'SubQ')).toBe(true);
    expect(compareClinicalRoutes('IV', 'PO')).toBe(false);
    expect(compareClinicalRoutes('IM', 'IV')).toBe(false);
  });

  it('evaluates ±60 minute administration time window accurately', () => {
    const scheduled = new Date('2026-11-25T08:00:00.000Z');
    const onTime = evaluateTimeWindow(
      scheduled,
      new Date('2026-11-25T08:45:00.000Z'),
    );
    expect(onTime).toEqual({
      isTimeWindowMatch: true,
      timeVarianceMinutes: 45,
      timeWindowStatus: 'ON_TIME',
    });

    const tooEarly = evaluateTimeWindow(
      scheduled,
      new Date('2026-11-25T06:30:00.000Z'),
    );
    expect(tooEarly.isTimeWindowMatch).toBe(false);
    expect(tooEarly.timeVarianceMinutes).toBe(-90);
    expect(tooEarly.timeWindowStatus).toBe('EARLY');

    const tooLate = evaluateTimeWindow(
      scheduled,
      new Date('2026-11-25T09:30:00.000Z'),
    );
    expect(tooLate.isTimeWindowMatch).toBe(false);
    expect(tooLate.timeVarianceMinutes).toBe(90);
    expect(tooLate.timeWindowStatus).toBe('LATE');
  });

  it('sets isVerified5Rights = true ONLY when all 5 rights AND pharmacist verification pass', () => {
    const scheduled = new Date('2026-11-25T08:00:00.000Z');
    const now = new Date('2026-11-25T08:15:00.000Z');

    const fullPass = evaluateFiveRights({
      isPatientMatch: true,
      isDrugMatch: true,
      expectedDose: '500 mg',
      expectedRoute: 'IV',
      confirmedDose: '0.5 g',
      confirmedRoute: 'Intravenous',
      scheduledFor: scheduled,
      administeredAt: now,
      pharmacistVerified: true,
    });
    expect(fullPass.verificationScope).toBe('FULL_FIVE_RIGHTS');
    expect(fullPass.isVerified5Rights).toBe(true);
    expect(fullPass.mismatchReasons).toEqual([]);

    // Legacy barcode-only check stays PATIENT_AND_DRUG & isVerified5Rights = false
    const barcodeOnly = evaluateFiveRights({
      isPatientMatch: true,
      isDrugMatch: true,
      expectedDose: '500 mg',
      expectedRoute: 'IV',
      pharmacistVerified: true,
    });
    expect(barcodeOnly.verificationScope).toBe('PATIENT_AND_DRUG');
    expect(barcodeOnly.isVerified5Rights).toBe(false);

    // Dose/route/time mismatch flags exact reasons
    const mismatch = evaluateFiveRights({
      isPatientMatch: true,
      isDrugMatch: true,
      expectedDose: '500 mg',
      expectedRoute: 'IV',
      confirmedDose: '1000 mg',
      confirmedRoute: 'PO',
      scheduledFor: scheduled,
      administeredAt: new Date('2026-11-25T10:30:00.000Z'),
      pharmacistVerified: true,
    });
    expect(mismatch.isVerified5Rights).toBe(false);
    expect(mismatch.mismatchReasons).toEqual([
      'DOSE_MISMATCH',
      'ROUTE_MISMATCH',
      'TIME_WINDOW_TOO_LATE',
    ]);
  });
});
