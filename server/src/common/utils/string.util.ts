// src/common/utils/string.util.ts
// أدوات النصوص المساعدة

export class StringUtils {
  /** توليد كود تلقائي مثل: EMP-00001 */
  static generateCode(
    prefix: string,
    sequence: number,
    padLength: number = 5,
  ): string {
    return `${prefix}-${String(sequence).padStart(padLength, '0')}`;
  }

  /** قص النص مع ... */
  static truncate(text: string, maxLength: number = 50): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }

  /** تحويل لـ slug (للروابط) */
  static slugify(text: string): string {
    return text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** الاسم الكامل بالعربية */
  static fullNameAr(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`.trim();
  }

  /** الاسم الكامل بالإنجليزية */
  static fullNameEn(firstName?: string, lastName?: string): string {
    return [firstName, lastName].filter(Boolean).join(' ');
  }

  /** الأحرف الأولى من الاسم (للأفاتار) */
  static initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  /** هل النص فارغ أو null؟ */
  static isEmpty(value: string | null | undefined): boolean {
    return !value || value.trim().length === 0;
  }
}
