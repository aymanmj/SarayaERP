import {
  Money,
  MONEY_SCALE,
  UNIT_PRICE_SCALE,
  RATE_SCALE,
  getCurrency,
} from './money.util';
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

  it('enforces the 3-tier precision contract: 3dp final ledger, 4dp unit prices/WAC, 6dp rates/FX', () => {
    expect(MONEY_SCALE).toBe(3);
    expect(UNIT_PRICE_SCALE).toBe(4);
    expect(RATE_SCALE).toBe(6);

    // 4dp half-even rounding for DECIMAL(19, 4) unit prices and WAC
    expect(Money.toUnitDbString('0.41665')).toBe('0.4166');
    expect(Money.toUnitDbString('0.41675')).toBe('0.4168');
    expect(Money.toUnitDb('1.2545')).toBe(1.2545);

    // 6dp half-even rounding for DECIMAL(19, 6) rates, commissions, conversions, FX
    expect(Money.toRateDbString('12.3456505')).toBe('12.345650');
    expect(Money.toRateDbString('12.3456515')).toBe('12.345652');
    expect(Money.toRateDb('5.34218')).toBe(5.34218);

    // 4dp unit price * 3dp quantity -> 3dp posted line total (prevents sub-millime GL drift)
    const line = Money.postedUnitLine('0.4167', '300');
    expect(line.unitPrice).toBe(0.4167);
    expect(line.unitPriceDb).toBe('0.4167');
    expect(line.totalPrice).toBe(125.01);
    expect(line.totalPriceDb).toBe('125.010');

    // MoneyChain fluent 4dp / 6dp boundaries
    expect(Money.from('125').div('300').toUnitDbString()).toBe('0.4167');
    expect(Money.from('1').div('3').toRateDbString()).toBe('0.333333');
  });
});
