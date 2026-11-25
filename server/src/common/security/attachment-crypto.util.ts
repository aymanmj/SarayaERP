import { ConflictException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const ENVELOPE_MAGIC = Buffer.from('SRYENC1\0', 'ascii'); // 8 bytes
const GCM_IV_LENGTH = 12; // NIST SP 800-38D recommended 96-bit IV for AES-GCM
const GCM_TAG_LENGTH = 16; // 128-bit authentication tag
const HEADER_LENGTH = ENVELOPE_MAGIC.length + GCM_IV_LENGTH + GCM_TAG_LENGTH;

export interface AttachmentCryptoOptions {
  encryptionKey?: string;
  encryptionSalt?: string;
}

const derivedKeyCache = new Map<string, Buffer>();

function resolveAttachmentKey(options?: AttachmentCryptoOptions): Buffer {
  const rawKey =
    options?.encryptionKey ??
    process.env.ENCRYPTION_KEY ??
    'your-secret-key-32-chars-long-!!!';
  const rawSalt =
    options?.encryptionSalt ??
    process.env.ENCRYPTION_SALT ??
    'saraya-default-salt-123';

  const domainSalt = `${rawSalt}:attachments-v1`;
  const cacheKey = `${rawKey}\0${domainSalt}`;
  const cached = derivedKeyCache.get(cacheKey);
  if (cached) return cached;

  const derived = scryptSync(rawKey, domainSalt, 32);
  if (derivedKeyCache.size > 16) {
    derivedKeyCache.clear();
  }
  derivedKeyCache.set(cacheKey, derived);
  return derived;
}

export function isEncryptedAttachmentEnvelope(buf: Buffer): boolean {
  return (
    buf.length >= HEADER_LENGTH &&
    buf.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC)
  );
}

/**
 * Encrypts binary attachment bytes at rest using AES-256-GCM with a unique
 * 96-bit random IV and self-describing 36-byte header:
 *   [8B "SRYENC1\0"] [12B IV] [16B AuthTag] [Ciphertext...]
 */
export function encryptAttachmentBuffer(
  plaintext: Buffer,
  options?: AttachmentCryptoOptions,
): Buffer {
  const key = resolveAttachmentKey(options);
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv);
  cipher.setAAD(ENVELOPE_MAGIC);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([ENVELOPE_MAGIC, iv, authTag, encrypted]);
}

/**
 * Decrypts a stored attachment buffer if it carries the SRYENC1 envelope.
 * Fails closed with ConflictException on any authentication tag mismatch,
 * tampering, or wrong key. Backward-compatible with legacy unencrypted files.
 */
export function decryptAttachmentBuffer(
  stored: Buffer,
  options?: AttachmentCryptoOptions,
): { plaintext: Buffer; wasEncrypted: boolean } {
  if (!isEncryptedAttachmentEnvelope(stored)) {
    return { plaintext: stored, wasEncrypted: false };
  }

  const key = resolveAttachmentKey(options);
  const ivStart = ENVELOPE_MAGIC.length;
  const tagStart = ivStart + GCM_IV_LENGTH;
  const ciphertextStart = tagStart + GCM_TAG_LENGTH;

  const iv = stored.subarray(ivStart, tagStart);
  const authTag = stored.subarray(tagStart, ciphertextStart);
  const ciphertext = stored.subarray(ciphertextStart);

  try {
    const decipher = createDecipheriv(CIPHER_ALGORITHM, key, iv);
    decipher.setAAD(ENVELOPE_MAGIC);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return { plaintext, wasEncrypted: true };
  } catch {
    throw new ConflictException(
      'سلامة المرفق المشفّر غير مطابقة أو مفتاح التشفير غير صحيح',
    );
  }
}
