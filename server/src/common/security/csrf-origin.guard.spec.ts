import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfOriginGuard } from './csrf-origin.guard';

function createHttpContext(req: {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
}): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('CsrfOriginGuard', () => {
  const originalCorsOrigins = process.env.CORS_ORIGINS;
  const originalNodeEnv = process.env.NODE_ENV;
  let guard: CsrfOriginGuard;

  beforeEach(() => {
    guard = new CsrfOriginGuard();
    process.env.CORS_ORIGINS = 'https://erp.saraya.ly';
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.CORS_ORIGINS = originalCorsOrigins;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should allow safe GET requests even with cookies', () => {
    const ctx = createHttpContext({
      method: 'GET',
      cookies: { Authentication: 'jwt-cookie' },
      headers: { origin: 'https://evil.example' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow Bearer token mutations without origin checks', () => {
    const ctx = createHttpContext({
      method: 'POST',
      cookies: { Authentication: 'jwt-cookie' },
      headers: {
        authorization: 'Bearer some.jwt.token',
        'sec-fetch-site': 'cross-site',
      },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow exempt webhook prefixes', () => {
    const ctx = createHttpContext({
      method: 'POST',
      originalUrl: '/api/webhooks/stripe',
      cookies: { Authentication: 'jwt-cookie' },
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject cross-site cookie mutations via Sec-Fetch-Site', () => {
    const ctx = createHttpContext({
      method: 'POST',
      originalUrl: '/api/billing/invoices',
      cookies: { Authentication: 'jwt-cookie' },
      headers: {
        'sec-fetch-site': 'cross-site',
        host: 'erp.saraya.ly',
      },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject cookie mutations from disallowed Origin', () => {
    const ctx = createHttpContext({
      method: 'DELETE',
      originalUrl: '/api/users/5',
      cookies: { Refresh: 'refresh-cookie' },
      headers: {
        origin: 'https://attacker.example',
        host: 'erp.saraya.ly',
      },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow same-host and configured Origin cookie mutations', () => {
    const sameHostCtx = createHttpContext({
      method: 'PATCH',
      originalUrl: '/api/users/5',
      cookies: { Authentication: 'jwt-cookie' },
      headers: {
        origin: 'https://erp.saraya.ly',
        host: 'erp.saraya.ly',
        'sec-fetch-site': 'same-origin',
      },
    });
    expect(guard.canActivate(sameHostCtx)).toBe(true);

    const allowedCorsCtx = createHttpContext({
      method: 'POST',
      originalUrl: '/api/auth/logout',
      cookies: { Authentication: 'jwt-cookie' },
      headers: {
        origin: 'https://erp.saraya.ly',
        host: 'api.saraya.ly',
      },
    });
    expect(guard.canActivate(allowedCorsCtx)).toBe(true);
  });
});
