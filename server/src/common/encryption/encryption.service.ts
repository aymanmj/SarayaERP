import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

@Injectable()
export class EncryptionService {
  private key: Buffer;

  constructor(private readonly config: ConfigService) {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY') || 'your-secret-key-32-chars-long-!!!';
    const encryptionSalt = this.config.get<string>('ENCRYPTION_SALT') || 'saraya-default-salt-123';
    this.key = scryptSync(encryptionKey, encryptionSalt, 32);
  }

  encrypt(text: string | null | undefined): string | null {
    if (!text) return text as null;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${encrypted}`;
  }

  decrypt(encryptedText: string | null | undefined): string | null {
    if (!encryptedText) return encryptedText as null;
    if (!encryptedText.includes(':')) return encryptedText;

    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText;

    try {
      const [ivHex, tagHex, content] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(content, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return encryptedText;
    }
  }

  isEncrypted(value: string | null | undefined): boolean {
    if (!value) return false;
    const parts = value.split(':');
    return parts.length === 3;
  }
}
