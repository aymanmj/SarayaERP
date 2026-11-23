// src/common/utils/money.util.ts
// مكتبة الحسابات المالية الدقيقة - نسخة مؤسسية موحدة متعددة العملات (مقتبسة ومطورة من @saraya/shared-utils)

import Decimal from 'decimal.js';

// A private constructor prevents unrelated Decimal consumers from changing financial policy.
// Preserve small intermediate rates and large totals; round only at explicit boundaries.
/** The only approved financial rounding policy: round midpoint ties to even (Banker's Rounding). */
export const MONEY_SCALE = 3;
/** Four-decimal database scale for unit prices, WAC unit costs, and intermediate tariffs: DECIMAL(19, 4). */
export const UNIT_PRICE_SCALE = 4;
/** Six-decimal database scale for percentages, commission/copay/fee rates, UOM conversions, and FX rates: DECIMAL(19, 6). */
export const RATE_SCALE = 6;
export const BANKERS_ROUNDING = Decimal.ROUND_HALF_EVEN;
export type FinancialDecimal = Decimal;

const FinancialDecimal = Decimal.clone({
  precision: 40,
  rounding: BANKERS_ROUNDING,
  minE: -9e15,
  maxE: 9e15,
});

export type DecimalLike = { toString(): string; toNumber?: () => number };
export type MoneyValue =
  | number
  | string
  | Decimal
  | DecimalLike
  | null
  | undefined;

function moneyDecimal(value: MoneyValue): Decimal {
  if (value === null || value === undefined || value === '') {
    return new FinancialDecimal(0);
  }
  if (
    typeof value === 'object' &&
    !(value instanceof Decimal) &&
    !(value instanceof FinancialDecimal)
  ) {
    if (
      typeof value.toString !== 'function' ||
      value.toString() === '[object Object]'
    ) {
      throw new TypeError('A valid decimal representation is required');
    }
    value = value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return new FinancialDecimal(0);
    if (trimmed.length > 4096) {
      throw new RangeError('Financial input is too long');
    }
    value = trimmed;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new RangeError('Money requires a finite decimal value');
  }
  if (typeof value === 'number' && Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      'Pass large monetary values as decimal strings, not numbers',
    );
  }
  const result = new FinancialDecimal(value as number | string | Decimal);
  if (result.precision() > 40 || Math.abs(result.e) > 1000) {
    throw new RangeError(
      'Value exceeds the supported financial calculation range',
    );
  }
  if (!result.isFinite()) {
    throw new RangeError('Money requires a finite decimal value');
  }
  return result;
}

function assertScale(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 40) {
    throw new RangeError('Financial scale must be an integer between 0 and 40');
  }
}

/** Converts a FinancialDecimal to a safe JS number at legacy numeric boundaries. */
function compatibleNumber(value: Decimal): number {
  const numeric = value.toNumber();
  if (
    !Number.isFinite(numeric) ||
    Math.abs(numeric) > Number.MAX_SAFE_INTEGER ||
    (numeric === 0 && !value.isZero()) ||
    !value
      .toDecimalPlaces(MONEY_SCALE, BANKERS_ROUNDING)
      .eq(
        new FinancialDecimal(numeric).toDecimalPlaces(
          MONEY_SCALE,
          BANKERS_ROUNDING,
        ),
      )
  ) {
    throw new RangeError(
      'Financial precision would be lost; retain Decimal or use Money.toDbString',
    );
  }
  return numeric;
}

export function getCurrency(code: string = 'LYD'): Readonly<CurrencyConfig> {
  const currency = CURRENCIES[code];
  if (!Object.prototype.hasOwnProperty.call(CURRENCIES, code)) {
    throw new RangeError(`Unsupported currency: ${code}`);
  }
  return currency;
}

/** إعدادات العملة */
export interface CurrencyConfig {
  code: string;
  nameAr: string;
  nameEn: string;
  symbol: string;
  decimals: number; // عدد الخانات العشرية (2 لمعظم العملات، 3 للدينار)
  subUnitNameAr: string; // اسم الوحدة الفرعية (قرش، درهم، هللة)
  subUnitNameEn: string;
}

