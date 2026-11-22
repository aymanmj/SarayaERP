import { Test, TestingModule } from '@nestjs/testing';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  const logCritical = jest.fn();
  const getAllAndOverride = jest.fn();

  beforeEach(async () => {
    logCritical.mockReset().mockResolvedValue(undefined);
    getAllAndOverride.mockReset().mockReturnValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
            logCritical,
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride,
          },
        },
      ],
    }).compile();

    interceptor = module.get<AuditInterceptor>(AuditInterceptor);
  });

  const makeContext = (
    method: string,
    url = '/patients',
    user?: { hospitalId?: number; sub?: number },
  ) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          url,
          user,
          headers: { 'user-agent': 'Mozilla/5.0' },
          ip: '10.10.1.50',
          params: {},
          query: {},
        }),
        getResponse: () => ({ statusCode: method === 'POST' ? 201 : 200 }),
      }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  const context = makeContext('POST');

  it('waits for critical audit persistence before emitting the response', async () => {
    let release: () => void = () => undefined;
    logCritical.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    let emitted = false;
    const response = lastValueFrom(
      interceptor.intercept(context, { handle: () => of({ id: 1 }) }),
    ).then((value: unknown) => {
      emitted = true;
      return value;
    });
    await Promise.resolve();
    expect(emitted).toBe(false);
    release();
    expect(await response).toEqual({ id: 1 });
    expect(emitted).toBe(true);
  });

  it('propagates an audit persistence failure through the request stream', async () => {
    logCritical.mockRejectedValue(new Error('storage unavailable'));
    await expect(
      lastValueFrom(
        interceptor.intercept(context, { handle: () => of({ id: 1 }) }),
      ),
    ).rejects.toThrow('Critical Audit Failure: storage unavailable');
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'skips post-commit audit on %s when @AuditInTransaction() is set',
    async (method) => {
      getAllAndOverride.mockImplementation((key: string) =>
        key === 'auditInTransaction' ? true : undefined,
      );

      const res = await lastValueFrom<unknown>(
        interceptor.intercept(makeContext(method, '/cashier/invoices/1'), {
          handle: () => of({ ok: true }),
        }),
      );

      expect(res).toEqual({ ok: true });
      expect(logCritical).not.toHaveBeenCalled();
    },
  );

  it('logs critical audit for modifying actions without @AuditInTransaction()', async () => {
    const res = await lastValueFrom<unknown>(
      interceptor.intercept(makeContext('PUT', '/patients/42'), {
        handle: () => of({ updated: true }),
      }),
    );

    expect(res).toEqual({ updated: true });
    expect(logCritical).toHaveBeenCalledTimes(1);
    expect(logCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE_ENTITY',
        entity: 'patients',
        entityId: 42,
      }),
    );
  });

  it('logs critical audit for GET endpoints annotated with @Sensitive()', async () => {
    getAllAndOverride.mockImplementation((key: string) =>
      key === 'isSensitive' ? 'VIEW_PATIENT_RECORD' : undefined,
    );

    const res = await lastValueFrom<unknown>(
      interceptor.intercept(makeContext('GET', '/patients/99'), {
        handle: () => of({ id: 99 }),
      }),
    );

    expect(res).toEqual({ id: 99 });
    expect(logCritical).toHaveBeenCalledTimes(1);
    expect(logCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'VIEW_PATIENT_RECORD',
        entity: 'patients',
        entityId: 99,
      }),
    );
  });

  it('redacts userId, ipAddress, and clientName for anonymous quality incident creation', async () => {
    const res = await lastValueFrom<unknown>(
      interceptor.intercept(
        makeContext('POST', '/quality/incidents', { hospitalId: 1, sub: 45 }),
        {
          handle: () =>
            of({ id: 700, incidentNumber: 'INC-2026-0700', isAnonymous: true }),
        },
      ),
    );

    expect(res).toEqual({
      id: 700,
      incidentNumber: 'INC-2026-0700',
      isAnonymous: true,
    });
    expect(logCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        hospitalId: 1,
        userId: null,
        ipAddress: 'ANONYMOUS',
        clientName: 'ANONYMOUS',
        entity: 'quality',
      }),
    );
  });

  it('preserves userId for non-anonymous quality incident creation', async () => {
    await lastValueFrom<unknown>(
      interceptor.intercept(
        makeContext('POST', '/quality/incidents', { hospitalId: 1, sub: 45 }),
        {
          handle: () =>
            of({
              id: 701,
              incidentNumber: 'INC-2026-0701',
              isAnonymous: false,
            }),
        },
      ),
    );

    expect(logCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        hospitalId: 1,
        userId: 45,
        ipAddress: '10.10.1.50',
        clientName: 'Mozilla/5.0',
        entity: 'quality',
      }),
    );
  });
});
