import {
  computeLabVerificationHash,
  computePatientAgeDays,
  evaluateNumericResultAgainstRange,
  selectReferenceRange,
} from './lab-reference-range.util';

describe('Lab Reference Range, Auto-Flagging & Verification Hash (LAB-UPGRADE-P0/P1)', () => {
  it('selects gender-specific and narrowest age-bracket reference ranges accurately', () => {
    const ranges = [
      {
        id: 1,
        gender: 'ANY',
        ageMinDays: 0,
        ageMaxDays: 50000,
        normalLow: '11.5',
        normalHigh: '16.5',
        criticalLow: '6.5',
        criticalHigh: '20.0',
        unit: 'g/dL',
        textRange: null,
      },
      {
        id: 2,
        gender: 'MALE',
        ageMinDays: 6570,
        ageMaxDays: 50000,
        normalLow: '13.5',
        normalHigh: '17.5',
        criticalLow: '7.0',
        criticalHigh: '20.0',
        unit: 'g/dL',
        textRange: null,
      },
      {
        id: 3,
        gender: 'FEMALE',
        ageMinDays: 6570,
        ageMaxDays: 50000,
        normalLow: '12.0',
        normalHigh: '15.5',
        criticalLow: '7.0',
        criticalHigh: '20.0',
        unit: 'g/dL',
        textRange: null,
      },
    ];

    const adultMaleAge = computePatientAgeDays(
      new Date('1990-01-01T00:00:00.000Z'),
      new Date('2026-11-24T00:00:00.000Z'),
    );
    const maleRange = selectReferenceRange(ranges, 'MALE', adultMaleAge);
    const femaleRange = selectReferenceRange(ranges, 'FEMALE', adultMaleAge);
    const childRange = selectReferenceRange(ranges, 'MALE', 365 * 5);

    expect(maleRange?.id).toBe(2);
    expect(femaleRange?.id).toBe(3);
    expect(childRange?.id).toBe(1);

    // 12.5 g/dL is LOW for adult male (13.5-17.5) but NORMAL for adult female (12.0-15.5)
    expect(evaluateNumericResultAgainstRange('12.5', maleRange).flag).toBe('L');
    expect(evaluateNumericResultAgainstRange('12.5', femaleRange).flag).toBe(
      'N',
    );

    // 6.2 g/dL is CRITICAL LOW (LL)
    const critLow = evaluateNumericResultAgainstRange('6.2', maleRange);
    expect(critLow.flag).toBe('LL');
    expect(critLow.isCritical).toBe(true);

    // 21.0 g/dL is CRITICAL HIGH (HH)
    const critHigh = evaluateNumericResultAgainstRange('21.0', maleRange);
    expect(critHigh.flag).toBe('HH');
    expect(critHigh.isCritical).toBe(true);
  });

  it('computes deterministic SHA-256 verification hash independent of parameter order', () => {
    const hash1 = computeLabVerificationHash({
      hospitalId: 1,
      labOrderId: 50,
      testCode: 'CBC',
      resultValue: null,
      resultUnit: null,
      referenceRange: null,
      parameters: [
        { parameterId: 1, parameterName: 'WBC', value: '7.2', unit: '10^9/L' },
        { parameterId: 2, parameterName: 'HGB', value: '14.1', unit: 'g/dL' },
      ],
    });
    const hash2 = computeLabVerificationHash({
      hospitalId: 1,
      labOrderId: 50,
      testCode: 'CBC',
      resultValue: null,
      resultUnit: null,
      referenceRange: null,
      parameters: [
        { parameterId: 2, parameterName: 'HGB', value: '14.1', unit: 'g/dL' },
        { parameterId: 1, parameterName: 'WBC', value: '7.2', unit: '10^9/L' },
      ],
    });
    const hashTampered = computeLabVerificationHash({
      hospitalId: 1,
      labOrderId: 50,
      testCode: 'CBC',
      resultValue: null,
      resultUnit: null,
      referenceRange: null,
      parameters: [
        { parameterId: 2, parameterName: 'HGB', value: '14.2', unit: 'g/dL' },
        { parameterId: 1, parameterName: 'WBC', value: '7.2', unit: '10^9/L' },
      ],
    });

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashTampered);
  });
});