/** العملات المدعومة */
export const CURRENCIES: Readonly<Record<string, Readonly<CurrencyConfig>>> = {
  SDG: {
    code: 'SDG',
    nameAr: 'جنيه سوداني',
    nameEn: 'Sudanese Pound',
    symbol: 'ج.س',
    decimals: 2,
    subUnitNameAr: 'قرش',
    subUnitNameEn: 'Qirsh',
  },
  SAR: {
    code: 'SAR',
    nameAr: 'ريال سعودي',
    nameEn: 'Saudi Riyal',
    symbol: 'ر.س',
    decimals: 2,
    subUnitNameAr: 'هللة',
    subUnitNameEn: 'Halala',
  },
  AED: {
    code: 'AED',
    nameAr: 'درهم إماراتي',
    nameEn: 'UAE Dirham',
    symbol: 'د.إ',
    decimals: 2,
    subUnitNameAr: 'فلس',
    subUnitNameEn: 'Fils',
  },
  EGP: {
    code: 'EGP',
    nameAr: 'جنيه مصري',
    nameEn: 'Egyptian Pound',
    symbol: 'ج.م',
    decimals: 2,
    subUnitNameAr: 'قرش',
    subUnitNameEn: 'Piastre',
  },
  LYD: {
    code: 'LYD',
    nameAr: 'دينار ليبي',
    nameEn: 'Libyan Dinar',
    symbol: 'د.ل',
    decimals: 3,
    subUnitNameAr: 'درهم',
    subUnitNameEn: 'Dirham',
  },
  KWD: {
    code: 'KWD',
    nameAr: 'دينار كويتي',
    nameEn: 'Kuwaiti Dinar',
    symbol: 'د.ك',
    decimals: 3,
    subUnitNameAr: 'فلس',
    subUnitNameEn: 'Fils',
  },
  USD: {
    code: 'USD',
    nameAr: 'دولار أمريكي',
    nameEn: 'US Dollar',
    symbol: '$',
    decimals: 2,
    subUnitNameAr: 'سنت',
    subUnitNameEn: 'Cent',
  },
  EUR: {
    code: 'EUR',
    nameAr: 'يورو',
    nameEn: 'Euro',
    symbol: '€',
    decimals: 2,
    subUnitNameAr: 'سنت',
    subUnitNameEn: 'Cent',
  },
};
Object.values(CURRENCIES).forEach((config) => Object.freeze(config));
Object.freeze(CURRENCIES);

/** Shared default for monetary amounts and measured quantities. */
export const OFFICIAL_CURRENCY = Object.freeze({
  ...CURRENCIES.LYD,
  subUnit: CURRENCIES.LYD.subUnitNameAr,
});

/**
 * 💰 Money Utility Class
 * فئة مساعدة لإجراء العمليات الحسابية المالية بدقة 40 خانة عشرية والتقريب المصرفي المعتمد (ROUND_HALF_EVEN)
 */
export class Money {
  static decimal(value: MoneyValue): Decimal {
    return moneyDecimal(value);
  }

  static addDecimal(a: MoneyValue, b: MoneyValue): Decimal {
    return moneyDecimal(a).plus(moneyDecimal(b));
  }

  static subtractDecimal(a: MoneyValue, b: MoneyValue): Decimal {
    return moneyDecimal(a).minus(moneyDecimal(b));
  }

  static percentDecimal(amount: MoneyValue, percent: MoneyValue): Decimal {
    return Money.multiply(amount, percent).div(100);
  }

  static rateDecimal(amount: MoneyValue, rate: MoneyValue): Decimal {
    return Money.multiply(amount, rate);
  }

  /** Strict numeric boundary; falls back to compatibleNumber for safe 3dp representation. */
  static toNumber(value: MoneyValue): number {
    const decimal = moneyDecimal(value);
    const number = decimal.toNumber();
    if (
      !Number.isFinite(number) ||
      Math.abs(number) > Number.MAX_SAFE_INTEGER
    ) {
      throw new RangeError('Value cannot be represented safely as a number');
    }
    if (!decimal.eq(String(number))) {
      throw new RangeError('Value cannot be represented exactly as a number');
    }
    return number;
  }

