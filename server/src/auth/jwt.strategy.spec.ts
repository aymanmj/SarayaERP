import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { VaultService } from '../common/vault/vault.service';
import type { JwtPayload } from './jwt-payload.type';
import { randomUUID } from 'node:crypto';

describe('Staff JWT current account eligibility', () => {
  const findFirst = jest.fn();
  const set = jest.fn();
  const payload: JwtPayload = {
    sid: randomUUID(),
    branchVersion: 0,
    authVersion: 0,
    sub: 7,
    hospitalId: 4,
    username: 'synthetic',
    roles: ['CASHIER'],
    permissions: ['cashier:manage'],
  };
  let strategy: JwtStrategy;
  let extraStrategies: JwtStrategy[] = [];
  const createStrategy = () =>
    new JwtStrategy(
      new ConfigService(),
      { isActive: () => true, set } as unknown as ClsService,
      {} as VaultService,
      {
        user: { findFirst },
        staffSession: {
          findFirst: jest.fn().mockResolvedValue({ id: payload.sid }),
        },
      } as unknown as PrismaService,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    findFirst.mockResolvedValue({
      id: 7,
      username: 'synthetic',
      hospitalId: 4,
      hospital: { isActive: true, organizationId: 12 },
      accessibleHospitals: [],
      userRoles: [
        {
          role: {
            name: 'CASHIER',
            rolePermissions: [{ permission: { code: 'cashier:manage' } }],
          },
        },
      ],
    });
    extraStrategies = [];
    strategy = createStrategy();
  });

  afterEach(() => {
    for (const extra of extraStrategies.reverse()) {
      extra.onModuleDestroy();
    }
    extraStrategies = [];
    strategy.onModuleDestroy();
  });
  it('checks persisted user and hospital eligibility before publishing the identity', async () => {
    await expect(strategy.validate(payload)).resolves.toEqual({
      ...payload,
      organizationId: 12,
      isSuperAdmin: false,
    });
    const [query] = findFirst.mock.calls[0] as [
      { where: { id: number; isActive: boolean; isDeleted: boolean } },
    ];
    expect(query.where).toMatchObject({
      id: 7,
      isActive: true,
      isDeleted: false,
    });
    expect(set).toHaveBeenCalledWith('userId', 7);
  });
  it('denies a revoked, deleted, missing or moved account without installing a request identity', async () => {
    findFirst.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(set).not.toHaveBeenCalled();
  });

  it('rejects an old staff token without a device session claim before looking up the account', async () => {
    await expect(
      strategy.validate({ ...payload, sid: undefined }),
    ).rejects.toThrow(UnauthorizedException);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN])(
    'rejects invalid staff identity %s without a database lookup',
    async (sub) => {
      await expect(strategy.validate({ ...payload, sub })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
  it('rejects malformed claim lists instead of passing them to authorization guards', async () => {
    await expect(
      strategy.validate({
        ...payload,
        permissions: [12],
      } as unknown as JwtPayload),
    ).rejects.toThrow(UnauthorizedException);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('fails closed when current account eligibility cannot be read', async () => {
    findFirst.mockRejectedValue(new Error('synthetic database unavailable'));
    await expect(strategy.validate(payload)).rejects.toThrow(
      'synthetic database unavailable',
    );
    expect(set).not.toHaveBeenCalled();
  });
  it('rebuilds privileges instead of trusting old ADMIN, full-access or platform claims', async () => {
    const old = {
      ...payload,
      roles: ['ADMIN', 'SUPER_ADMIN'],
      permissions: ['ADMIN_FULL_ACCESS'],
      organizationId: 99,
      isSuperAdmin: true,
      patientId: 999,
    };
    const current = await strategy.validate(old);
    expect(current).toEqual({
      ...payload,
      organizationId: 12,
      isSuperAdmin: false,
    });
    expect(current).not.toHaveProperty('patientId');
    expect(set).toHaveBeenCalledWith('isSuperAdmin', false);
  });
  it('reloads grants on every request and never falls back to previous privileges when the database fails', async () => {
    await strategy.validate(payload);
    findFirst.mockResolvedValue({
      id: 7,
      username: 'synthetic',
      hospitalId: 4,
      hospital: { isActive: true, organizationId: 12 },
      accessibleHospitals: [],
      userRoles: [],
    });
    expect(await strategy.validate(payload)).toMatchObject({
      roles: [],
      permissions: [],
      isSuperAdmin: false,
    });
    set.mockClear();
    findFirst.mockRejectedValue(new Error('synthetic grant lookup failed'));
    await expect(strategy.validate(payload)).rejects.toThrow(
      'synthetic grant lookup failed',
    );
    expect(set).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledTimes(3);
  });
  it('derives organization metadata from the selected authorized branch', async () => {
    findFirst.mockResolvedValue({
      id: 7,
      username: 'synthetic',
      hospitalId: 4,
      hospital: { isActive: true, organizationId: 12 },
      accessibleHospitals: [{ hospital: { organizationId: 20 } }],
      userRoles: [],
    });
    expect(
      await strategy.validate({
        ...payload,
        hospitalId: 6,
        organizationId: 999,
      }),
    ).toMatchObject({ hospitalId: 6, organizationId: 20 });
  });
  it('rejects a branch grant that disappeared while loading identity relations', async () => {
    findFirst.mockResolvedValue({
      id: 7,
      username: 'synthetic',
      hospitalId: 4,
      hospital: { isActive: true, organizationId: 12 },
      accessibleHospitals: [],
      userRoles: [],
    });
    await expect(
      strategy.validate({ ...payload, hospitalId: 6 }),
    ).rejects.toThrow(UnauthorizedException);
    expect(set).not.toHaveBeenCalled();
  });

  it('restores the previous JwtStrategy in Passport when a secondary module destroys', () => {
    const second = createStrategy();
    extraStrategies.push(second);
    const registry = strategy.getPassportInstance();
    const useSpy = jest.spyOn(registry, 'use');
    const unuseSpy = jest.spyOn(registry, 'unuse');

    try {
      second.onModuleDestroy();
      extraStrategies.pop();
      expect(useSpy).toHaveBeenCalledWith('jwt', strategy);
      expect(unuseSpy).not.toHaveBeenCalled();
    } finally {
      useSpy.mockRestore();
      unuseSpy.mockRestore();
    }
  });

  it('unregisters the jwt strategy from Passport when the last active instance destroys', () => {
    const registry = strategy.getPassportInstance();
    const unuseSpy = jest.spyOn(registry, 'unuse');
    try {
      strategy.onModuleDestroy();
      expect(unuseSpy).toHaveBeenCalledWith('jwt');
    } finally {
      unuseSpy.mockRestore();
    }
  });
});
