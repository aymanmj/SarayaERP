// server/src/surgery/surgical-package.util.spec.ts
import {
  computePackageInvoiceSplit,
  computePackageSettlementHash,
  reconcileSurgicalPackage,
} from './surgical-package.util';

describe('SurgicalPackageUtil (CAP08 — DRG Bundled Billing & Overage Engine)', () => {
  it('computes bundled coverage, cap overages, excluded charges, net billable total, and DRG variance with Money precision', () => {
    // Laparoscopic Cholecystectomy Package = 3500.000 LYD
    // Rules: SURGERY unlimited, ROOM capped 600, LAB capped 250, RADIOLOGY excluded
    // Actual charges: SURGERY 2200, ROOM 800 (200 overage), LAB 200 (0 overage), RADIOLOGY 450 (450 excluded overage)
    // Total actual = 3650.000; covered = 2200+600+200 = 3000.000; overage = 200+450 = 650.000
    // Net billable = 3500 + 650 = 4150.000; variance (margin) = 4150 - 3650 = +500.000
    const res = reconcileSurgicalPackage(
      '3500.000',
      [
        { category: 'SURGERY', coverageMode: 'INCLUDED_UNLIMITED' },
        {
          category: 'ROOM',
          coverageMode: 'INCLUDED_CAPPED',
          capAmount: '600.000',
        },
        {
          category: 'LAB',
          coverageMode: 'INCLUDED_CAPPED',
          capAmount: '250.000',
        },
        { category: 'RADIOLOGY', coverageMode: 'EXCLUDED' },
      ],
      [
        { category: 'SURGERY', amount: '2200.000' },
        { category: 'ROOM', amount: '800.000' },
        { category: 'LAB', amount: '200.000' },
        { category: 'RADIOLOGY', amount: '450.000' },
      ],
    );

    expect(res.packagePrice).toBe('3500.000');
    expect(res.actualChargesTotal).toBe('3650.000');
    expect(res.coveredByPackageAmount).toBe('3000.000');
    expect(res.overageAmount).toBe('650.000');
    expect(res.netBillableTotal).toBe('4150.000');
    expect(res.packageVariance).toBe('500.000');
  });

  it('produces deterministic SHA-256 settlement hash sensitive to any amount tamper', () => {
    const base = {
      hospitalId: 1,
      enrollmentId: 5,
      encounterId: 44,
      packageId: 2,
      packagePriceSnapshot: '3500.000',
      actualChargesTotal: '3650.000',
      overageAmount: '650.000',
      netBillableTotal: '4150.000',
      settledById: 9,
    };
    const h1 = computePackageSettlementHash(base);
    const h2 = computePackageSettlementHash({ ...base });
    const hTampered = computePackageSettlementHash({
      ...base,
      overageAmount: '649.999',
    });
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
    expect(hTampered).not.toBe(h1);
  });

  it('splits DRG bundled invoice between insurance and patient with exact Money precision', () => {
    // 80% insurance on packagePrice (3500) only; patient pays 20% package (700) + 100% overage (650) = 1350
    const exclOverage = computePackageInvoiceSplit({
      packagePrice: '3500.000',
      overageAmount: '650.000',
      insuranceCoveragePercent: 80,
      coverOverage: false,
    });
    expect(exclOverage.netBillableTotal).toBe('4150.000');
    expect(exclOverage.insuranceShare).toBe('2800.000');
    expect(exclOverage.patientShare).toBe('1350.000');

    // 80% insurance including overage with maxCoverageAmount cap of 3000.000
    const capped = computePackageInvoiceSplit({
      packagePrice: '3500.000',
      overageAmount: '650.000',
      insuranceCoveragePercent: 80,
      coverOverage: true,
      maxCoverageAmount: '3000.000',
    });
    expect(capped.insuranceShare).toBe('3000.000');
    expect(capped.patientShare).toBe('1150.000');

    // Self-pay (0% coverage)
    const selfPay = computePackageInvoiceSplit({
      packagePrice: '1234.567',
      overageAmount: '100.000',
      insuranceCoveragePercent: 0,
    });
    expect(selfPay.insuranceShare).toBe('0.000');
    expect(selfPay.patientShare).toBe('1334.567');
  });
});