  static currencyDecimal(
    value: MoneyValue,
    currencyCode = OFFICIAL_CURRENCY.code,
  ): Decimal {
    return Money.roundDecimal(value, getCurrency(currencyCode).decimals);
  }

  static decimalMin(...values: MoneyValue[]): Decimal {
    if (!values.length)
      throw new RangeError('Money.decimalMin requires values');
    return FinancialDecimal.min(...values.map(moneyDecimal));
  }

  static minDecimal(...values: MoneyValue[]): Decimal {
    return Money.decimalMin(...values);
  }

  static maxDecimal(...values: MoneyValue[]): Decimal {
    return Money.decimalMax(...values);
  }

  static decimalMax(...values: MoneyValue[]): Decimal {
    if (!values.length)
      throw new RangeError('Money.decimalMax requires values');
    return FinancialDecimal.max(...values.map(moneyDecimal));
  }

  static toFixed(value: MoneyValue, decimals = 3): string {
    assertScale(decimals);
    return moneyDecimal(value).toFixed(decimals, BANKERS_ROUNDING);
  }

  // ======================== العمليات الأساسية ========================

  /** جمع قيمتين */
  static add(a: MoneyValue, b: MoneyValue): number {
    return compatibleNumber(Money.addDecimal(a, b));
  }

  /** طرح قيمتين: a - b */
  static sub(a: MoneyValue, b: MoneyValue): number {
    return compatibleNumber(Money.subtractDecimal(a, b));
  }

  /** ضرب قيمتين */
  static mul(a: MoneyValue, b: MoneyValue): number {
    return compatibleNumber(Money.multiply(a, b));
  }

  /** قسمة: a / b */
  static div(a: MoneyValue, b: MoneyValue): number {
    if (moneyDecimal(b).isZero()) {
      throw new Error('Division by zero');
    }
    return compatibleNumber(Money.divide(a, b));
  }

  // ======================== عمليات متقدمة ========================

  /** Exact sum for calculations and database writes, with no numeric intermediate. */
  static sumDecimal(...values: MoneyValue[]): Decimal {
    return values.reduce<Decimal>(
      (total, value) => total.plus(moneyDecimal(value)),
      moneyDecimal(0),
    );
  }

  /** Sum the amounts that will actually be posted, rather than unrounded components. */
  static sumPosted(...values: MoneyValue[]): Decimal {
    return Money.sumDecimal(
      ...values.map((value) => Money.roundDecimal(value)),
    );
  }

  /** Normalize measured quantities (3dp) and unit prices (3dp legacy boundary) before computing a posted line. */
  static postedLine(unitPrice: MoneyValue, quantity: MoneyValue) {
    const storedQuantity = Money.toDb(quantity);
    const storedPrice = Money.toDb(unitPrice);
    return {
      quantity: storedQuantity,
      unitPrice: storedPrice,
      totalPrice: Money.toDb(Money.multiply(storedPrice, storedQuantity)),
    };
  }

  /** Normalize measured quantities (3dp) and high-precision unit prices (4dp DECIMAL(19,4)) with 3dp posted line total. */
  static postedUnitLine(unitPrice: MoneyValue, quantity: MoneyValue) {
    const storedQuantity = Money.toDb(quantity);
    const storedPrice = Money.toUnitDb(unitPrice);
    return {
      quantity: storedQuantity,
      unitPrice: storedPrice,
      unitPriceDb: Money.toUnitDbString(storedPrice),
      totalPrice: Money.toDb(Money.multiply(storedPrice, storedQuantity)),
      totalPriceDb: Money.toDbString(
        Money.multiply(storedPrice, storedQuantity),
      ),
    };
  }

