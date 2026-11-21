// src/common/utils/number.util.ts
// Shared parsing and display policy: LYD, three places, Latin digits.

import {
  getCurrency,
  Money,
  OFFICIAL_CURRENCY,
  type MoneyValue,
} from './money.util';

export { OFFICIAL_CURRENCY } from './money.util';
export { inputDecimal as parseDecimal };

type NumericInput = MoneyValue | null | undefined;

/** Accept a complete decimal, scientific notation, or a grouped LYD amount.
 * Empty form fields retain their historical zero value; malformed input throws.
 */
function inputDecimal(value: NumericInput) {
  if (value == null) return Money.decimal(0);
  if (typeof value !== 'string') return Money.decimal(value);
  let text = value.trim();
  if (!text) return Money.decimal(0);
  text = text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, ',')
    .replace(/[\u061c\u200e\u200f]/g, '')
    .replace(/\s*(?:د\.ل|LYD)$/i, '')
    .trim();

  // Validate grouping before removing it: '1,25' must never turn into 125.
  const decimal =
    /^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!decimal.test(text)) throw new RangeError('Invalid monetary input');
  return Money.decimal(text.replace(/,/g, ''));
}

/** Format the integer as BigInt, then insert the exact rounded fraction.
 * This avoids the precision loss of converting a financial string to number.
 */
function formatExact(
  value: NumericInput,
  decimals: number,
  locale = 'en-US',
  currency?: string,
): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) {
    throw new RangeError(
      'Display decimals must be an integer between 0 and 20',
    );
  }
  const rounded = Money.roundDecimal(inputDecimal(value), decimals);
  const fixed = Money.toFixed(rounded.isZero() ? 0 : rounded, decimals);
  const [integer, fraction] = fixed.split('.');
  const whole = BigInt(integer);
  const formatted = new Intl.NumberFormat(locale, {
    numberingSystem: 'latn',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    ...(currency ? { style: 'currency', currency } : {}),
  });
  // BigInt has no negative zero; retain the sign of amounts between -1 and 0.
  return formatted
    .formatToParts(whole === 0n && integer.startsWith('-') ? -0 : whole)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
}

/** LYD amount with Latin digits, grouped thousands and exact half-even rounding. */
export function formatMoney(
  amount: NumericInput,
  includeSymbol: boolean = true,
  decimals: number = OFFICIAL_CURRENCY.decimals,
): string {
  const formatted = formatExact(amount, decimals);
  return includeSymbol ? `${formatted} ${OFFICIAL_CURRENCY.symbol}` : formatted;
}

/** Pass 0 explicitly when displaying counts rather than measured quantities. */
export function formatNumber(
  value: NumericInput,
  decimals: number = OFFICIAL_CURRENCY.decimals,
): string {
  return formatExact(value, decimals);
}

/** Input is already a percentage (12.5 means 12.5%, not 1250%).
 * Undefined ratios (e.g. 0 / 0 in empty reports) display as unavailable.
 */
export function formatPercent(
  value: NumericInput,
  decimals: number = OFFICIAL_CURRENCY.decimals,
): string {
  if (typeof value === 'number' && !Number.isFinite(value)) return '-';
  return `${Money.toFixed(inputDecimal(value), decimals)}%`;
}

/** Numeric compatibility boundary. Reject values a number cannot preserve.
 * Use Money.decimal/plain decimal strings for exact calculations and storage.
 */
export function parseMoney(value: NumericInput): number {
  const decimal = inputDecimal(value);
  return Money.toNumber(decimal);
}

export class NumberUtils {
  /** A locale string remains supported for callers of the original API. */
  static formatNumber(
    value: NumericInput,
    decimalsOrLocale: number | string = OFFICIAL_CURRENCY.decimals,
  ): string {
    return typeof decimalsOrLocale === 'string'
      ? formatExact(value, OFFICIAL_CURRENCY.decimals, decimalsOrLocale)
      : formatNumber(value, decimalsOrLocale);
  }

  static formatPercent(
    value: NumericInput,
    decimals: number = OFFICIAL_CURRENCY.decimals,
  ): string {
    return formatPercent(value, decimals);
  }

  static formatCurrency(
    value: NumericInput,
    currency: string = OFFICIAL_CURRENCY.code,
    locale: string = 'en-US',
  ): string {
    const amount = inputDecimal(value);
    if (currency === OFFICIAL_CURRENCY.code) {
      return `${formatExact(amount, OFFICIAL_CURRENCY.decimals, locale)} ${OFFICIAL_CURRENCY.symbol}`;
    }
    const decimals = getCurrency(currency).decimals;
    return formatExact(amount, decimals, locale, currency);
  }

  static formatMoney(
    amount: NumericInput,
    includeSymbol: boolean = true,
    decimals: number = OFFICIAL_CURRENCY.decimals,
  ): string {
    return formatMoney(amount, includeSymbol, decimals);
  }

  static parseMoney(value: NumericInput): number {
    return parseMoney(value);
  }

  static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  static isBetween(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }
}
