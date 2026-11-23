import { describe, it, expect } from 'vitest';
import {
  Money,
  MONEY_SCALE,
  UNIT_PRICE_SCALE,
  RATE_SCALE,
  formatMoney,
  formatUnitPrice,
  formatRate,
} from './money';
describe('exact financial strings at the browser boundary', () => {
  it('preserves the largest database amount and subunits in display', () => {
    expect(formatMoney('999999999999999.999', false)).toBe('999,999,999,999,999.999');
    expect(Money.toDbString('999999999999999.999')).toBe('999999999999999.999');
    expect(Money.toFixed(Money.sumDecimal('0.1', '0.2'))).toBe('0.300');
  });
  it('uses half-even rounding and posted-line sums', () => {
    expect(Money.toFixed('1.2345')).toBe('1.234');
    expect(Money.toFixed('1.2355')).toBe('1.236');
    expect(Money.toFixed(Money.sumPosted('0.0005', '0.0015'))).toBe('0.002');
  });
  it('enforces the 3-tier precision contract (3dp ledger, 4dp unit/WAC, 6dp rates/FX)', () => {
    expect(MONEY_SCALE).toBe(3);
    expect(UNIT_PRICE_SCALE).toBe(4);
    expect(RATE_SCALE).toBe(6);
    expect(Money.toUnitDbString('0.41665')).toBe('0.4166');
    expect(Money.toUnitDbString('0.41675')).toBe('0.4168');
    expect(Money.toRateDbString('12.3456505')).toBe('12.345650');
    expect(Money.postedUnitLine('0.4167', '300')).toEqual({
      unitPriceDb: '0.4167',
      quantityDb: '300.000',
      totalPriceDb: '125.010',
    });
    expect(formatUnitPrice('0.4167', false)).toBe('0.4167');
    expect(formatRate('0.005')).toBe('0.005000');
  });
  it('rejects overflow, nonfinite values and unsafe numeric conversion', () => {
    expect(() => Money.toDbString('1000000000000000')).toThrow();
    expect(() => Money.toUnitDbString('1000000000000000')).toThrow();
    expect(() => Money.toRateDbString('10000000000000')).toThrow();
    expect(() => Money.decimal('Infinity')).toThrow();
    expect(() => Money.add('999999999999999.999', '0')).toThrow();
    expect(formatMoney('invalid')).toBe('—');
    expect(formatUnitPrice('invalid')).toBe('—');
    expect(formatRate('invalid')).toBe('—');
  });
});
