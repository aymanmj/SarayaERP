// src/common/utils/money.util.ts
// مكتبة الحسابات المالية الدقيقة - نسخة محسّنة وشاملة

import Decimal from 'decimal.js';

// ✅ تكوين الدقة العالية للعمليات الحسابية
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  minE: -9, // أصغر أس للأعداد الصغيرة جداً
  maxE: 9, // أكبر أس
});

type MoneyValue = number | string | Decimal;

/**
 * 💰 Money Utility Class
 * فئة مساعدة لإجراء العمليات الحسابية المالية بدقة عالية
 * تستخدم مكتبة decimal.js لتجنب أخطاء الأرقام العشرية في JavaScript
 *
 * @example
 * // جمع
 * Money.add(10.1, 20.2) // 30.3 (بدلاً من 30.299999999999997)
 *
 * // حساب العمولة
 * Money.mul(1000, 0.15) // 150
 *
 * // حساب نسبة مئوية
 * Money.percent(500, 20) // 100 (20% من 500)
 */
export class Money {
  // ======================== العمليات الأساسية ========================

  /** جمع قيمتين */
  static add(a: MoneyValue, b: MoneyValue): number {
    return new Decimal(a).plus(new Decimal(b)).toNumber();
  }

  /** طرح قيمتين: a - b */
  static sub(a: MoneyValue, b: MoneyValue): number {
    return new Decimal(a).minus(new Decimal(b)).toNumber();
  }

  /** ضرب قيمتين */
  static mul(a: MoneyValue, b: MoneyValue): number {
    return new Decimal(a).times(new Decimal(b)).toNumber();
  }

  /** قسمة: a / b */
  static div(a: MoneyValue, b: MoneyValue): number {
    if (new Decimal(b).isZero()) {
      throw new Error('Division by zero');
    }
    return new Decimal(a).div(new Decimal(b)).toNumber();
  }

  // ======================== عمليات متقدمة ========================

  /** جمع مصفوفة من القيم */
  static sum(...values: MoneyValue[]): number {
    return values
      .reduce<Decimal>((acc, val) => acc.plus(new Decimal(val)), new Decimal(0))
      .toNumber();
  }

  /** حساب النسبة المئوية: (amount * percent / 100) */
  static percent(amount: MoneyValue, percent: MoneyValue): number {
    return new Decimal(amount).times(new Decimal(percent)).div(100).toNumber();
  }

  /** حساب النسبة كعامل: (amount * rate) حيث rate عدد عشري مثل 0.15 */
  static rate(amount: MoneyValue, rate: MoneyValue): number {
    return new Decimal(amount).times(new Decimal(rate)).toNumber();
  }

  /** حساب المتبقي: base - deduction */
  static remaining(base: MoneyValue, deduction: MoneyValue): number {
    return Money.sub(base, deduction);
  }

  // ======================== التقريب والتنسيق ========================

