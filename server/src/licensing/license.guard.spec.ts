import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { LicenseGuard } from './license.guard';
import type { LicenseService } from './license.service';

describe('LicenseGuard (H-04 Path Bypass Prevention)', () => {
  let guard: LicenseGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let licenseService: { getStatus: jest.Mock; hasFeature: jest.Mock };

  const makeContext = (url: string, path?: string): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ url, path }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    licenseService = {
      getStatus: jest.fn().mockReturnValue({
        isValid: false,
        error: 'License expired',
      }),
      hasFeature: jest.fn().mockReturnValue(false),
    };
    guard = new LicenseGuard(
      reflector as unknown as Reflector,
      licenseService as unknown as LicenseService,
    );
  });

  it('allows exact Prometheus metrics endpoints without license', () => {
    expect(guard.canActivate(makeContext('/api/metrics'))).toBe(true);
    expect(guard.canActivate(makeContext('/api/health/metrics'))).toBe(true);
  });

  it('does NOT allow bypassing license check via query string or path suffix /metrics', () => {
    expect(() =>
      guard.canActivate(makeContext('/api/patients?/metrics', '/api/patients')),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(makeContext('/api/patients/metrics')),
    ).toThrow(ForbiddenException);
  });
});
