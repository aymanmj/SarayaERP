import { ConflictException } from '@nestjs/common';
import {
  decryptAttachmentBuffer,
  encryptAttachmentBuffer,
  isEncryptedAttachmentEnvelope,
} from './attachment-crypto.util';

describe('Attachment AES-256-GCM Encryption-at-Rest (SEC05)', () => {
  const opts = {
    encryptionKey: '0123456789abcdef0123456789abcdef-test-key',
    encryptionSalt: 'saraya-test-salt-2026',
  };

  it('encrypts PDF bytes at rest with SRYENC1 envelope and decrypts identically', () => {
    const original = Buffer.from(
      '%PDF-1.4\nConfidential Patient PreAuth Medical Report 12345\n%%EOF',
      'utf8',
    );

    const encrypted = encryptAttachmentBuffer(original, opts);
    expect(isEncryptedAttachmentEnvelope(encrypted)).toBe(true);
    expect(encrypted.includes(Buffer.from('Confidential Patient'))).toBe(false);

    const { plaintext, wasEncrypted } = decryptAttachmentBuffer(
      encrypted,
      opts,
    );
    expect(wasEncrypted).toBe(true);
    expect(plaintext.equals(original)).toBe(true);
  });

  it('produces unique random IV and ciphertext on repeated encryptions of identical bytes', () => {
    const payload = Buffer.from('%PDF-1.4 identical payload', 'utf8');
    const c1 = encryptAttachmentBuffer(payload, opts);
    const c2 = encryptAttachmentBuffer(payload, opts);
    expect(c1.equals(c2)).toBe(false);
  });

  it('fails closed with ConflictException when ciphertext or auth tag is tampered', () => {
    const encrypted = encryptAttachmentBuffer(
      Buffer.from('%PDF-1.4 intact content', 'utf8'),
      opts,
    );
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;

    expect(() => decryptAttachmentBuffer(tampered, opts)).toThrow(
      ConflictException,
    );
  });

  it('fails closed with ConflictException when decrypted with wrong key', () => {
    const encrypted = encryptAttachmentBuffer(
      Buffer.from('%PDF-1.4 secret', 'utf8'),
      opts,
    );

    expect(() =>
      decryptAttachmentBuffer(encrypted, {
        ...opts,
        encryptionKey: 'wrong-key-000000000000000000000000000000',
      }),
    ).toThrow(ConflictException);
  });

  it('remains backward-compatible with legacy unencrypted files on disk', () => {
    const legacy = Buffer.from('%PDF-1.4 legacy plain attachment', 'utf8');
    expect(isEncryptedAttachmentEnvelope(legacy)).toBe(false);

    const { plaintext, wasEncrypted } = decryptAttachmentBuffer(legacy, opts);
    expect(wasEncrypted).toBe(false);
    expect(plaintext.equals(legacy)).toBe(true);
  });
});
