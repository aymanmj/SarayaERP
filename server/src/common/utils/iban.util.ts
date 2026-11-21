// src/common/utils/iban.util.ts
/** Country lengths: SWIFT IBAN Registry, release 103 (September 2026).
 * Source: https://www.swift.com/resource/iban-registry-pdf
 * Local structural/checksum validation only; it does not establish account ownership/existence.
 */
export const IBAN_REGISTRY_VERSION = 'SWIFT-103-2026-09';
export const IBAN_LENGTHS: Readonly<Record<string, number>> = Object.freeze({
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BI: 27,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DJ: 27,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FK: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HN: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  LY: 25,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MN: 20,
  MR: 27,
  MT: 31,
  MU: 30,
  NI: 28,
  NL: 18,
  NO: 15,
  OM: 23,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  RU: 33,
  SA: 24,
  SC: 31,
  SD: 18,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  SO: 23,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
  YE: 30,
});

export function isValidIBAN(value: string): boolean {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (
    !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) ||
    !Object.prototype.hasOwnProperty.call(IBAN_LENGTHS, iban.slice(0, 2)) ||
    iban.length !== IBAN_LENGTHS[iban.slice(0, 2)] ||
    Number(iban.slice(2, 4)) < 2 ||
    Number(iban.slice(2, 4)) > 98
  ) {
    return false;
  }
  // Stream the expanded characters; never construct an unsafe integer.
  let remainder = 0;
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