  /** تقريب لـ 3 خانات عشرية (للدينار الليبي/الكويتي) */
  static toDb(amount: MoneyValue): number {
    return new Decimal(amount)
      .toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  /** تقريب لـ 2 خانات عشرية (للعملات القياسية USD, EUR, SAR) */
  static to2dp(amount: MoneyValue): number {
    return new Decimal(amount)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  /** تقريب لعدد مخصص من الخانات */
  static round(amount: MoneyValue, decimals: number = 3): number {
    return new Decimal(amount)
      .toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  /** تقريب لأعلى */
  static ceil(amount: MoneyValue, decimals: number = 3): number {
    return new Decimal(amount)
      .toDecimalPlaces(decimals, Decimal.ROUND_UP)
      .toNumber();
  }

  /** تقريب لأسفل */
  static floor(amount: MoneyValue, decimals: number = 3): number {
    return new Decimal(amount)
      .toDecimalPlaces(decimals, Decimal.ROUND_DOWN)
      .toNumber();
  }

  // ======================== المقارنات ========================

  /** هل القيمتان متساويتان؟ */
  static eq(a: MoneyValue, b: MoneyValue): boolean {
    return new Decimal(a).equals(new Decimal(b));
  }

  /** هل a أكبر من b؟ */
  static gt(a: MoneyValue, b: MoneyValue): boolean {
    return new Decimal(a).greaterThan(new Decimal(b));
  }

  /** هل a أكبر من أو تساوي b؟ */
  static gte(a: MoneyValue, b: MoneyValue): boolean {
    return new Decimal(a).greaterThanOrEqualTo(new Decimal(b));
  }

  /** هل a أصغر من b؟ */
  static lt(a: MoneyValue, b: MoneyValue): boolean {
    return new Decimal(a).lessThan(new Decimal(b));
  }

  /** هل a أصغر من أو تساوي b؟ */
  static lte(a: MoneyValue, b: MoneyValue): boolean {
    return new Decimal(a).lessThanOrEqualTo(new Decimal(b));
  }

  /** هل القيمة صفر؟ */
  static isZero(amount: MoneyValue): boolean {
    return new Decimal(amount).isZero();
  }

  /** هل القيمة موجبة؟ */
  static isPositive(amount: MoneyValue): boolean {
    return new Decimal(amount).isPositive();
  }

  /** هل القيمة سالبة؟ */
  static isNegative(amount: MoneyValue): boolean {
    return new Decimal(amount).isNegative();
  }

  // ======================== دوال مساعدة للأعمال ========================

  /** حساب الإجمالي مع الضريبة: amount + (amount * taxRate) */
  static withTax(amount: MoneyValue, taxRate: MoneyValue): number {
    const tax = Money.rate(amount, taxRate);
    return Money.add(amount, tax);
  }

  /** حساب الصافي بعد الخصم: amount - (amount * discountRate) */
  static withDiscount(amount: MoneyValue, discountRate: MoneyValue): number {
    const discount = Money.rate(amount, discountRate);
    return Money.sub(amount, discount);
  }

  /** حساب سعر الوحدة: totalAmount / quantity */
  static unitPrice(totalAmount: MoneyValue, quantity: MoneyValue): number {
    return Money.div(totalAmount, quantity);
  }

  /** حساب الإجمالي: unitPrice * quantity */
  static lineTotal(unitPrice: MoneyValue, quantity: MoneyValue): number {
    return Money.toDb(Money.mul(unitPrice, quantity));
  }

  /** حساب المعدل اليومي: monthlyAmount / 30 */
  static dailyRate(monthlyAmount: MoneyValue): number {
    return Money.div(monthlyAmount, 30);
  }

  /** حساب المعدل بالساعة: dailyRate / 8 */
  static hourlyRate(dailyAmount: MoneyValue): number {
    return Money.div(dailyAmount, 8);
  }

  /** حساب المعدل بالدقيقة: hourlyRate / 60 */
  static minuteRate(hourlyAmount: MoneyValue): number {
    return Money.div(hourlyAmount, 60);
  }

  // ======================== سلسلة العمليات (Fluent API) ========================

  /** إنشاء كائن Money للعمليات المتسلسلة */
  static from(value: MoneyValue): MoneyChain {
    return new MoneyChain(value);
  }

  // ======================== التحويل من Prisma Decimal ========================

  /** تحويل Prisma Decimal إلى number */
  static fromPrisma(value: { toNumber(): number } | null | undefined): number {
    return value?.toNumber() ?? 0;
  }
}

/**
 * 🔗 MoneyChain Class
 * فئة للعمليات المتسلسلة (Fluent API)
 *
 * @example
 * Money.from(1000)
 *   .sub(100)      // طرح 100
 *   .rate(0.15)    // ضرب في 0.15
 *   .add(50)       // إضافة 50
 *   .toDb()        // تقريب للتخزين
 */
export class MoneyChain {
  private value: Decimal;

  constructor(initial: MoneyValue) {
    this.value = new Decimal(initial);
  }

  add(amount: MoneyValue): MoneyChain {
    this.value = this.value.plus(new Decimal(amount));
    return this;
  }

  sub(amount: MoneyValue): MoneyChain {
    this.value = this.value.minus(new Decimal(amount));
    return this;
  }

  mul(amount: MoneyValue): MoneyChain {
    this.value = this.value.times(new Decimal(amount));
    return this;
  }

  div(amount: MoneyValue): MoneyChain {
    this.value = this.value.div(new Decimal(amount));
    return this;
  }

  rate(rateValue: MoneyValue): MoneyChain {
    this.value = this.value.times(new Decimal(rateValue));
    return this;
  }

  percent(percentValue: MoneyValue): MoneyChain {
    this.value = this.value.times(new Decimal(percentValue)).div(100);
    return this;
  }

  round(decimals: number = 3): MoneyChain {
    this.value = this.value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
    return this;
  }

  /** الحصول على القيمة كـ number */
  toNumber(): number {
    return this.value.toNumber();
  }

  /** الحصول على القيمة مقربة لـ 3 خانات للتخزين */
  toDb(): number {
    return this.value.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber();
  }

  /** الحصول على القيمة مقربة لـ 2 خانات */
  to2dp(): number {
    return this.value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }
}
