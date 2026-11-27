import { ForbiddenException } from '@nestjs/common';
import { ClsServiceManager, type ClsService } from 'nestjs-cls';
import {
  applySoftDeleteFilter,
  applyTenantPolicy,
  enforceTenantOnData,
  enforceTenantOnWhere,
  type MutableRecord,
  type TenantQueryArgs,
} from './prisma.extension';

describe('prisma tenant isolation helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockCls(values: Record<string, unknown>) {
    jest.spyOn(ClsServiceManager, 'getClsService').mockReturnValue({
      get: (key: string) => values[key],
    } as unknown as ClsService);
  }

  it('injects the active hospital into where filters', () => {
    const args: TenantQueryArgs = {};

    enforceTenantOnWhere('Encounter', args, {
      hospitalId: 7,
      isSuperAdmin: false,
    });

    expect(args.where).toEqual({ hospitalId: 7 });
  });

  it('rejects cross-tenant where filters', () => {
    const args: TenantQueryArgs = { where: { id: 22, hospitalId: 9 } };

    expect(() =>
      enforceTenantOnWhere('Encounter', args, {
        hospitalId: 7,
        isSuperAdmin: false,
      }),
    ).toThrow(ForbiddenException);
  });

  it('injects the active hospital into create payloads', () => {
    const data: MutableRecord = { fullName: 'Test Patient' };

    enforceTenantOnData(
      'Patient',
      data,
      { hospitalId: 3, isSuperAdmin: false },
      'data',
    );

    expect(data.hospitalId).toBe(3);
  });

  it('rejects cross-tenant create payloads', () => {
    const data: MutableRecord = { hospitalId: 99, fullName: 'Wrong Tenant' };

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

    const args = applyTenantPolicy(
      'Appointment',
      'count',
      {} as TenantQueryArgs,
      {
        includeSoftDeleteFilter: true,
      },
    );

    expect(args.where).toEqual({ hospitalId: 11 });
  });

  it('scopes upserts across where, create, and update payloads', () => {
    mockCls({ hospitalId: 15, isSuperAdmin: false });

    const where: MutableRecord = { id: 5 };
    const create: MutableRecord = { status: 'OPEN' };
    const update: MutableRecord = { status: 'CLOSED' };
    const args: TenantQueryArgs = { where, create, update };

    applyTenantPolicy('Encounter', 'upsert', args);

    expect(where.hospitalId).toBe(15);
    expect(create.hospitalId).toBe(15);
    expect(update.hospitalId).toBeUndefined();
  });

  it('bypasses tenant enforcement for super admins', () => {
    const where: MutableRecord = { hospitalId: 42 };
    const data: MutableRecord = { hospitalId: 42, note: 'cross tenant' };
    const args: TenantQueryArgs = { where, data };

    applyTenantPolicy('Encounter', 'update', args, {
      context: { hospitalId: 7, isSuperAdmin: true },
    });

    expect(where.hospitalId).toBe(42);
    expect(data.hospitalId).toBe(42);
  });

  it('does not touch exempt models', () => {
    const args: TenantQueryArgs = {};

    applyTenantPolicy('Hospital', 'findMany', args, {
      context: { hospitalId: 9, isSuperAdmin: false },
      includeSoftDeleteFilter: true,
    });

    expect(args.where).toBeUndefined();
  });

  it('adds the soft delete filter only when missing', () => {
    const args: TenantQueryArgs = { where: { isDeleted: true } };

    applySoftDeleteFilter('Patient', args);

    expect(args.where).toEqual({ isDeleted: true });
  });
});
