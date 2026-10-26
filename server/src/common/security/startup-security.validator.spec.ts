import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { StartupSecurityValidator } from './startup-security.validator';

describe('StartupSecurityValidator', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  const validConfig = () => ({
    NODE_ENV: 'production',
    JWT_SECRET: randomBytes(32).toString('hex'),
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    ENCRYPTION_SALT: randomBytes(16).toString('hex'),
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  function validate(values: Record<string, string | undefined>) {
    return () =>
      new StartupSecurityValidator(new ConfigService(values)).onModuleInit();
  }

  it('accepts generated production secrets', () => {
    expect(validate(validConfig())).not.toThrow();
  });

  it.each(['JWT_SECRET', 'ENCRYPTION_KEY'])('rejects missing %s', (key) => {
    expect(validate({ ...validConfig(), [key]: undefined })).toThrow(
      'SECURITY_STARTUP_BLOCKED',
    );
  });

  it.each([
    ' ',
    'short-password',
    'CHANGE_ME_GENERATE_WITH_openssl_rand_hex_32',
    'your_very_long_random_secret_key_here_at_least_32_chars',
    'super-secret-key-change-in-production',
  ])('rejects unsafe JWT configuration without logging it', (secret) => {
    expect(validate({ ...validConfig(), JWT_SECRET: secret })).toThrow(
      'SECURITY_STARTUP_BLOCKED',
    );
    if (secret.trim()) {
      for (const args of errorSpy.mock.calls as unknown[][]) {
        expect(args.join(' ')).not.toContain(secret);
      }
    }
  });

  it('rejects a placeholder encryption key', () => {
    expect(
      validate({
        ...validConfig(),
        ENCRYPTION_KEY: 'CHANGE_ME_GENERATE_BASE64_KEY',
      }),
    ).toThrow('SECURITY_STARTUP_BLOCKED');
  });

  it('keeps existing encryption salt compatible and warns about it', () => {
    expect(
      validate({
        ...validConfig(),
        ENCRYPTION_SALT: 'saraya-default-salt-123',
      }),
    ).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('allows development without secrets', () => {
    expect(validate({ NODE_ENV: 'development' })).not.toThrow();
  });
});