  /**
   * Largest-remainder allocation in integer minor units; ties follow input order.
   * The total is rounded once with half-even, then conserved exactly, also for negatives.
   */
  static allocate(
    total: MoneyValue,
    weights: readonly MoneyValue[],
    decimals = MONEY_SCALE,
  ): string[] {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) {
      throw new RangeError('Invalid allocation scale');
    }
    if (!weights.length || weights.length > 10000) {
      throw new RangeError('Allocation requires 1 to 10000 weights');
    }
    const values = weights.map(moneyDecimal);
    if (values.some((value) => value.isNegative() && !value.isZero())) {
      throw new RangeError('Weights must be nonnegative');
    }
    const scale = Math.max(...values.map((value) => value.decimalPlaces()));
    const integers = values.map((value) =>
      BigInt(value.toFixed(scale).replace('.', '')),
    );
    const denominator = integers.reduce((sum, value) => sum + value, 0n);
    if (!denominator) {
      throw new RangeError('At least one allocation weight must be positive');
    }
    const posted = BigInt(Money.toFixed(total, decimals).replace('.', ''));
    const negative = posted < 0n;
    const units = negative ? -posted : posted;
    const shares = integers.map((weight, index) => ({
      index,
      units: (units * weight) / denominator,
      remainder: (units * weight) % denominator,
    }));
    let remaining =
      units - shares.reduce((sum, share) => sum + share.units, 0n);
    const ranked = [...shares].sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
    for (const share of ranked) {
      if (!remaining) break;
      share.units++;
      remaining--;
    }
    return shares.map((share) => {
      const digits = share.units.toString().padStart(decimals + 1, '0');
      const fixed = decimals
        ? digits.slice(0, -decimals) + '.' + digits.slice(-decimals)
        : digits;
      return negative && share.units !== 0n ? '-' + fixed : fixed;
    });
  }

  static split(
    total: MoneyValue,
    count: number,
    decimals = MONEY_SCALE,
  ): string[] {
    if (!Number.isInteger(count) || count < 1 || count > 10000) {
      throw new RangeError('Invalid split count');
    }
    return Money.allocate(total, Array<MoneyValue>(count).fill(1), decimals);
  }

  /**
   * تقسيم مبلغ الفاتورة بين حصة المريض وحصة التأمين مع ضمان تطابق المجموع 100% دون فقدان أي درهم
   * @param totalAmount إجمالي المبلغ
   * @param patientRate نسبة تحمل المريض (كعامل مثل 0.20 أو نسبة مئوية إذا كانت > 1)
   */
  static splitShare(
    totalAmount: MoneyValue,
    patientRate: MoneyValue,
    decimals: number = MONEY_SCALE,
  ): { patientShare: number; insuranceShare: number } {
    const total = Money.round(totalAmount, decimals);
    const rateDec = moneyDecimal(patientRate);
    const normalizedRate = rateDec.gt(1) ? rateDec.div(100) : rateDec;
    const patientShare = Money.round(
      Money.multiply(total, normalizedRate),
      decimals,
    );
    const insuranceShare = Money.round(
      Money.subtractDecimal(total, patientShare),
      decimals,
    );
    return { patientShare, insuranceShare };
  }

  static sum(...values: MoneyValue[]): number {
    return compatibleNumber(Money.sumDecimal(...values));
  }

  /** حساب النسبة المئوية: (amount * percent / 100) */
  static percent(amount: MoneyValue, percent: MoneyValue): number {
    return compatibleNumber(Money.percentDecimal(amount, percent));
  }

  /** حساب النسبة كعامل: (amount * rate) حيث rate عدد عشري مثل 0.15 */
  static rate(amount: MoneyValue, rateValue: MoneyValue): number {
    return compatibleNumber(Money.rateDecimal(amount, rateValue));
  }

  /** حساب المتبقي: base - deduction */
  static remaining(base: MoneyValue, deduction: MoneyValue): number {
    return Money.sub(base, deduction);
  }

  // ======================== التقريب والتنسيق ========================

  /** تقريب لـ 3 خانات عشرية (للدينار الليبي/الكويتي) للتخزين في قاعدة البيانات */
  static toDb(amount: MoneyValue): number {
    return Money.to3dp(amount);
  }

  /** Exact three-place string for Prisma Decimal(18,3) final monetary columns. */
  static toDbString(value: MoneyValue): string {
    return Money.toFixed(value, OFFICIAL_CURRENCY.decimals);
  }

  /** تقريب لـ 4 خانات عشرية لأسعار الوحدات وتكلفة المتوسط المرجّح WAC: DECIMAL(19, 4) */
  static toUnitDb(amount: MoneyValue): number {
    return Money.to4dp(amount);
  }

  /** Exact four-place string for Prisma Decimal(19,4) unit price and WAC cost columns. */
  static toUnitDbString(value: MoneyValue): string {
    return Money.toFixed(value, UNIT_PRICE_SCALE);
  }

  /** تقريب لـ 6 خانات عشرية للنسب والعمولات ومعاملات التحويل وأسعار الصرف: DECIMAL(19, 6) */
  static toRateDb(value: MoneyValue): number {
    return Money.to6dp(value);
  }

  /** Exact six-place string for Prisma Decimal(19,6) percentage, conversion, and FX rate columns. */
  static toRateDbString(value: MoneyValue): string {
    return Money.toFixed(value, RATE_SCALE);
  }

  /** تقريب حسب عدد خانات العملة */
  static toCurrency(
    amount: MoneyValue,
    currencyCode: string = OFFICIAL_CURRENCY.code,
  ): number {
    return Money.toNumber(Money.currencyDecimal(amount, currencyCode));
  }

  /** تقريب لـ 2 خانات عشرية */
  static to2dp(amount: MoneyValue): number {
    return Money.toNumber(Money.roundDecimal(amount, 2));
  }

  /** تقريب لـ 3 خانات عشرية */
  static to3dp(amount: MoneyValue): number {
    return Money.toNumber(Money.roundDecimal(amount, 3));
  }

  /** تقريب لـ 4 خانات عشرية (أسعار الوحدات والتكاليف) */
  static to4dp(amount: MoneyValue): number {
    return Money.toNumber(Money.roundDecimal(amount, UNIT_PRICE_SCALE));
  }

  /** تقريب لـ 6 خانات عشرية (النسب وأسعار الصرف ومعاملات التحويل) */
  static to6dp(amount: MoneyValue): number {
    return Money.toNumber(Money.roundDecimal(amount, RATE_SCALE));
  }

  /** تقريب لعدد مخصص من الخانات (الافتراضي 3 للدينار والوحدات المصرفية) */
  static round(amount: MoneyValue, decimals: number = 3): number {
    return Money.toNumber(Money.roundDecimal(amount, decimals));
  }

  /** تقريب لأعلى */
  static ceil(amount: MoneyValue, decimals: number = 3): number {
    assertScale(decimals);
    return Money.toNumber(
      moneyDecimal(amount).toDecimalPlaces(decimals, Decimal.ROUND_CEIL),
    );
  }

  /** تقريب لأسفل */
  static floor(amount: MoneyValue, decimals: number = 3): number {
    assertScale(decimals);
    return Money.toNumber(
      moneyDecimal(amount).toDecimalPlaces(decimals, Decimal.ROUND_FLOOR),
    );
  }

  // ======================== المقارنات ========================

  static eq(a: MoneyValue, b: MoneyValue): boolean {
    return moneyDecimal(a).equals(moneyDecimal(b));
  }

  static gt(a: MoneyValue, b: MoneyValue): boolean {
    return moneyDecimal(a).greaterThan(moneyDecimal(b));
  }

  static gte(a: MoneyValue, b: MoneyValue): boolean {
    return moneyDecimal(a).greaterThanOrEqualTo(moneyDecimal(b));
  }

  static lt(a: MoneyValue, b: MoneyValue): boolean {
    return moneyDecimal(a).lessThan(moneyDecimal(b));
  }

  static lte(a: MoneyValue, b: MoneyValue): boolean {
    return moneyDecimal(a).lessThanOrEqualTo(moneyDecimal(b));
  }

  static isZero(amount: MoneyValue): boolean {
    return moneyDecimal(amount).isZero();
  }

  static isPositive(amount: MoneyValue): boolean {
    return moneyDecimal(amount).gt(0);
  }

  static isNegative(amount: MoneyValue): boolean {
    return moneyDecimal(amount).lt(0);
  }

  // ======================== دوال مساعدة للأعمال ========================

  /** حساب الإجمالي مع الضريبة */
  static withTax(amount: MoneyValue, taxRate: MoneyValue): number {
    return compatibleNumber(Money.withTaxDecimal(amount, taxRate));
  }

  /** حساب الصافي بعد الخصم */
  static withDiscount(amount: MoneyValue, discountRate: MoneyValue): number {
    return compatibleNumber(Money.withDiscountDecimal(amount, discountRate));
  }

  /** Rates are factors: 0.15 means 15%; percentDecimal accepts 15 instead. */
  static withTaxDecimal(amount: MoneyValue, taxRate: MoneyValue): Decimal {
    return Money.addDecimal(amount, Money.rateDecimal(amount, taxRate));
  }

  static withDiscountDecimal(
    amount: MoneyValue,
    discountRate: MoneyValue,
  ): Decimal {
    return Money.subtractDecimal(
      amount,
      Money.rateDecimal(amount, discountRate),
    );
  }

  /** سعر الوحدة */
  static unitPrice(totalAmount: MoneyValue, quantity: MoneyValue): number {
    return Money.div(totalAmount, quantity);
  }

  /** إجمالي السطر */
  static lineTotal(
    unitPrice: MoneyValue,
    quantity: MoneyValue,
    currencyCode: string = OFFICIAL_CURRENCY.code,
  ): number {
    return Money.toCurrency(Money.multiply(unitPrice, quantity), currencyCode);
  }

  /** المعدل اليومي: monthlyAmount / 30 */
  static dailyRate(monthlyAmount: MoneyValue): number {
    return Money.div(monthlyAmount, 30);
  }

  /** المعدل بالساعة: dailyRate / 8 */
  static hourlyRate(dailyAmount: MoneyValue): number {
    return Money.div(dailyAmount, 8);
  }

  /** المعدل بالدقيقة */
  static minuteRate(hourlyAmount: MoneyValue): number {
    return Money.div(hourlyAmount, 60);
  }

  /** حساب ساعة إضافية عادية: (الراتب / 30 / 8) × المضاعف */
  static overtimeHourly(
    monthlySalary: MoneyValue,
    multiplier: number = 1.5,
  ): number {
    return compatibleNumber(
      Money.divide(monthlySalary, 240).times(moneyDecimal(multiplier)),
    );
  }

  /** تنسيق المبلغ مع رمز العملة */
  static format(
    amount: MoneyValue,
    currencyCode: string = OFFICIAL_CURRENCY.code,
  ): string {
    const config = getCurrency(currencyCode);
    const { decimals, symbol } = config;
    return `${Money.toFixed(amount, decimals)} ${symbol}`;
  }

  /** ضرب قيمتين وإعادة Decimal بدقة فائقة دون تحويل وسيط */
  static multiply(a: MoneyValue, b: MoneyValue): Decimal {
    return moneyDecimal(a).times(moneyDecimal(b));
  }

  /** قسمة قيمتين وإعادة Decimal بدقة فائقة مع حماية منع القسمة على صفر */
  static divide(a: MoneyValue, b: MoneyValue): Decimal {
    const divisor = moneyDecimal(b);
    if (divisor.isZero())
      throw new Error('Division by zero in Money calculation');
    return moneyDecimal(a).div(divisor);
  }

  /** Preserve existing numeric API values when exact; use a decimal string otherwise. */
  static toWire(value: MoneyValue): number | string {
    const decimal = moneyDecimal(value);
    const numeric = decimal.toNumber();
    return Number.isFinite(numeric) &&
      Math.abs(numeric) <= Number.MAX_SAFE_INTEGER &&
      decimal.eq(String(numeric))
      ? numeric
      : decimal.toString();
  }

  /** تقريب المنتصف إلى الزوجي وإعادة Decimal للحفاظ على السلسلة الحسابية */
  static roundDecimal(amount: MoneyValue, decimals: number = 3): Decimal {
    assertScale(decimals);
    return moneyDecimal(amount).toDecimalPlaces(decimals, BANKERS_ROUNDING);
  }

  /** تحويل Prisma Decimal أو أي تمثيل نصي/رقمي إلى number بأمان */
  static fromPrisma(
    value:
      | { toString(): string; toNumber?: () => number }
      | number
      | string
      | null
      | undefined,
  ): number {
    if (value == null) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') return Money.toNumber(value);
    if (
      typeof value.toString === 'function' &&
      value.toString() !== '[object Object]'
    ) {
      return Money.toNumber(value.toString());
    }
    if (typeof value.toNumber === 'function') {
      return value.toNumber();
    }
    throw new TypeError('A decimal string representation is required');
  }

  /** إنشاء كائن Money للعمليات المتسلسلة */
  static from(value: MoneyValue): MoneyChain {
    return new MoneyChain(value);
  }
}

