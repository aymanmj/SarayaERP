import * as crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(byteLength = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(secret: string): Buffer {
  const cleaned = secret.toUpperCase().replace(/[\s=]+/g, '');
  if (!cleaned) {
    throw new Error('Empty TOTP secret');
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error('Invalid Base32 character in TOTP secret');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpCode(
  secret: string,
  timestampMs = Date.now(),
  stepSeconds = 30,
  digits = 6,
): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, '0');
}

export function verifyTotpCode(
  secret: string,
  code: string,
  window = 1,
  timestampMs = Date.now(),
): boolean {
  const normalized = typeof code === 'string' ? code.trim() : '';
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  const expectedBuf = Buffer.from(normalized, 'utf8');
  for (let delta = -window; delta <= window; delta++) {
    const candidate = generateTotpCode(
      secret,
      timestampMs + delta * 30_000,
      30,
      6,
    );
    const candidateBuf = Buffer.from(candidate, 'utf8');
    if (
      candidateBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      return true;
    }
  }

  return false;
}

export function buildOtpAuthUri(params: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  const issuer = encodeURIComponent(params.issuer);
  const label = `${issuer}:${encodeURIComponent(params.accountName)}`;
  const secret = encodeURIComponent(params.secret);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
