import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PlatformAdminGuard } from '../../auth/platform-admin.guard';
import type { JwtPayload } from '../../auth/jwt-payload.type';
import { TenantController } from './tenant.controller';
import type { TenantService } from './tenant.service';

describe('TenantController (C-02 Platform & Branch Scoping)', () => {
  let controller: TenantController;
  let tenantService: {
    removeUserFromBranch: jest.Mock;
    getBranchUsers: jest.Mock;
  };

  const makeUser = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
    sub: 10,
    username: 'admin',
    hospitalId: 1,
    roles: ['ADMIN'],
    permissions: ['organizations:read', 'organizations:update'],
    isSuperAdmin: false,
    ...overrides,
  });

  beforeEach(() => {
    tenantService = {
      removeUserFromBranch: jest.fn().mockResolvedValue({ removed: true }),
      getBranchUsers: jest.fn().mockResolvedValue([]),
    };
    controller = new TenantController(
      tenantService as unknown as TenantService,
    );
  });

  it.each([
    'findAll',
    'getAllHospitals',
    'getTree',
    'create',
    'update',
    'linkHospital',
    'getHospitalIds',
    'getSettings',
    'setSetting',
    'assignUserToBranch',
    'getUserBranches',
    'setUserBranches',
  ] as const)('enforces PlatformAdminGuard on %s', (methodName) => {
    const target = TenantController.prototype[methodName] as object;
    const guards = Reflect.getMetadata(GUARDS_METADATA, target) as unknown[];
    expect(Array.isArray(guards)).toBe(true);
    expect(guards).toContain(PlatformAdminGuard);
  });

  it('rejects non-SuperAdmin removing or listing users of another hospital', async () => {
    const branch1Admin = makeUser({ hospitalId: 1, isSuperAdmin: false });

    await expect(
      controller.removeUserFromBranch(99, 2, branch1Admin),
    ).rejects.toThrow(ForbiddenException);
    await expect(controller.getBranchUsers(2, branch1Admin)).rejects.toThrow(
      ForbiddenException,
    );
    expect(tenantService.removeUserFromBranch).not.toHaveBeenCalled();
    expect(tenantService.getBranchUsers).not.toHaveBeenCalled();
  });

  it('allows own-branch admin and SuperAdmin on branch user endpoints', async () => {
    const branch2Admin = makeUser({ hospitalId: 2, isSuperAdmin: false });
    const superAdmin = makeUser({ hospitalId: 1, isSuperAdmin: true });

    await controller.removeUserFromBranch(99, 2, branch2Admin);
    await controller.getBranchUsers(2, branch2Admin);
    await controller.removeUserFromBranch(99, 3, superAdmin);

    expect(tenantService.removeUserFromBranch).toHaveBeenCalledTimes(2);
    expect(tenantService.getBranchUsers).toHaveBeenCalledWith(2);
  });
});
