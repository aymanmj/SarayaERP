// src/common/utils/financial-values.util.ts
// القيم المالية المقيسة والآمنة للعملات والكميات والنسب وأسعار الصرف

import {
  getCurrency,
  Money,
  OFFICIAL_CURRENCY,
  type FinancialDecimal,
  type MoneyValue,
} from './money.util';

/** Dimensioned values keep quantities, percentages and exchange rates out of amount APIs. */
export class Quantity {
  readonly kind = 'quantity';
  private constructor(private readonly value: string) {
    Object.freeze(this);
  }
  static from(value: MoneyValue): Quantity {
    return new Quantity(Money.decimal(value).toString());
  }
  decimal(): FinancialDecimal {
    return Money.decimal(this.value);
  }
}

export class Percentage {
  readonly kind = 'percentage';
  private constructor(private readonly value: string) {
    Object.freeze(this);
  }
  /** 15 means 15%, not 0.15. Negative percentages represent reductions. */
  static from(value: MoneyValue): Percentage {
    return new Percentage(Money.decimal(value).toString());
  }
  decimal(): FinancialDecimal {
    return Money.decimal(this.value);
  }
}

export class ExchangeRate {
  readonly kind = 'exchange-rate';
  private constructor(
    private readonly value: string,
    readonly fromCurrency: string,
    readonly toCurrency: string,
  ) {
    Object.freeze(this);
  }
  /** Target currency units per one source currency unit; never an implicit inverse. */
  static from(
    value: MoneyValue,
    fromCurrency: string,
    toCurrency: string,
  ): ExchangeRate {
    getCurrency(fromCurrency);
    getCurrency(toCurrency);
    if (!Money.isPositive(value))
      throw new RangeError('Exchange rate must be positive');
    return new ExchangeRate(
      Money.decimal(value).toString(),
      fromCurrency,
      toCurrency,
    );
  }
  decimal(): FinancialDecimal {
    return Money.decimal(this.value);
  }
}

/** Immutable, posted monetary amount. Rounding happens at construction/operation boundaries. */
export class MonetaryAmount {
  readonly kind = 'monetary-amount';
  private constructor(
    private readonly value: string,
    readonly currency: string,
  ) {
    Object.freeze(this);
  }
  static from(
    value: MoneyValue,
    currency = OFFICIAL_CURRENCY.code,
  ): MonetaryAmount {
    return new MonetaryAmount(
      Money.toFixed(value, getCurrency(currency).decimals),
      currency,
    );
  }
  decimal(): FinancialDecimal {
    return Money.decimal(this.value);
  }
  toString(): string {
    return this.value;
  }
  toJSON(): Readonly<{ amount: string; currency: string }> {
    return { amount: this.value, currency: this.currency };
  }
  private checkCurrency(other: MonetaryAmount): void {
    if (this.currency !== other.currency)
      throw new RangeError('Cannot combine different currencies');
  }
  add(other: MonetaryAmount): MonetaryAmount {
    this.checkCurrency(other);
    return MonetaryAmount.from(
      Money.addDecimal(this.value, other.value),
      this.currency,
    );
  }
  subtract(other: MonetaryAmount): MonetaryAmount {
    this.checkCurrency(other);
    return MonetaryAmount.from(
      Money.subtractDecimal(this.value, other.value),
      this.currency,
    );
  }
  multiply(quantity: Quantity): MonetaryAmount {
    return MonetaryAmount.from(
      Money.multiply(this.value, quantity.decimal()),
      this.currency,
    );
  }
  percentage(percent: Percentage): MonetaryAmount {
    return MonetaryAmount.from(
      Money.percentDecimal(this.value, percent.decimal()),
      this.currency,
    );
  }
  convert(rate: ExchangeRate): MonetaryAmount {
    if (rate.fromCurrency !== this.currency)
      throw new RangeError('Exchange rate source currency does not match');
    return MonetaryAmount.from(
      Money.multiply(this.value, rate.decimal()),
      rate.toCurrency,
    );
  }
  allocate(weights: readonly MoneyValue[]): MonetaryAmount[] {
    return Money.allocate(
      this.value,
      weights,
      getCurrency(this.currency).decimals,
    ).map((value) => MonetaryAmount.from(value, this.currency));
  }
}
