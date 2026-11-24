// src/common/utils/index.ts
// التصدير الموحد لأدوات النظام المالية والتاريخية والنصية (Shared Utils)

export {
  BANKERS_ROUNDING,
  CURRENCIES,
  getCurrency,
  Money,
  MONEY_SCALE,
  MoneyChain,
  OFFICIAL_CURRENCY,
} from './money.util';
export type {
  CurrencyConfig,
  DecimalLike,
  FinancialDecimal,
  MoneyValue,
} from './money.util';
export {
  ExchangeRate,
  MonetaryAmount,
  Percentage,
  Quantity,
} from './financial-values.util';
export { tafqeetArabic, tafqeetVoucher } from './tafqeet.util';
export type { ArabicUnitForms, TafqeetOptions } from './tafqeet.util';
export {
  DateUtils,
  DEFAULT_TIME_ZONE,
  formatDate,
  TimeZoneUtils,
} from './date.util';
export type {
  CalendarValue,
  LocalDateTimeParts,
  TimeDisambiguation,
} from './date.util';
export { StringUtils } from './string.util';
export {
  formatMoney,
  formatNumber,
  formatPercent,
  NumberUtils,
  parseDecimal,
  parseMoney,
} from './number.util';
export { IBAN_LENGTHS, IBAN_REGISTRY_VERSION, isValidIBAN } from './iban.util';
export { ValidationUtils } from './validation.util';
