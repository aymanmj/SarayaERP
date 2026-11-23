import Decimal from "decimal.js";
import { tafqeetArabic } from "./tafqeet";
const FinancialDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_EVEN,
});
export const MONEY_SCALE = 3;
export const UNIT_PRICE_SCALE = 4;
export const RATE_SCALE = 6;
export const OFFICIAL_CURRENCY = {
  code: "LYD",
  symbol: "د.ل",
  decimals: MONEY_SCALE,
  nameAr: "دينار ليبي",
  subUnitNameAr: "درهم",
} as const;
export class Money {
  static decimal(value: Decimal.Value) {
    if (typeof value === "string" && value.length > 4096)
      throw new RangeError("Financial input is too long");
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
    )
      throw new RangeError("Pass monetary values as decimal strings");
    const result = new FinancialDecimal(value);
    if (
      !result.isFinite() ||
      result.precision() > 40 ||
      Math.abs(result.e) > 1000
    )
      throw new RangeError("Invalid financial value");
    return result;
  }
  static toFixed(value: Decimal.Value, decimals = 3) {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 40)
      throw new RangeError("Invalid financial scale");
    return this.decimal(value).toFixed(decimals, Decimal.ROUND_HALF_EVEN);
  }
  static toDbString(value: Decimal.Value) {
    const text = this.toFixed(value, MONEY_SCALE);
    if (this.decimal(text).abs().gte("1000000000000000"))
      throw new RangeError("Amount exceeds Decimal(18,3)");
    return text;
  }
  static toUnitDbString(value: Decimal.Value) {
    const text = this.toFixed(value, UNIT_PRICE_SCALE);
    if (this.decimal(text).abs().gte("1000000000000000"))
      throw new RangeError("Unit price/cost exceeds Decimal(19,4)");
    return text;
  }
  static toRateDbString(value: Decimal.Value) {
    const text = this.toFixed(value, RATE_SCALE);
    if (this.decimal(text).abs().gte("10000000000000"))
      throw new RangeError("Rate exceeds Decimal(19,6)");
    return text;
  }
  static postedUnitLine(unitPrice: Decimal.Value, quantity: Decimal.Value) {
    const unitPriceDb = this.toUnitDbString(unitPrice);
    const quantityDb = this.toFixed(quantity, MONEY_SCALE);
    const totalPriceDb = this.toDbString(
      this.decimal(unitPriceDb).times(this.decimal(quantityDb)),
    );
    return {
      unitPriceDb,
      quantityDb,
      totalPriceDb,
    };
  }
  static sumPosted(...values: Decimal.Value[]) {
    return this.sumDecimal(...values.map((v) => this.toFixed(v)));
  }
  static add(left: Decimal.Value, right: Decimal.Value) {
    const value = this.sumDecimal(left, right);
    const numeric = value.toNumber();
    if (
      !Number.isFinite(numeric) ||
      Math.abs(numeric) > Number.MAX_SAFE_INTEGER ||
      !this.decimal(this.toFixed(numeric)).eq(this.toFixed(value))
    )
      throw new RangeError("Retain the monetary value as a decimal string");
    return numeric;
  }
  static sumDecimal(...values: Decimal.Value[]) {
    return values.reduce<Decimal>(
      (total, value) => total.plus(this.decimal(value)),
      new FinancialDecimal(0),
    );
  }
}
export function formatMoney(
  amount: number | string | null | undefined,
  includeSymbol = true,
  decimals: number = OFFICIAL_CURRENCY.decimals,
): string {
  try {
    const fixed = Money.toFixed(amount ?? 0, decimals);
    const [whole, fraction] = fixed.split(".");
    const formatted =
      whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
      (fraction !== undefined ? "." + fraction : "");
    return includeSymbol
      ? `${formatted} ${OFFICIAL_CURRENCY.symbol}`
      : formatted;
  } catch {
    return "—";
  }
}
export function formatUnitPrice(
  unitPrice: number | string | null | undefined,
  includeSymbol = true,
): string {
  return formatMoney(unitPrice, includeSymbol, UNIT_PRICE_SCALE);
}
export function formatRate(
  rate: number | string | null | undefined,
  decimals: number = RATE_SCALE,
): string {
  try {
    return Money.toFixed(rate ?? 0, decimals);
  } catch {
    return "—";
  }
}
export { tafqeetArabic };
