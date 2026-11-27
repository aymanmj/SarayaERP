import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClinicalABACGuard } from './clinical-abac.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class DummyController {},
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('ClinicalABACGuard', () => {
  let guard: ClinicalABACGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: {
    encounter: { findFirst: jest.Mock };
    appointment: { findFirst: jest.Mock };
  };
  let auditService: { log: jest.Mock };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        paramName: 'id',
        allowBreakGlass: true,
      }),
    };
    prisma = {
      encounter: { findFirst: jest.fn().mockResolvedValue(null) },
      appointment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    guard = new ClinicalABACGuard(
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  it('should fail-closed when patientId param is missing or invalid', async () => {
    const ctx = makeContext({
      user: { sub: 12, hospitalId: 1, roles: ['DOCTOR'], permissions: [] },
      params: { id: 'not-a-number' },
      headers: {},
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should scope relation lookup to user hospitalId and allow assigned doctor', async () => {
    prisma.encounter.findFirst.mockResolvedValue({ id: 99 });
    const ctx = makeContext({
      user: { sub: 12, hospitalId: 3, roles: ['DOCTOR'], permissions: [] },
      params: { id: '45' },
      headers: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.encounter.findFirst).toHaveBeenCalledWith({
      where: {
        hospitalId: 3,
        patientId: 45,
        doctorId: 12,
        status: { not: 'CANCELLED' },
      },
    });
  });

  it('should reject break-glass without a >=10 char clinical reason', async () => {
    const ctx = makeContext({
      user: { sub: 12, hospitalId: 3, roles: ['DOCTOR'], permissions: [] },
      params: { id: '45' },
      headers: {
        'x-break-glass': 'true',
        'x-break-glass-reason': 'short',
      },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should allow and audit break-glass with a valid clinical reason', async () => {
    const ctx = makeContext({
      user: { sub: 12, hospitalId: 3, roles: ['DOCTOR'], permissions: [] },
      params: { id: '45' },
      headers: {
        'x-break-glass': 'true',
        'x-break-glass-reason':
          'Code blue emergency cardiac arrest consultation',
      },
      ip: '10.0.0.5',
      url: '/api/patients/45',
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SECURITY_BREAK_GLASS',
        entityId: 45,
        userId: 12,
        hospitalId: 3,
      }),
    );
  });

  it('should deny and audit unauthorized access with no relation and no break-glass', async () => {
    const ctx = makeContext({
      user: { sub: 12, hospitalId: 3, roles: ['DOCTOR'], permissions: [] },
      params: { id: '45' },
      headers: {},
      ip: '10.0.0.5',
      url: '/api/patients/45',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SECURITY_ABAC_VIOLATION',
        entityId: 45,
        hospitalId: 3,
      }),
    );
  });
});
