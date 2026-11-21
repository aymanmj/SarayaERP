// src/common/utils/tafqeet.util.ts
// تفقيط المبالغ المالية باللغة العربية الفصحى مع دعم العملات والكسور العشرية (3 خانات للدينار الليبي)

import { CURRENCIES, getCurrency, Money, type MoneyValue } from './money.util';

export type ArabicUnitForms = Readonly<{
  singular: string;
  dual: string;
  plural: string;
}>;
export type TafqeetOptions = {
  currency?: string;
  currencyName?: string;
  subCurrencyName?: string;
  /** Required for custom names. Wording supports scales 0..3. */
  decimals?: number;
  unitForms?: ArabicUnitForms;
  subUnitForms?: ArabicUnitForms;
};

const ones = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
];
const tens = [
  '',
  'عشرة',
  'عشرون',
  'ثلاثون',
  'أربعون',
  'خمسون',
  'ستون',
  'سبعون',
  'ثمانون',
  'تسعون',
];
const hundreds = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];
const teens = [
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];

const forms = (
  singular: string,
  dual: string,
  plural: string,
): ArabicUnitForms => ({ singular, dual, plural });

const unitForms: Readonly<Record<string, ArabicUnitForms>> = {
  LYD: forms('دينار ليبي', 'ديناران ليبيان', 'دنانير ليبية'),
  KWD: forms('دينار كويتي', 'ديناران كويتيان', 'دنانير كويتية'),
  USD: forms('دولار أمريكي', 'دولاران أمريكيان', 'دولارات أمريكية'),
  EUR: forms('يورو', 'يوروان', 'يوروهات'),
  SAR: forms('ريال سعودي', 'ريالان سعوديان', 'ريالات سعودية'),
  AED: forms('درهم إماراتي', 'درهمان إماراتيان', 'دراهم إماراتية'),
  SDG: forms('جنيه سوداني', 'جنيهان سودانيان', 'جنيهات سودانية'),
  EGP: forms('جنيه مصري', 'جنيهان مصريان', 'جنيهات مصرية'),
};

const fractionalForms: Readonly<Record<string, ArabicUnitForms>> = {
  درهم: forms('درهم', 'درهمان', 'دراهم'),
  فلس: forms('فلس', 'فلسان', 'فلوس'),
  سنت: forms('سنت', 'سنتان', 'سنتات'),
  قرش: forms('قرش', 'قرشان', 'قروش'),
  هللة: forms('هللة', 'هللتان', 'هللات'),
};

function underThousand(
  value: number,
  construct = false,
  feminine = false,
): string {
  const parts: string[] = [];
  const h = Math.floor(value / 100);
  const r = value % 100;
  if (h) parts.push(h === 2 && construct && !r ? 'مائتا' : hundreds[h]);
  if (r) {
    if (r < 10) {
      parts.push(
        feminine
          ? [
              '',
              'واحدة',
              'اثنتان',
              'ثلاث',
              'أربع',
              'خمس',
              'ست',
              'سبع',
              'ثماني',
              'تسع',
            ][r]
          : ones[r],
      );
    } else if (r < 20) {
      parts.push(
        feminine
          ? [
              'عشر',
              'إحدى عشرة',
              'اثنتا عشرة',
              'ثلاث عشرة',
              'أربع عشرة',
              'خمس عشرة',
              'ست عشرة',
              'سبع عشرة',
              'ثماني عشرة',
              'تسع عشرة',
            ][r - 10]
          : teens[r - 10],
      );
    } else {
      const o = r % 10;
      const unit = feminine
        ? [
            '',
            'إحدى',
            'اثنتان',
            'ثلاث',
            'أربع',
            'خمس',
            'ست',
            'سبع',
            'ثماني',
            'تسع',
          ][o]
        : ones[o];
      parts.push(
        o ? `${unit} و${tens[Math.floor(r / 10)]}` : tens[Math.floor(r / 10)],
      );
    }
  }
  return parts.join(' و');
}

