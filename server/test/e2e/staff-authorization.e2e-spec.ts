import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { Server } from 'node:http';
import type { JwtPayload } from '../../src/auth/jwt-payload.type';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper, testStaffSessionClaims } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Current staff authorization (real HTTP and PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let auth: AuthHelper;
  let token: string;
  let userId: number;
  let hospitalId: number;
  let roleId: number;
  let http: Server;

  const get = (path: string, accessToken = token) =>
    request(http).get(path).auth(accessToken, { type: 'bearer' });
  const updateRole = (ids: unknown, accessToken: string) =>
    request(http)
      .patch(`/users/roles/${roleId}/permissions`)
      .auth(accessToken, { type: 'bearer' })
      .send({ permissionIds: ids });
  const platform = async () =>
    (
      await auth.createTestUser('platform', 'synthetic-password', {
        hospitalId,
        roles: ['SUPER_ADMIN'],
        permissions: ['users:manage'],
      })
    ).accessToken;
  const sign = async (
    claims: Record<string, unknown>,
    issuer = 'saraya-staff',
  ) =>
    app.get(JwtService).signAsync(
      {
        ...(await testStaffSessionClaims(
          db,
          userId,
          Number(claims.hospitalId ?? hospitalId),
        )),
        sub: userId,
        hospitalId,
        roles: [],
        permissions: [],
        ...claims,
      },
      { secret: process.env.JWT_SECRET, issuer, expiresIn: '15m' },
    );

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer() as Server;
    db = app.get(PrismaService);
    auth = new AuthHelper(db, app.get(JwtService));
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    const staff = await auth.createTestUser('staff', 'synthetic-password', {
      permissions: ['patients:view', 'patients:manage'],
    });
    token = staff.accessToken;
    userId = staff.user.id;
    hospitalId = staff.user.hospitalId;
    roleId = (
      await db.role.findUniqueOrThrow({
        where: { name: `SYNTHETIC_PERMISSIONS_${userId}` },
      })
    ).id;
  });

  it('denies a removed permission with the unchanged old token and prevents writes', async () => {
    const permission = await db.permission.findUniqueOrThrow({
      where: { code: 'patients:manage' },
    });
    await db.rolePermission.deleteMany({
      where: { roleId, permissionId: permission.id },
    });
    await request(http)
      .post('/patients')
      .auth(token, { type: 'bearer' })
      .send({ fullName: 'Must not be created', gender: 'MALE' })
      .expect(403);
    expect(await db.patient.count()).toBe(0);
    await get('/patients').expect(200);
    expect(
      app.get(JwtService).decode<{ permissions: string[] }>(token).permissions,
    ).toContain('patients:manage');
    const me = await get('/auth/me').expect(200);
    expect(me.body).toMatchObject({
      permissions: ['patients:view'],
      isSuperAdmin: false,
    });
    expect(me.headers['cache-control']).toBe('no-store');
  });

  it('denies after role membership removal and accepts a new grant without reissuing the token', async () => {
    await db.userRole.deleteMany({ where: { userId } });
    await get('/patients').expect(403);
    await db.userRole.create({ data: { userId, roleId } });
    await get('/patients').expect(200);
  });

  it('does not trust signed stale ADMIN, SUPER_ADMIN, full-access or patient claims', async () => {
    const stale = await sign({
      roles: ['ADMIN', 'SUPER_ADMIN'],
      permissions: ['ADMIN_FULL_ACCESS'],
      isSuperAdmin: true,
      organizationId: 999999,
      patientId: 999999,
    });
    await get('/users', stale).expect(403);
    const me = await get('/auth/me', stale).expect(200);
    expect(me.body).toMatchObject({
      sub: userId,
      hospitalId,
      isSuperAdmin: false,
    });
    expect(me.body).not.toHaveProperty('patientId');
    const identity = me.body as JwtPayload;
    expect(identity.roles).not.toContain('ADMIN');
    expect(identity.permissions).not.toContain('ADMIN_FULL_ACCESS');
    expect(identity.organizationId).not.toBe(999999);
  });

  it.each(['ADMIN', 'ADMIN_FULL_ACCESS'])(
    'withdraws the real %s bypass on the next request',
    async (grant) => {
      const admin = await auth.createTestUser('admin', 'synthetic-password', {
        hospitalId,
        roles: grant === 'ADMIN' ? ['ADMIN'] : [],
        permissions: grant === 'ADMIN_FULL_ACCESS' ? [grant] : [],
      });
      await get('/users', admin.accessToken).expect(200);
      await db.userRole.deleteMany({ where: { userId: admin.user.id } });
      await get('/users', admin.accessToken).expect(403);
    },
  );

  it('withdraws platform administration despite a still-valid users:manage permission', async () => {
    const accessToken = await platform();
    const superRole = await db.role.findUniqueOrThrow({
      where: { name: 'SUPER_ADMIN' },
    });
    await updateRole([], accessToken).expect(200);
    await db.userRole.deleteMany({ where: { roleId: superRole.id } });
    await updateRole([], accessToken).expect(403);
    await get('/users', accessToken).expect(200);
  });

  it('uses the authorized branch organization and denies the same token after branch revocation', async () => {
    const org = await db.organization.create({
      data: { code: 'AUTH-ORG', name: 'Synthetic Organization' },
    });
    const branch = await db.hospital.create({
      data: {
        code: 'AUTH-BRANCH',
        name: 'Synthetic Branch',
        organizationId: org.id,
      },
    });
    await db.userHospitalAccess.create({
      data: { userId, hospitalId: branch.id },
    });
    const switched = await sign({
      hospitalId: branch.id,
      organizationId: 999999,
    });
    const me = await get('/auth/me', switched).expect(200);
    expect(me.body).toMatchObject({
      hospitalId: branch.id,
      organizationId: org.id,
    });
    await db.userHospitalAccess.deleteMany({
      where: { userId, hospitalId: branch.id },
    });
    await get('/auth/me', switched).expect(401);
    await get('/auth/me').expect(200);
  });

  it.each(['disabled-user', 'deleted-user', 'disabled-hospital'])(
    'rejects %s with the old token',
    async (state) => {
      if (state === 'disabled-hospital') {
        await db.hospital.update({
          where: { id: hospitalId },
          data: { isActive: false },
        });
      } else {
        await db.user.update({
          where: { id: userId },
          data:
            state === 'disabled-user'
              ? { isActive: false }
              : { isDeleted: true },
        });
      }
      await get('/auth/me').expect(401);
    },
  );

  it('rejects unauthenticated and non-staff issuer tokens', async () => {
    await request(http).get('/auth/me').expect(401);
    await get('/auth/me', await sign({}, 'saraya-patient')).expect(401);
  });

  it('validates role edits and makes replacements and empty revocations effective immediately', async () => {
    const accessToken = await platform();
    const old = await db.rolePermission.findMany({
      where: { roleId },
      orderBy: { id: 'asc' },
    });
    for (const ids of [
      null,
      '1',
      [0],
      [-1],
      [1.5],
      ['1'],
      [old[0].permissionId, old[0].permissionId],
      [2147483647],
      [2147483648],
      [9007199254740991],
      [true],
      {},
    ]) {
      await updateRole(ids, accessToken).expect(400);
      expect(
        await db.rolePermission.findMany({
          where: { roleId },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(old);
    }
    const users = await db.permission.findUniqueOrThrow({
      where: { code: 'users:manage' },
    });
    await updateRole([users.id], accessToken).expect(200);
    await get('/patients').expect(403);
    await get('/users').expect(200);
    await updateRole([], accessToken).expect(200);
    await get('/users').expect(403);
  });

  it('serializes competing replacements without merging grants from both edits', async () => {
    const accessToken = await platform();
    const grants = await db.permission.findMany({
      where: { code: { in: ['patients:view', 'patients:manage'] } },
      orderBy: { id: 'asc' },
    });
    const results = await Promise.all([
      updateRole([grants[0].id], accessToken),
      updateRole([grants[1].id], accessToken),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const saved = await db.rolePermission.findMany({ where: { roleId } });
    expect(saved).toHaveLength(1);
    expect(grants.map((grant) => grant.id)).toContain(saved[0].permissionId);
    const me = await get('/auth/me').expect(200);
    const identity = me.body as JwtPayload;
    expect(identity.permissions).toEqual([
      grants.find((grant) => grant.id === saved[0].permissionId)?.code,
    ]);
  });

  it('returns 404 for a missing role without altering existing grants', async () => {
    const accessToken = await platform();
    const old = await db.rolePermission.findMany({ where: { roleId } });
    await request(http)
      .patch('/users/roles/2147483647/permissions')
      .auth(accessToken, { type: 'bearer' })
      .send({ permissionIds: [] })
      .expect(404);
    expect(await db.rolePermission.findMany({ where: { roleId } })).toEqual(
      old,
    );
  });

  it('rolls back the old grants when inserting their replacement fails', async () => {
    const accessToken = await platform();
    const ids = (await db.rolePermission.findMany({ where: { roleId } })).map(
      (row) => row.permissionId,
    );
    await db.$executeRawUnsafe(
      `CREATE FUNCTION repair_test_role_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic role insertion failure'; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        `CREATE TRIGGER repair_test_role_failure BEFORE INSERT ON "RolePermission" FOR EACH ROW EXECUTE FUNCTION repair_test_role_failure()`,
      );
      await updateRole(ids, accessToken).expect(500);
      expect(
        (await db.rolePermission.findMany({ where: { roleId } }))
          .map((row) => row.permissionId)
          .sort(),
      ).toEqual(ids.sort());
      await get('/patients').expect(200);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS repair_test_role_failure ON "RolePermission"',
      );
      await db.$executeRawUnsafe('DROP FUNCTION repair_test_role_failure()');
    }
  });
});
