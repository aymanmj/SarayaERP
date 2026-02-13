// src/common/utils/encryption.util.ts
// =====================================================================
// خدمة تشفير البيانات الحساسة (AES-256-GCM)
// تُستخدم لتشفير بيانات المرضى الحساسة (الرقم الوطني، الهاتف، البريد)
// =====================================================================

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// تأكد من وضع هذه القيم في ملف .env
const SALT = process.env.ENCRYPTION_SALT || 'saraya-default-salt-123';
const KEY = scryptSync(
  process.env.ENCRYPTION_KEY || 'your-secret-key-32-chars-long-!!!',
  SALT,
  32,
);

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: iv:tag:ciphertext (all hex).
 * Returns null/empty if input is null/undefined/empty.
 */
export function encrypt(text: string | null | undefined): string | null {
  if (!text) return text as null;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag().toString('hex');

  // الصيغة: IV:TAG:CONTENT
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with encrypt().
 * Expects format: iv:tag:ciphertext (all hex).
 * Returns the original value if decryption fails (legacy plaintext data).
 */
export function decrypt(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) return encryptedText as null;
  if (!encryptedText.includes(':')) return encryptedText;

  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;

  try {
    const [ivHex, tagHex, content] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // في حال فشل فك التشفير (مثلاً بيانات قديمة غير مشفرة)
    return encryptedText;
  }
}

/**
 * Check if a value appears to be encrypted (contains the iv:tag:ciphertext format).
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3;
}
