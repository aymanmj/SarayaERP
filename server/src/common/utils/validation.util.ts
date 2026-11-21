// src/common/utils/validation.util.ts
// أدوات التحقق من البيانات

import { isValidIBAN } from './iban.util';

export class ValidationUtils {
  /** التحقق من صحة البريد الإلكتروني */
  static isValidEmail(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  /** التحقق من صحة رقم الهاتف (دولي / ليبي) */
  static isValidPhone(phone: string): boolean {
    const regex = /^\+?[0-9]\d{7,14}$/;
    return regex.test(phone.replace(/[\s-()]/g, ''));
  }

  /** التحقق من الرقم الوطني الليبي (12 رقماً يبدأ بـ 1 أو 2) */
  static isValidLibyanNationalId(id: string): boolean {
    return /^[12]\d{11}$/.test(id.replace(/[-\s]/g, ''));
  }

  /** التحقق من رقم الهوية السودانية */
  static isValidSudaneseId(id: string): boolean {
    return /^\d{11}$/.test(id.replace(/[-\s]/g, ''));
  }

  /** التحقق من IBAN */
  static isValidIBAN(iban: string): boolean {
    return isValidIBAN(iban);
  }

  /** التحقق من قوة كلمة المرور */
  static passwordStrength(password: string): 'weak' | 'medium' | 'strong' {
    if (password.length < 6) return 'weak';
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const score = [hasUpper, hasLower, hasNumber, hasSpecial].filter(
      Boolean,
    ).length;
    if (password.length >= 8 && score >= 3) return 'strong';
    if (password.length >= 6 && score >= 2) return 'medium';
    return 'weak';
  }

  /** التحقق أن القيمة ليست فارغة */
  static isRequired(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  }
}
