import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { LicenseService } from '../licensing/license.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService (Security & Session Invalidation)', () => {
  let service: UsersService;
  let eventEmitter: { emit: jest.Mock };
  let prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    role: { findUnique: jest.Mock };
    userRole: { create: jest.Mock; deleteMany: jest.Mock };
    doctorSchedule: { create: jest.Mock };
    staffSession: { updateMany: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 9, name: 'SUPER_ADMIN' }),
      },
      userRole: { create: jest.fn(), deleteMany: jest.fn() },
      doctorSchedule: { create: jest.fn() },
      staffSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(
        async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
      ),
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: LicenseService,
          useValue: {
            checkUserLimit: jest.fn().mockReturnValue(true),
            details: { maxUsers: 100 },
          },
        },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('rejects assigning SUPER_ADMIN when caller is not SuperAdmin', async () => {
    await expect(
      service.create(
        1,
        {
          fullName: 'Rogue Admin',
          username: 'rogue_admin',
          password: 'StrongPassword1!',
          roles: ['SUPER_ADMIN'],
        },
        false,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await expect(
      service.create(1, {
        fullName: 'Short Pass',
        username: 'short_pass',
        password: '123',
        roles: ['NURSE'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('omits passwordHash from findAll, create, and update responses', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 1, username: 'doc', fullName: 'Dr', passwordHash: 'secret-hash' },
    ]);
    const list = await service.findAll(1);
    expect(list[0]).not.toHaveProperty('passwordHash');

    prisma.user.create.mockResolvedValue({
      id: 2,
      username: 'new_doc',
      fullName: 'New Dr',
      isDoctor: false,
      passwordHash: 'secret-hash',
    });
    const created = await service.create(
      1,
      {
        fullName: 'New Dr',
        username: 'new_doc',
        password: 'StrongPassword1!',
        roles: ['SUPER_ADMIN'],
      },
      true,
    );
    expect(created).not.toHaveProperty('passwordHash');
  });

  it('blocks non-SuperAdmin from editing a SUPER_ADMIN account or promoting via update', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 5,
      hospitalId: 1,
      username: 'root',
      userRoles: [{ role: { name: 'SUPER_ADMIN' } }],
    });
    await expect(
      service.update(1, 5, { fullName: 'Tampered' }, false),
    ).rejects.toThrow(ForbiddenException);

    prisma.user.findFirst.mockResolvedValueOnce({
      id: 6,
      hospitalId: 1,
      username: 'nurse',
      userRoles: [{ role: { name: 'NURSE' } }],
    });
    await expect(
      service.update(1, 6, { roles: ['SYSTEM_ADMIN'] }, false),
    ).rejects.toThrow(ForbiddenException);
  });

  it('invalidates staff sessions and emits user.deactivated when password changes', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 7,
      hospitalId: 1,
      username: 'staff7',
      email: null,
      phone: null,
      isDoctor: false,
      isActive: true,
      userRoles: [{ role: { name: 'NURSE' } }],
    });
    prisma.user.update.mockResolvedValue({
      id: 7,
      username: 'staff7',
      passwordHash: 'new-hash',
    });

    const updated = await service.update(
      1,
      7,
      { password: 'NewStrongPassword1!' },
      false,
    );

    expect(updated).not.toHaveProperty('passwordHash');
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.staffSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, revoked: false },
      data: { revoked: true },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('user.deactivated', {
      hospitalId: 1,
      userId: 7,
    });
  });
});
