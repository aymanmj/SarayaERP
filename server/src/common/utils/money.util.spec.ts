import { Money, getCurrency } from './money.util';
import {
  MonetaryAmount,
  Quantity,
  Percentage,
  ExchangeRate,
} from './financial-values.util';

describe('financial precision and compatibility boundaries', () => {
  it.each([
    ['1.2345', '1.234'],
    ['1.2355', '1.236'],
    ['-1.2345', '-1.234'],
    ['-1.2355', '-1.236'],
    ['0.0005', '0.000'],
    ['9.9995', '10.000'],
  ])('posts %s using half-even without losing a millime', (value, expected) => {
    expect(Money.toDbString(value)).toBe(expected);
  });

  it('keeps the full Decimal(18,3) range as strings and rejects lossy numeric postings', () => {
    const max = '999999999999999.999';
    expect(Money.addDecimal('999999999999999.998', '.001').toString()).toBe(
      max,
    );
    expect(Money.toDbString(max)).toBe(max);
    expect(() => Money.add('999999999999999.998', '.001')).toThrow(RangeError);
    expect(() => Money.toNumber(Money.divide(1, 3))).toThrow(RangeError);
    expect(Money.div(1, 3)).toBe(1 / 3);
    expect(Money.fromPrisma(null)).toBe(0);
  });

  it.each([
    'NaN',
    'Infinity',
    '-Infinity',
    '1e1001',
    '1e-1001',
    '1.12345678901234567890123456789012345678901',
  ])('rejects an unsupported financial value %s', (value) => {
    expect(() => Money.decimal(value)).toThrow(RangeError);
  });

  it('rejects unsafe numeric inputs, unbounded scales, and unknown currencies', () => {
    expect(() => Money.decimal(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError,
    );
    expect(() => Money.toFixed(1, 100000)).toThrow(RangeError);
    expect(() => getCurrency('__proto__')).toThrow(RangeError);
    expect(() => getCurrency('usd')).toThrow(RangeError);
  });

  it('conserves positive and negative allocation totals including the database maximum', () => {
    expect(Money.split('1', 3)).toEqual(['0.334', '0.333', '0.333']);
    expect(Money.split('-1', 3)).toEqual(['-0.334', '-0.333', '-0.333']);
    for (const total of ['999999999999999.999', '-10.001', '0.0015', '0']) {
      const shares = Money.allocate(total, ['0', '.1', '.2', '1.123456789']);
      expect(Money.toDbString(Money.sumDecimal(...shares))).toBe(
        Money.toDbString(total),
      );
      expect(shares[0]).toBe('0.000');
    }
  });

  it('requires explicit quantity, percentage, currency and exchange direction', () => {
    const amount = MonetaryAmount.from('1.235', 'USD');
    expect(amount.multiply(Quantity.from('2')).toString()).toBe('2.48');
    expect(amount.percentage(Percentage.from('15')).toString()).toBe('0.19');
    expect(
      amount.convert(ExchangeRate.from('5', 'USD', 'LYD')).toString(),
    ).toBe('6.200');
    expect(() => amount.add(MonetaryAmount.from(1, 'LYD'))).toThrow();
    expect(() => amount.convert(ExchangeRate.from(5, 'LYD', 'USD'))).toThrow();
  });
});