/**
 * 🔗 MoneyChain - عمليات متسلسلة (Fluent API)
 * @example
 * Money.from(1000).sub(100).rate(0.15).add(50).toDb()
 */
export class MoneyChain {
  private value: Decimal;

  constructor(initial: MoneyValue) {
    this.value = moneyDecimal(initial);
  }

  add(amount: MoneyValue): MoneyChain {
    this.value = this.value.plus(moneyDecimal(amount));
    return this;
  }

  sub(amount: MoneyValue): MoneyChain {
    this.value = this.value.minus(moneyDecimal(amount));
    return this;
  }

  mul(amount: MoneyValue): MoneyChain {
    this.value = this.value.times(moneyDecimal(amount));
    return this;
  }

  div(amount: MoneyValue): MoneyChain {
    if (moneyDecimal(amount).isZero()) throw new Error('Division by zero');
    this.value = this.value.div(moneyDecimal(amount));
    return this;
  }

  rate(rateValue: MoneyValue): MoneyChain {
    this.value = this.value.times(moneyDecimal(rateValue));
    return this;
  }

  percent(percentValue: MoneyValue): MoneyChain {
    this.value = this.value.times(moneyDecimal(percentValue)).div(100);
    return this;
  }

  round(decimals: number = 3): MoneyChain {
    this.value = Money.roundDecimal(this.value, decimals);
    return this;
  }

