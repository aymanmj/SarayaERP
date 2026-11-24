// server/src/hr/hr-financial.service.spec.ts
import {
  calculateEndOfService,
  calculateProgressiveTax,
  computeAdvanceSchedule,
  computeSettlementSignatureHash,
  computeShiftDurationHours,
  resolveFixedShiftRate,
} from './hr-financial.util';

describe('HrFinancialUtil (CAP11 — Advances, Deductions & End-of-Service Indemnity)', () => {
  it('computes exact Money ROUND_HALF_EVEN monthly advance installments', () => {
    const sched = computeAdvanceSchedule('1000.000', 3);
    expect(sched.amount).toBe('1000.000');
    expect(sched.installments).toBe(3);
    expect(sched.monthlyDeduction).toBe('333.333');

    expect(() => computeAdvanceSchedule(0, 3)).toThrow();
    expect(() => computeAdvanceSchedule(500, 0)).toThrow();
  });

  it('calculates full End-of-Service gratuity, leave encashment, prorated last month, and advance offset accurately', () => {
    // 6 full years of service (2020-01-01 -> 2026-01-01):
    // Basic salary = 3000.000 -> dailyRate = 100.000
    // Gratuity (TERMINATION, 6.000 yrs) = 2.5*3000 + (6-5)*3000 = 7500 + 3000 = 10500.000
    // Last month days = 1 -> 100.000
    // Unused leave = 10 days -> 1000.000
    // Total earnings = 11600.000; active advances = 1500.000 -> Net = 10100.000
    const res = calculateEndOfService({
      basicSalary: '3000.000',
      hireDate: new Date('2020-01-01T00:00:00.000Z'),
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
      terminationType: 'TERMINATION',
      unusedAnnualLeaveDays: 10,
      activeAdvancesTotal: '1500.000',
    });

    expect(res.serviceYears).toBe('6.000');
    expect(res.dailyRate).toBe('100.000');
    expect(res.lastMonthAmount).toBe('100.000');
    expect(res.leaveCompensationAmount).toBe('1000.000');
    expect(res.gratuityMultiplier).toBe('1.000');
    expect(res.gratuityAmount).toBe('10500.000');
    expect(res.totalEarnings).toBe('11600.000');
    expect(res.totalDeductions).toBe('1500.000');
    expect(res.netAmount).toBe('10100.000');
  });

  it('applies tiered RESIGNATION multipliers and zero gratuity on DISCIPLINARY termination', () => {
    // 3 years RESIGNATION -> raw = 0.5 * 3000 * 3 = 4500, multiplier = 1/3 -> 1500.000
    const resign3y = calculateEndOfService({
      basicSalary: '3000.000',
      hireDate: new Date('2023-01-01T00:00:00.000Z'),
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
      terminationType: 'RESIGNATION',
      unusedAnnualLeaveDays: 0,
      activeAdvancesTotal: 0,
    });
    expect(resign3y.gratuityAmount).toBe('1500.000');

    // 6 years DISCIPLINARY -> gratuity = 0.000
    const disc6y = calculateEndOfService({
      basicSalary: '3000.000',
      hireDate: new Date('2020-01-01T00:00:00.000Z'),
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
      terminationType: 'DISCIPLINARY',
      unusedAnnualLeaveDays: 5,
      activeAdvancesTotal: 0,
    });
    expect(disc6y.gratuityAmount).toBe('0.000');
    expect(disc6y.leaveCompensationAmount).toBe('500.000');
  });

  it('computes deterministic SHA-256 settlement signature hash that detects tampering', () => {
    const base = {
      hospitalId: 1,
      settlementId: 12,
      settlementNo: 'STL-2026-0001',
      userId: 5,
      terminationType: 'TERMINATION',
      effectiveDateIso: '2026-11-24T00:00:00.000Z',
      totalEarnings: '11600.000',
      totalDeductions: '1500.000',
      netAmount: '10100.000',
      approvedById: 2,
    };
    const h1 = computeSettlementSignatureHash(base);
    const h2 = computeSettlementSignatureHash({ ...base });
    const tampered = computeSettlementSignatureHash({
      ...base,
      netAmount: '10100.001',
    });
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
    expect(tampered).not.toBe(h1);
  });

  it('computes progressive income tax brackets and resolves FIXED_SHIFT & overnight shift durations accurately', () => {
    // 0..1000 @ 0%, 1000..3000 @ 5%, >3000 @ 10%
    // Taxable = 4000 -> (2000 * 0.05) + (1000 * 0.10) = 100 + 100 = 200.000
    const tax = calculateProgressiveTax('4000.000', [
      { fromAmount: 0, toAmount: 1000, rate: 0, sortOrder: 1 },
      { fromAmount: 1000, toAmount: 3000, rate: 0.05, sortOrder: 2 },
      { fromAmount: 3000, toAmount: null, rate: 0.1, sortOrder: 3 },
    ]);
    expect(tax).toBe('200.000');

    expect(computeShiftDurationHours('20:00', '08:00')).toBe(12);
    expect(computeShiftDurationHours('08:00', '14:00')).toBe(6);

    const rates = {
      fixedShift6hRate: '75.0000',
      fixedShift12hRate: '140.0000',
      fixedShift24hRate: '260.0000',
    };
    expect(resolveFixedShiftRate(6, rates)).toBe('75.000');
    expect(resolveFixedShiftRate(12, rates)).toBe('140.000');
    expect(resolveFixedShiftRate(24, rates)).toBe('260.000');
  });
});
