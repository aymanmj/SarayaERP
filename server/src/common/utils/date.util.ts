// src/common/utils/date.util.ts
// أدوات التاريخ والمنطقة الزمنية الموحدة للمؤسسة (Africa/Tripoli)

/** المنطقة الزمنية الافتراضية للمؤسسة. يجب أن تمر كل حسابات الدوام والتقارير عبر هذه القيمة. */
export const DEFAULT_TIME_ZONE = 'Africa/Tripoli';

export type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Structural adapter for calendar widgets; shared-utils has no Dayjs dependency. */
export type CalendarValue = {
  year(): number;
  month(): number;
  date(): number;
  hour(): number;
  minute(): number;
  second(): number;
  isValid(): boolean;
};

export type TimeDisambiguation = 'reject' | 'earlier' | 'later';

function calendarParts(key: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new RangeError('Invalid calendar date');
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 100 ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== key
  ) {
    throw new RangeError('Invalid calendar date');
  }
  return { year, month, day };
}

function dateKey(year: number, month: number, day: number): string {
  const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  calendarParts(key);
  return key;
}

function validInstant(value: Date | string): Date {
  // A timezone-free datetime must not silently inherit the server's timezone.
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) calendarParts(value);
    else {
      const match =
        /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(
          value,
        );
      if (
        !match ||
        Number(match[2]) > 23 ||
        Number(match[3]) > 59 ||
        Number(match[4] || 0) > 59
      ) {
        throw new RangeError(
          'An explicit ISO date or timezone-qualified instant is required',
        );
      }
      calendarParts(match[1]);
    }
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date');
  return date;
}

// Constructing ICU formatters per punch dominates annual attendance reports.
// Cache only immutable formatter configuration, never dates or user data; bound memory.
const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  // Invalid zones throw above and never enter the cache.
  if (partsFormatters.size >= 64)
    partsFormatters.delete(partsFormatters.keys().next().value);
  partsFormatters.set(timeZone, formatter);
  return formatter;
}

function partsFor(date: Date, timeZone: string): LocalDateTimeParts {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

/** أدوات تحويل صريحة بين UTC والوقت المحلي للمؤسسة. لا تعتمد على ساعة الخادم. */
export class TimeZoneUtils {
  static localParts(
    date: Date | string,
    timeZone = DEFAULT_TIME_ZONE,
  ): LocalDateTimeParts {
    const value = validInstant(date);
    return partsFor(value, timeZone);
  }

  static localDateKey(
    date: Date | string,
    timeZone = DEFAULT_TIME_ZONE,
  ): string {
    const p = this.localParts(date, timeZone);
    return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  }

  /** يحوّل تاريخًا ووقتًا محليين للمؤسسة إلى لحظة UTC قابلة للتخزين. */
  static fromLocal(
    dateKey: string,
    time: string,
    timeZone = DEFAULT_TIME_ZONE,
    disambiguation: TimeDisambiguation = 'reject',
  ): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    const clock = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
    if (!match || !clock) throw new RangeError('Invalid local date or time');
    const target = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(clock[1]),
      minute: Number(clock[2]),
      second: Number(clock[3] || 0),
    };
    const naive = Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
      target.second,
    );
    const calendarDate = new Date(naive);
    if (
      target.year < 100 ||
      target.hour > 23 ||
      target.minute > 59 ||
      target.second > 59 ||
      calendarDate.toISOString().slice(0, 10) !== dateKey
    ) {
      throw new RangeError('Invalid local date or time');
    }
    if (!['reject', 'earlier', 'later'].includes(disambiguation))
      throw new RangeError('Invalid time disambiguation');
    const candidates = new Set<number>();
    // Probe both sides of seasonal transitions to discover the possible offsets.
    for (const hours of [-36, -12, 0, 12, 36]) {
      const probe = naive + hours * 3600000;
      const local = partsFor(new Date(probe), timeZone);
      const represented = Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
        local.second,
      );
      const candidate = naive - (represented - probe);
      const actual = partsFor(new Date(candidate), timeZone);
      if (
        Object.keys(target).every(
          (key) =>
            actual[key as keyof LocalDateTimeParts] ===
            target[key as keyof LocalDateTimeParts],
        )
      ) {
        candidates.add(candidate);
      }
    }
    const sorted = [...candidates].sort((a, b) => a - b);
    if (sorted.length === 1) return new Date(sorted[0]);
    if (sorted.length > 1) {
      if (disambiguation === 'reject')
        throw new RangeError('Ambiguous local time; choose earlier or later');
      return new Date(
        disambiguation === 'earlier' ? sorted[0] : sorted[sorted.length - 1],
      );
    }
    throw new RangeError(
      'Local time does not exist in the institution timezone',
    );
  }

  static startOfLocalDay(dateKey: string, timeZone = DEFAULT_TIME_ZONE): Date {
    return this.fromLocal(dateKey, '00:00:00', timeZone);
  }

  static endOfLocalDay(dateKey: string, timeZone = DEFAULT_TIME_ZONE): Date {
    const nextDay = this.addLocalDays(dateKey, 1);
    return new Date(this.startOfLocalDay(nextDay, timeZone).getTime() - 1);
  }

  static addLocalDays(dateKey: string, days: number): string {
    const { year, month, day } = calendarParts(dateKey);
    if (!Number.isSafeInteger(days))
      throw new RangeError('Calendar days must be an integer');
    const value = new Date(Date.UTC(year, month - 1, day + days));
    if (!Number.isFinite(value.getTime()))
      throw new RangeError('Calendar day is outside the supported range');
    const result = value.toISOString().slice(0, 10);
    calendarParts(result);
    return result;
  }
}