function integerWords(
  value: number,
  construct = false,
  feminine = false,
): string {
  const parts: string[] = [];
  for (const [scale, one, two, plural] of [
    [1e12, 'تريليون', 'تريليونان', 'تريليونات'],
    [1e9, 'مليار', 'ملياران', 'مليارات'],
    [1e6, 'مليون', 'مليونان', 'ملايين'],
    [1e3, 'ألف', 'ألفان', 'آلاف'],
  ] as const) {
    const group = Math.floor(value / scale);
    value %= scale;
    if (group === 1) parts.push(one);
    else if (group === 2)
      parts.push(construct && value === 0 ? two.slice(0, -1) : two);
    else if (group)
      parts.push(`${underThousand(group, true)} ${group <= 10 ? plural : one}`);
  }
  if (value) parts.push(underThousand(value, construct, feminine));
  return parts.join(' و');
}

function counted(
  value: number,
  unit: ArabicUnitForms,
  feminine = false,
): string {
  if (value === 1) return unit.singular;
  if (value === 2) return unit.dual;
  const last = value % 100;
  return `${integerWords(value, true, feminine)} ${last >= 3 && last <= 10 ? unit.plural : unit.singular}`;
}

/** Exact posted amount wording; number conversion is limited to bounded integer groups. */
export function tafqeetArabic(
  amount: MoneyValue,
  options?: TafqeetOptions,
): string;
export function tafqeetArabic(
  amount: MoneyValue,
  currencyName?: string,
  subCurrencyName?: string,
  decimals?: number,
): string;
export function tafqeetArabic(
  amount: MoneyValue,
  optionsOrName: TafqeetOptions | string = {},
  subCurrencyName?: string,
  decimals?: number,
): string {
  const options: TafqeetOptions =
    typeof optionsOrName === 'string'
      ? { currencyName: optionsOrName, subCurrencyName, decimals }
      : optionsOrName;
  const aliases: Record<string, string> = {
    دينار: 'LYD',
    دولار: 'USD',
    ريال: 'SAR',
    درهم: 'AED',
    يورو: 'EUR',
  };
  const inferred =
    options.currencyName &&
    ((Object.prototype.hasOwnProperty.call(aliases, options.currencyName)
      ? aliases[options.currencyName]
      : undefined) ||
      Object.values(CURRENCIES).find((c) => c.nameAr === options.currencyName)
        ?.code);
  const code =
    options.currency || inferred || (!options.currencyName ? 'LYD' : undefined);
  const currency = code ? getCurrency(code) : undefined;
  const scale = options.decimals ?? currency?.decimals;
  if (
    scale === undefined ||
    !Number.isInteger(scale) ||
    scale < 0 ||
    scale > 3
  ) {
    throw new RangeError('Specify a wording scale between 0 and 3');
  }
  if (currency && scale !== currency.decimals) {
    throw new RangeError('Wording scale must match the selected currency');
  }
  const customName =
    options.currencyName && options.currencyName !== currency?.nameAr
      ? options.currencyName
      : undefined;
  const customForms: Record<string, ArabicUnitForms> = {
    دينار: forms('دينار', 'ديناران', 'دنانير'),
    دولار: forms('دولار', 'دولاران', 'دولارات'),
    ريال: forms('ريال', 'ريالان', 'ريالات'),
    درهم: fractionalForms['درهم'],
  };
  const unit =
    options.unitForms ||
    (customName ? customForms[customName] : unitForms[code || '']);
  const validForms = (
    value: ArabicUnitForms | undefined,
  ): value is ArabicUnitForms =>
    !!value &&
    ['singular', 'dual', 'plural'].every(
      (key) =>
        typeof value[key as keyof ArabicUnitForms] === 'string' &&
        value[key as keyof ArabicUnitForms].trim().length > 0,
    );
  if (!validForms(unit))
    throw new RangeError('Currency wording forms are required');
  const fractionalName = options.subCurrencyName || currency?.subUnitNameAr;
  const fractional =
    options.subUnitForms || fractionalForms[fractionalName || ''];
  if (scale && !validForms(fractional))
    throw new RangeError('Fractional currency wording forms are required');
  const rounded = Money.roundDecimal(amount, scale);
  if (rounded.abs().gte('1000000000000000'))
    throw new RangeError('Amount is outside the supported wording range');
  const [whole, fraction = '0'] = Money.toFixed(rounded.abs(), scale).split(
    '.',
  );
  const integer = Number(whole);
  const minor = Number(fraction);
  if (!integer && !minor) return `صفر ${unit.singular}`;
  const parts: string[] = [];
  if (integer) parts.push(counted(integer, unit));
  if (minor) parts.push(counted(minor, fractional, fractionalName === 'هللة'));
  return `${rounded.isNegative() ? 'سالب ' : ''}${parts.join(' و')}`;
}
