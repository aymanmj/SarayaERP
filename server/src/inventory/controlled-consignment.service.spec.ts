import {
  computeConsignmentLineTotal,
  computeControlledLogHash,
  evaluateWardReturnEligibility,
} from './controlled-consignment.util';

describe('CAP10 Controlled Substances, Consignment & Ward Returns Utilities', () => {
  it('computes tamper-evident SHA-256 chain hashes for controlled substance logs', () => {
    const createdAt = new Date('2026-11-24T16:00:00.000Z');
    const base = {
      previousHash: 'GENESIS',
      hospitalId: 1,
      warehouseId: 2,
      productId: 10,
      batchNumber: 'MOR-2026-01',
      patientId: 99,
      encounterId: 200,
      transactionType: 'DISPENSE' as const,
      quantityBefore: '20.000',
      quantityChange: '-2.000',
      quantityAfter: '18.000',
      wastedQuantity: '0.500',
      performedById: 3,
      witnessedById: 4,
      reason: 'Post-op analgesia; partial ampoule wasted with witness',
      createdAt,
    };

    const h1 = computeControlledLogHash(base);
    const h2 = computeControlledLogHash({ ...base });
    const hTampered = computeControlledLogHash({
      ...base,
      wastedQuantity: '0.000',
    });

    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(hTampered);
  });

  it('computes consignment consumption totals using Money ROUND_HALF_EVEN precision', () => {
    const exact = computeConsignmentLineTotal('1.500', '1250.3335');
    expect(exact.unitPriceStr).toBe('1250.3335');
    // 1.5 * 1250.3335 = 1875.50025 -> ROUND_HALF_EVEN to 3 decimals = 1875.500
    expect(exact.totalAmountStr).toBe('1875.500');

    const midpointEven = computeConsignmentLineTotal('1.000', '10.0025');
    // 10.0025 rounds to even -> 10.002
    expect(midpointEven.totalAmountStr).toBe('10.002');
  });

  it('enforces seal, cold-chain, and expiry safety on ward stock returns', () => {
    const ref = new Date('2026-11-24T12:00:00Z');
    expect(
      evaluateWardReturnEligibility({
        sealIntact: true,
        coldChainMaintained: true,
        expiryDate: new Date('2027-06-01T00:00:00Z'),
        referenceDate: ref,
      }),
    ).toEqual({ eligibleForRestock: true, reasons: [] });

    const unsafe = evaluateWardReturnEligibility({
      sealIntact: false,
      coldChainMaintained: false,
      expiryDate: new Date('2026-10-01T00:00:00Z'),
      referenceDate: ref,
    });
    expect(unsafe.eligibleForRestock).toBe(false);
    expect(unsafe.reasons).toHaveLength(3);
  });
});
