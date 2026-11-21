// client/src/utils/tafqeet.ts
// تفقيط المبالغ المالية باللغة العربية الفصحى لصفحات الطباعة والفواتير وسندات القبض والصرف

export type ArabicUnitForms = Readonly<{ singular: string; dual: string; plural: string }>;
export type TafqeetOptions = {
  currency?: string;
  currencyName?: string;
  subCurrencyName?: string;
  decimals?: number;
  unitForms?: ArabicUnitForms;
  subUnitForms?: ArabicUnitForms;
};

interface CurrencyInfo {
  code: string;
  nameAr: string;
  decimals: number;
  subUnitNameAr: string;
}

const CURRENCIES: Record<string, CurrencyInfo> = {
  LYD: { code: 'LYD', nameAr: 'دينار ليبي', decimals: 3, subUnitNameAr: 'درهم' },
  KWD: { code: 'KWD', nameAr: 'دينار كويتي', decimals: 3, subUnitNameAr: 'فلس' },
  SAR: { code: 'SAR', nameAr: 'ريال سعودي', decimals: 2, subUnitNameAr: 'هللة' },
  AED: { code: 'AED', nameAr: 'درهم إماراتي', decimals: 2, subUnitNameAr: 'فلس' },
  EGP: { code: 'EGP', nameAr: 'جنيه مصري', decimals: 2, subUnitNameAr: 'قرش' },
  SDG: { code: 'SDG', nameAr: 'جنيه سوداني', decimals: 2, subUnitNameAr: 'قرش' },
  USD: { code: 'USD', nameAr: 'دولار أمريكي', decimals: 2, subUnitNameAr: 'سنت' },
  EUR: { code: 'EUR', nameAr: 'يورو', decimals: 2, subUnitNameAr: 'سنت' },
};

const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];

const forms = (singular: string, dual: string, plural: string): ArabicUnitForms => ({ singular, dual, plural });

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

function underThousand(value: number, construct = false, feminine = false): string {
  const parts: string[] = [];
  const h = Math.floor(value / 100);
  const r = value % 100;
  if (h) parts.push(h === 2 && construct && !r ? 'مائتا' : hundreds[h]);
  if (r) {
    if (r < 10) {
      parts.push(
        feminine ? ['', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع'][r] : ones[r],
      );
    } else if (r < 20) {
      parts.push(
        feminine
          ? ['عشر', 'إحدى عشرة', 'اثنتا عشرة', 'ثلاث عشرة', 'أربع عشرة', 'خمس عشرة', 'ست عشرة', 'سبع عشرة', 'ثماني عشرة', 'تسع عشرة'][r - 10]
          : teens[r - 10],
      );
    } else {
      const o = r % 10;
      const unit = feminine ? ['', 'إحدى', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع'][o] : ones[o];
      parts.push(o ? `${unit} و${tens[Math.floor(r / 10)]}` : tens[Math.floor(r / 10)]);
    }
  }
  return parts.join(' و');
}

function integerWords(value: number, construct = false, feminine = false): string {
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
    else if (group === 2) parts.push(construct && value === 0 ? two.slice(0, -1) : two);
    else if (group) parts.push(`${underThousand(group, true)} ${group <= 10 ? plural : one}`);
  }
  if (value) parts.push(underThousand(value, construct, feminine));
  return parts.join(' و');
}

function counted(value: number, unit: ArabicUnitForms, feminine = false): string {
  if (value === 1) return unit.singular;
  if (value === 2) return unit.dual;
  const last = value % 100;
  return `${integerWords(value, true, feminine)} ${last >= 3 && last <= 10 ? unit.plural : unit.singular}`;
}

export function tafqeetArabic(
  amount: number | string | null | undefined,
  options: TafqeetOptions = {},
): string {
  const num = Number(amount ?? 0);
  if (!Number.isFinite(num)) return '';
  const code = options.currency || 'LYD';
  const currency = CURRENCIES[code] || CURRENCIES.LYD;
  const scale = options.decimals ?? currency.decimals;
  const unit = options.unitForms || unitForms[code] || unitForms.LYD;
  const fractionalName = options.subCurrencyName || currency.subUnitNameAr;
  const fractional = options.subUnitForms || fractionalForms[fractionalName] || fractionalForms['درهم'];

  const negative = num < 0;
  const absFixed = Math.abs(num).toFixed(scale);
  const [whole, fraction = '0'] = absFixed.split('.');
  const integer = Number(whole);
  const minor = Number(fraction);
  if (!integer && !minor) return `فقط صفر ${unit.singular} لا غير`;
  const parts: string[] = [];
  if (integer) parts.push(counted(integer, unit));
  if (minor) parts.push(counted(minor, fractional, fractionalName === 'هللة'));
  return `فقط ${negative ? 'سالب ' : ''}${parts.join(' و')} لا غير`;
}
