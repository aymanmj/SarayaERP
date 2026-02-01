// src/common/utils/encryption.util.ts

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

export function encrypt(text: string): string {
  if (!text) return text;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag().toString('hex');

  // الصيغة: IV:TAG:CONTENT
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;

  try {
    const [ivHex, tagHex, content] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    // في حال فشل فك التشفير (مثلاً بيانات قديمة غير مشفرة)
    return encryptedText;
  }
}

// import {
//   createCipheriv,
//   createDecipheriv,
//   randomBytes,
//   scryptSync,
// } from 'crypto';

// const ALGORITHM = 'aes-256-gcm';
// const IV_LENGTH = 16;
// const SALT = process.env.ENCRYPTION_SALT || 'saraya-default-salt';
// const KEY = scryptSync(
//   process.env.ENCRYPTION_KEY || 'very-secret-key',
//   SALT,
//   32,
// );

// export function encrypt(text: string): string {
//   if (!text) return text;
//   const iv = randomBytes(IV_LENGTH);
//   const cipher = createCipheriv(ALGORITHM, KEY, iv);

//   let encrypted = cipher.update(text, 'utf8', 'hex');
//   encrypted += cipher.final('hex');

//   const tag = cipher.getAuthTag().toString('hex');

//   // ندمج الـ IV والـ Tag مع النص المشفر لسهولة التخزين
//   return `${iv.toString('hex')}:${tag}:${encrypted}`;
// }

// export function decrypt(encryptedText: string): string {
//   if (!encryptedText || !encryptedText.includes(':')) return encryptedText;

//   const [ivHex, tagHex, content] = encryptedText.split(':');
//   const iv = Buffer.from(ivHex, 'hex');
//   const tag = Buffer.from(tagHex, 'hex');
//   const decipher = createDecipheriv(ALGORITHM, KEY, iv);
//   decipher.setAuthTag(tag);

//   let decrypted = decipher.update(content, 'hex', 'utf8');
//   decrypted += decipher.final('utf8');

//   return decrypted;
// }