  roundDecimal(decimals: number = 3): Decimal {
    return Money.roundDecimal(this.value, decimals);
  }

  toFixed(decimals = 3): string {
    return Money.toFixed(this.value, decimals);
  }

  /** الحصول على القيمة مقربة لـ 3 خانات للتخزين كـ number */
  toDb(): number {
    return Money.toDb(this.value);
  }

  /** الحصول على القيمة مقربة لـ 3 خانات كـ string */
  toDbString(): string {
    return Money.toDbString(this.value);
  }

  /** الحصول على سعر الوحدة / التكلفة مقربًا لـ 4 خانات */
  toUnitDb(): number {
    return Money.toUnitDb(this.value);
  }

  /** الحصول على سعر الوحدة / التكلفة مقربًا لـ 4 خانات كـ string */
  toUnitDbString(): string {
    return Money.toUnitDbString(this.value);
  }

  /** الحصول على النسبة / سعر الصرف مقربًا لـ 6 خانات */
  toRateDb(): number {
    return Money.toRateDb(this.value);
  }

  /** الحصول على النسبة / سعر الصرف مقربًا لـ 6 خانات كـ string */
  toRateDbString(): string {
    return Money.toRateDbString(this.value);
  }

  decimal(): Decimal {
    return this.value;
  }

  toNumber(): number {
    return Money.toNumber(this.value);
  }

  to2dp(): number {
    return Money.to2dp(this.value);
  }

  to3dp(): number {
    return Money.to3dp(this.value);
  }

  to4dp(): number {
    return Money.to4dp(this.value);
  }

  to6dp(): number {
    return Money.to6dp(this.value);
  }

  toCurrency(currencyCode: string = OFFICIAL_CURRENCY.code): number {
    return Money.toCurrency(this.value, currencyCode);
  }
}

export default Money;
