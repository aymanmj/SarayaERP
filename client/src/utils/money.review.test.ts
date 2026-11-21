import { describe, it, expect } from 'vitest';
import { Money, formatMoney } from './money';
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
  it('rejects overflow, nonfinite values and unsafe numeric conversion', () => {
    expect(() => Money.toDbString('1000000000000000')).toThrow();
    expect(() => Money.decimal('Infinity')).toThrow();
    expect(() => Money.add('999999999999999.999', '0')).toThrow();
    expect(formatMoney('invalid')).toBe('—');
  });
});
