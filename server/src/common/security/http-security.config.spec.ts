import {
  buildAuthCookieOptions,
  buildCspDirectives,
  isCorsOriginAllowed,
  parseConfiguredOrigins,
} from './http-security.config';

describe('http-security.config (OPS08)', () => {
  describe('parseConfiguredOrigins', () => {
    it('splits, trims, and removes empty entries', () => {
      expect(
        parseConfiguredOrigins(' https://erp.hospital.ly , , http://a.local '),
      ).toEqual(['https://erp.hospital.ly', 'http://a.local']);
      expect(parseConfiguredOrigins(undefined)).toEqual([]);
    });
  });

  describe('isCorsOriginAllowed', () => {
    it('allows requests with no origin header in all environments', () => {
      expect(
        isCorsOriginAllowed(undefined, {
          isProduction: true,
          configuredOrigins: [],
        }),
      ).toEqual({ allowed: true, reflectOrigin: true });
    });

    it('rejects wildcard, localhost, LAN private IPs, and unlisted origins in production', () => {
      const prodOpts = {
        isProduction: true,
        configuredOrigins: ['*', 'https://his.saraya.ly'],
      };

      expect(isCorsOriginAllowed('*', prodOpts)).toEqual({ allowed: false });
      expect(
        isCorsOriginAllowed('https://unlisted.example.com', prodOpts),
      ).toEqual({ allowed: false });
      expect(isCorsOriginAllowed('http://localhost:5173', prodOpts)).toEqual({
        allowed: false,
      });
      expect(isCorsOriginAllowed('http://192.168.1.50', prodOpts)).toEqual({
        allowed: false,
      });
      expect(isCorsOriginAllowed('https://his.saraya.ly', prodOpts)).toEqual({
        allowed: true,
        reflectOrigin: 'https://his.saraya.ly',
      });
    });

    it('allows localhost, private LAN IPs, empty config, and wildcard in non-production', () => {
      expect(
        isCorsOriginAllowed('http://localhost:5173', {
          isProduction: false,
          configuredOrigins: ['https://staging.saraya.ly'],
        }),
      ).toEqual({ allowed: true, reflectOrigin: 'http://localhost:5173' });

      expect(
        isCorsOriginAllowed('http://192.168.10.25:3000', {
          isProduction: false,
          configuredOrigins: ['https://staging.saraya.ly'],
        }),
      ).toEqual({
        allowed: true,
        reflectOrigin: 'http://192.168.10.25:3000',
      });

      expect(
        isCorsOriginAllowed('https://any.dev.local', {
          isProduction: false,
          configuredOrigins: [],
        }),
      ).toEqual({ allowed: true, reflectOrigin: 'https://any.dev.local' });

      expect(
        isCorsOriginAllowed('https://any.dev.local', {
          isProduction: false,
          configuredOrigins: ['*'],
        }),
      ).toEqual({ allowed: true, reflectOrigin: 'https://any.dev.local' });
    });
  });

  describe('buildCspDirectives', () => {
    it('omits localhost connect-src and enforces strict script-src in production when strict CSP is enabled', () => {
      const directives = buildCspDirectives({
        isProduction: true,
        enableStrictCsp: true,
        sarayaDomain: 'his.saraya.ly',
      });

      expect(directives.scriptSrc).toEqual(["'self'"]);
      expect(directives.connectSrc).toEqual([
        "'self'",
        'https://his.saraya.ly',
        'wss://his.saraya.ly',
      ]);
      expect(directives.connectSrc).not.toContain('http://localhost:*');
      expect(directives.connectSrc).not.toContain('ws://localhost:*');
    });

    it('relaxes script-src in production only when strict CSP is explicitly disabled', () => {
      const directives = buildCspDirectives({
        isProduction: true,
        enableStrictCsp: false,
      });

      expect(directives.scriptSrc).toEqual([
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
      ]);
      expect(directives.connectSrc).toEqual(["'self'"]);
    });

    it('includes localhost connect-src in non-production', () => {
      const directives = buildCspDirectives({
        isProduction: false,
        enableStrictCsp: true,
      });

      expect(directives.connectSrc).toEqual([
        "'self'",
        'http://localhost:*',
        'ws://localhost:*',
      ]);
    });
  });

  describe('buildAuthCookieOptions', () => {
    it('defaults to secure=true in production and honors explicit overrides', () => {
      expect(buildAuthCookieOptions({ isProduction: true })).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });

      expect(
        buildAuthCookieOptions({ isProduction: true, cookieSecure: 'false' }),
      ).toEqual({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });

      expect(
        buildAuthCookieOptions({ isProduction: false, cookieSecure: 'true' }),
      ).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    });
  });
});
