import { ForbiddenException } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import {
  applySoftDeleteFilter,
  applyTenantPolicy,
  enforceTenantOnData,
  enforceTenantOnWhere,
} from './prisma.extension';

describe('prisma tenant isolation helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockCls(values: Record<string, unknown>) {
    jest.spyOn(ClsServiceManager, 'getClsService').mockReturnValue({
      get: (key: string) => values[key],
    } as any);
  }

  it('injects the active hospital into where filters', () => {
    const args: any = {};

    enforceTenantOnWhere('Encounter', args, {
      hospitalId: 7,
      isSuperAdmin: false,
    });

    expect(args.where).toEqual({ hospitalId: 7 });
  });

  it('rejects cross-tenant where filters', () => {
    const args: any = { where: { id: 22, hospitalId: 9 } };

    expect(() =>
      enforceTenantOnWhere('Encounter', args, {
        hospitalId: 7,
        isSuperAdmin: false,
      }),
    ).toThrow(ForbiddenException);
  });

  it('injects the active hospital into create payloads', () => {
    const data: any = { fullName: 'Test Patient' };

    enforceTenantOnData(
      'Patient',
      data,
      { hospitalId: 3, isSuperAdmin: false },
      'data',
    );

    expect(data.hospitalId).toBe(3);
  });

  it('rejects cross-tenant create payloads', () => {
    const data: any = { hospitalId: 99, fullName: 'Wrong Tenant' };

    expect(() =>
      enforceTenantOnData(
        'Patient',
        data,
        { hospitalId: 3, isSuperAdmin: false },
        'data',
      ),
    ).toThrow(ForbiddenException);
  });

  it('scopes counts when CLS context is active', () => {
    mockCls({ hospitalId: 11, isSuperAdmin: false });

    const args = applyTenantPolicy('Appointment', 'count', {}, {
      includeSoftDeleteFilter: true,
    });

    expect(args.where).toEqual({ hospitalId: 11 });
  });

  it('scopes upserts across where, create, and update payloads', () => {
    mockCls({ hospitalId: 15, isSuperAdmin: false });

    const args: any = {
      where: { id: 5 },
      create: { status: 'OPEN' },
      update: { status: 'CLOSED' },
    };

    applyTenantPolicy('Encounter', 'upsert', args);

    expect(args.where.hospitalId).toBe(15);
    expect(args.create.hospitalId).toBe(15);
    expect(args.update.hospitalId).toBe(15);
  });

  it('bypasses tenant enforcement for super admins', () => {
    const args: any = {
      where: { hospitalId: 42 },
      data: { hospitalId: 42, note: 'cross tenant' },
    };

    applyTenantPolicy('Encounter', 'update', args, {
      context: { hospitalId: 7, isSuperAdmin: true },
    });

    expect(args.where.hospitalId).toBe(42);
    expect(args.data.hospitalId).toBe(42);
  });

  it('does not touch exempt models', () => {
    const args: any = {};

    applyTenantPolicy('Hospital', 'findMany', args, {
      context: { hospitalId: 9, isSuperAdmin: false },
      includeSoftDeleteFilter: true,
    });

    expect(args.where).toBeUndefined();
  });

  it('adds the soft delete filter only when missing', () => {
    const args: any = { where: { isDeleted: true } };

    applySoftDeleteFilter('Patient', args);

    expect(args.where).toEqual({ isDeleted: true });
  });
});
