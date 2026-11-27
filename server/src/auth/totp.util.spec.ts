import {
  buildOtpAuthUri,
  decodeBase32,
  generateBase32Secret,
  generateTotpCode,
  verifyTotpCode,
} from './totp.util';

describe('TOTP Utility (RFC 6238)', () => {
  // RFC 6238 SHA-1 test secret "12345678901234567890" in Base32
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('should generate valid Base32 secrets', () => {
    const secret = generateBase32Secret(20);
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(decodeBase32(secret)).toHaveLength(20);
  });

  it('should reject empty or invalid Base32 secrets', () => {
    expect(() => decodeBase32('')).toThrow('Empty TOTP secret');
    expect(() => decodeBase32('INVALID1089')).toThrow(
      'Invalid Base32 character',
    );
  });

  it('should match RFC 6238 SHA-1 reference vectors (6 digits)', () => {
    // At t = 59s, RFC 6238 8-digit SHA-1 value is 94287082 -> 6-digit = 287082
    expect(generateTotpCode(rfcSecret, 59_000, 30, 6)).toBe('287082');
  });

  it('should verify codes within the +/-1 step tolerance window and reject expired ones', () => {
    const baseMs = 1_700_000_000_000;
    const codeAtBase = generateTotpCode(rfcSecret, baseMs);
    const codeAtNextStep = generateTotpCode(rfcSecret, baseMs + 30_000);
    const codeOutsideWindow = generateTotpCode(rfcSecret, baseMs + 90_000);

    expect(verifyTotpCode(rfcSecret, codeAtBase, 1, baseMs)).toBe(true);
    expect(verifyTotpCode(rfcSecret, codeAtNextStep, 1, baseMs)).toBe(true);
    expect(verifyTotpCode(rfcSecret, codeOutsideWindow, 1, baseMs)).toBe(false);
    expect(verifyTotpCode(rfcSecret, 'abc123', 1, baseMs)).toBe(false);
  });

  it('should build properly URI-encoded otpauth URLs', () => {
    const uri = buildOtpAuthUri({
      issuer: 'Saraya ERP',
      accountName: 'dr.ahmed@saraya.ly',
      secret: rfcSecret,
    });
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(`secret=${rfcSecret}`);
    expect(uri).toContain('issuer=Saraya%20ERP');
    expect(uri).toContain('digits=6&period=30');
  });
});