/**
 * تنسيق التواريخ بالأرقام القياسية (YYYY-MM-DD)
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    return TimeZoneUtils.localDateKey(validInstant(date));
  } catch (error) {
    if (error instanceof RangeError) return '-';
    throw error;
  }
}

/** تنسيق التاريخ بالعربية */
export class DateUtils {
  /** UI date-only selections retain their calendar day; instants use the institution zone. */
  static formatPattern(
    value: Date | string | CalendarValue,
    pattern: string,
    timeZone?: string,
  ): string;
  static formatPattern(
    value: Date | string | CalendarValue | null | undefined,
    pattern: string,
    timeZone?: string,
  ): string | undefined;
  static formatPattern(
    value: Date | string | CalendarValue | null | undefined,
    pattern: string,
    timeZone = DEFAULT_TIME_ZONE,
  ): string | undefined {
    if (value == null) return undefined;
    let parts: LocalDateTimeParts;
    if (
      typeof value === 'object' &&
      'year' in value &&
      typeof value.year === 'function'
    ) {
      if (!value.isValid()) return '-';
      parts = {
        year: value.year(),
        month: value.month() + 1,
        day: value.date(),
        hour: value.hour(),
        minute: value.minute(),
        second: value.second(),
      };
    } else {
      try {
        parts = TimeZoneUtils.localParts(
          validInstant(value as Date | string),
          timeZone,
        );
      } catch (error) {
        if (error instanceof RangeError) return '-';
        throw error;
      }
    }
    const supported = [
      'YYYY-MM-DD',
      'YYYY/MM/DD',
      'YYYYMMDD',
      'YYYY-MM-DD HH:mm',
      'YYYY-MM-DD HH:mm:ss',
      'YYYYMMDD_HHmmss',
      'HH:mm',
      'HH:mm:ss',
      'YYYY-MM',
      'ddd',
    ];
    if (!supported.includes(pattern))
      throw new RangeError('Unsupported shared date pattern');
    const pad = (number: number) => String(number).padStart(2, '0');
    const day = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day),
    ).getUTCDay();
    const tokens: Record<string, string> = {
      YYYY: String(parts.year).padStart(4, '0'),
      MM: pad(parts.month),
      DD: pad(parts.day),
      HH: pad(parts.hour),
      mm: pad(parts.minute),
      ss: pad(parts.second),
      ddd: DateUtils.DAYS_AR[day],
    };
    return pattern.replace(
      /YYYY|ddd|MM|DD|HH|mm|ss/g,
      (token) => tokens[token],
    );
  }

  /** All human-facing dates use the institution zone, Gregorian dates and Latin digits. */
  static formatDate(
    value: Date | string,
    locale = 'ar-LY',
    options: Intl.DateTimeFormatOptions = {},
  ): string {
    let date: Date;
    try {
      date = validInstant(value);
    } catch (error) {
      if (error instanceof RangeError) return '-';
      throw error;
    }
    return date.toLocaleDateString(locale, {
      ...options,
      timeZone: options.timeZone || DEFAULT_TIME_ZONE,
      calendar: 'gregory',
      numberingSystem: 'latn',
    });
  }

  static formatDateTime(
    value: Date | string,
    locale = 'ar-LY',
    options: Intl.DateTimeFormatOptions = {},
  ): string {
    let date: Date;
    try {
      date = validInstant(value);
    } catch (error) {
      if (error instanceof RangeError) return '-';
      throw error;
    }
    return date.toLocaleString(locale, {
      ...options,
      timeZone: options.timeZone || DEFAULT_TIME_ZONE,
      calendar: 'gregory',
      numberingSystem: 'latn',
    });
  }

  static formatTime(
    value: Date | string,
    locale = 'ar-LY',
    options: Intl.DateTimeFormatOptions = {},
  ): string {
    let date: Date;
    try {
      date = validInstant(value);
    } catch (error) {
      if (error instanceof RangeError) return '-';
      throw error;
    }
    return date.toLocaleTimeString(locale, {
      ...options,
      timeZone: options.timeZone || DEFAULT_TIME_ZONE,
      calendar: 'gregory',
      numberingSystem: 'latn',
    });
  }

  static format(date: Date | string, options?: { showTime?: boolean }): string {
    if (!date) return '';
    return options?.showTime === false
      ? this.formatDate(date)
      : this.formatDateTime(date);
  }

  /** A date-only database field is UTC midnight; reject calendar rollover. */
  static dateOnly(value: string | Date): Date {
    validInstant(value);
    const key =
      typeof value === 'string'
        ? value.slice(0, 10)
        : value.toISOString().slice(0, 10);
    const date = new Date(key + 'T00:00:00.000Z');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(key) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== key
    ) {
      throw new RangeError('Invalid calendar date');
    }
    return date;
  }

  /** تنسيق التاريخ بصيغة YYYY-MM-DD */
  static toISO(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /** الفرق بين تاريخين بالأيام */
  static diffDays(start: Date | string, end: Date | string): number {
    const s = validInstant(start);
    const e = validInstant(end);
    const diff = e.getTime() - s.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /** Calendar-day distance, independent of 23/25-hour daylight-saving days. */
  static diffCalendarDays(
    start: Date | string,
    end: Date | string,
    timeZone = DEFAULT_TIME_ZONE,
  ): number {
    const key = (value: Date | string) =>
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? DateUtils.dateOnly(value).getTime()
        : DateUtils.dateOnly(
            TimeZoneUtils.localDateKey(value, timeZone),
          ).getTime();
    return (key(end) - key(start)) / 86400000;
  }

  /** هل التاريخ منتهي الصلاحية؟ */
  static isExpired(
    date: Date | string,
    timeZone = DEFAULT_TIME_ZONE,
    now = new Date(),
  ): boolean {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      calendarParts(date);
      return date < TimeZoneUtils.localDateKey(now, timeZone);
    }
    const d = validInstant(date);
    return d < validInstant(now);
  }

  /** هل سينتهي خلال عدد أيام محدد؟ */
  static isExpiringSoon(
    date: Date | string,
    daysThreshold: number = 30,
    timeZone = DEFAULT_TIME_ZONE,
    now = new Date(),
  ): boolean {
    if (!Number.isSafeInteger(daysThreshold) || daysThreshold < 0)
      throw new RangeError('Invalid expiry threshold');
    const today = TimeZoneUtils.localDateKey(now, timeZone);
    const dateOnly =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
    if (!dateOnly && validInstant(date) < validInstant(now)) return false;
    const day = dateOnly
      ? DateUtils.dateOnly(date).toISOString().slice(0, 10)
      : TimeZoneUtils.localDateKey(date, timeZone);
    return (
      day >= today && day <= TimeZoneUtils.addLocalDays(today, daysThreshold)
    );
  }

  /** بداية الشهر */
  static startOfMonth(
    date: Date = new Date(),
    timeZone = DEFAULT_TIME_ZONE,
  ): Date {
    const { year, month } = TimeZoneUtils.localParts(date, timeZone);
    return TimeZoneUtils.startOfLocalDay(dateKey(year, month, 1), timeZone);
  }

  /** نهاية الشهر */
  static endOfMonth(
    date: Date = new Date(),
    timeZone = DEFAULT_TIME_ZONE,
  ): Date {
    const { year, month } = TimeZoneUtils.localParts(date, timeZone);
    return TimeZoneUtils.startOfLocalDay(
      dateKey(year, month, this.daysInMonth(year, month)),
      timeZone,
    );
  }

  /** عدد أيام الشهر */
  static daysInMonth(year: number, month: number): number {
    calendarParts(dateKey(year, month, 1));
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /** بداية السنة */
  static startOfYear(year: number, timeZone = DEFAULT_TIME_ZONE): Date {
    return TimeZoneUtils.startOfLocalDay(dateKey(year, 1, 1), timeZone);
  }

  /** نهاية السنة */
  static endOfYear(year: number, timeZone = DEFAULT_TIME_ZONE): Date {
    return TimeZoneUtils.startOfLocalDay(dateKey(year, 12, 31), timeZone);
  }

  /** أسماء الأشهر بالعربية */
  static readonly MONTHS_AR = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];

  /** أسماء أيام الأسبوع بالعربية */
  static readonly DAYS_AR = [
    'الأحد',
    'الاثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
    'السبت',
  ];

  /** اسم الشهر بالعربية */
  static monthName(month: number): string {
    return DateUtils.MONTHS_AR[month - 1] || '';
  }
}
