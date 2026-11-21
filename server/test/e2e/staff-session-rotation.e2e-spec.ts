import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { io, type Socket } from 'socket.io-client';
import request, { type Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { StaffRealtimeBus } from '../../src/websocket/staff-realtime.bus';
import { EventsGateway } from '../../src/events/events.gateway';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { responseBody } from '../http-response';

function sessionCookie(response: Response, name: 'Refresh' | 'Authentication') {
  const cookies: unknown = response.headers['set-cookie'];
  if (Array.isArray(cookies)) {
    for (const cookie of cookies as unknown[]) {
      if (typeof cookie === 'string' && cookie.startsWith(`${name}=`))
        return cookie.split(';')[0].slice(name.length + 1);
    }
  }
  throw new Error(`Missing ${name} cookie`);
}

async function until(check: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() >= deadline)
      throw new Error('Expected socket state was not reached');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

describe('Staff refresh and branch invalidation (SEC04)', () => {
  let app: NestExpressApplication<Server>;
  let db: PrismaService;
  let staffId: number;
  let homeId: number;
  let delegatedId: number;
  let branchAdminToken: string;
  let fixtureNumber = 0;
  const fixtureIp = () => `192.0.2.${fixtureNumber}`;
  const sockets: Socket[] = [];
  const password = 'Synthetic-secure-5';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication<Server>>();
    app.set('trust proxy', 'loopback');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    db = app.get(PrismaService);
  });

  beforeEach(async () => {
    fixtureNumber++;
    await resetDatabase(db);
    const [home, delegated] = await Promise.all([
      db.hospital.create({ data: { code: 'ROTATION-HOME', name: 'Home' } }),
      db.hospital.create({ data: { code: 'ROTATION-BRANCH', name: 'Branch' } }),
    ]);
    homeId = home.id;
    delegatedId = delegated.id;
    const auth = new AuthHelper(db, app.get(JwtService));
    staffId = (
      await auth.createTestUser('rotation-staff', password, {
        hospitalId: homeId,
        permissions: ['nursing:view'],
      })
    ).user.id;
    branchAdminToken = (
      await auth.createTestUser('rotation-manager', password, {
        hospitalId: delegatedId,
        permissions: ['organizations:update'],
      })
    ).accessToken;
    await db.userHospitalAccess.create({
      data: { userId: staffId, hospitalId: delegatedId },
    });
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const login = () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', fixtureIp())
      .send({ username: 'rotation-staff', password })
      .expect(200);
  const refresh = (token: string) =>
    request(app.getHttpServer())
      .post('/auth/refresh')
      .set('X-Forwarded-For', fixtureIp())
      .set('Cookie', `Refresh=${token}`);
  const me = (token: string) =>
    request(app.getHttpServer())
      .get('/auth/me')
      .auth(token, { type: 'bearer' });
  const switchBranch = (access: string, refreshToken: string) =>
    request(app.getHttpServer())
      .post('/auth/switch-branch')
      .auth(access, { type: 'bearer' })
      .set('Cookie', `Refresh=${refreshToken}`)
      .send({ targetHospitalId: delegatedId });

  const open = (token: string, node = app, namespace = '') => {
    const address = node.getHttpServer().address();
    if (!address || typeof address === 'string')
      throw new Error('Expected a local listener');
    const socket = io(`http://127.0.0.1:${address.port}${namespace}`, {
      auth: { token },
      extraHeaders: namespace
        ? { Cookie: `Authentication=${token}` }
        : undefined,
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      autoConnect: false,
    });
    sockets.push(socket);
    return socket;
  };

  it('keeps browser credentials in cookies through login, refresh, and a branch switch', async () => {
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string')
      throw new Error('Expected a local listener');
    const origin = `http://127.0.0.1:${address.port}`;
    const browserLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', fixtureIp())
      .send({ username: 'rotation-staff', password })
      .expect('Cache-Control', 'no-store')
      .expect(200);
    const nativeLogin = await login();
    expect(responseBody<{ accessToken: string }>(nativeLogin).accessToken).toBe(
      sessionCookie(nativeLogin, 'Authentication'),
    );
    await me(
      responseBody<{ accessToken: string }>(nativeLogin).accessToken,
    ).expect(200);
    expect(responseBody(browserLogin)).not.toHaveProperty('accessToken');
    expect(JSON.stringify(browserLogin.headers['set-cookie'])).toContain(
      'HttpOnly',
    );
    const renewed = await refresh(sessionCookie(browserLogin, 'Refresh'))
      .set('Sec-Fetch-Site', 'same-origin')
      .expect(200);
    expect(responseBody(renewed)).not.toHaveProperty('accessToken');
    const switched = await request(app.getHttpServer())
      .post('/auth/switch-branch')
      .set('Origin', origin)
      .set(
        'Cookie',
        [
          `Authentication=${sessionCookie(renewed, 'Authentication')}`,
          `Refresh=${sessionCookie(renewed, 'Refresh')}`,
        ].join('; '),
      )
      .send({ targetHospitalId: delegatedId })
      .expect(200);
    expect(responseBody(switched)).not.toHaveProperty('accessToken');
    const token = sessionCookie(switched, 'Authentication');
    const authenticated = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `Authentication=${token}`)
      .expect(200);
    expect(responseBody<{ hospitalId: number }>(authenticated).hospitalId).toBe(
      delegatedId,
    );

    const openBrowser = (
      namespace: string,
      browserOrigin: string,
      hospitalId = delegatedId,
    ) => {
      const socket = io(origin + namespace, {
        transports: ['websocket'],
        autoConnect: false,
        forceNew: true,
        reconnection: false,
        auth: { staffScope: { userId: staffId, hospitalId } },
        extraHeaders: {
          Origin: browserOrigin,
          Cookie: `Authentication=${token}`,
        },
      });
      sockets.push(socket);
      return socket;
    };
    const realtime = openBrowser('', origin);
    const nursing = openBrowser('/nursing', origin);
    realtime.connect();
    nursing.connect();
    const gateway = app.get(EventsGateway);
    await until(
      () =>
        gateway.server.sockets.adapter.rooms
          .get(`HOSPITAL_${delegatedId}:USER_${staffId}`)
          ?.has(realtime.id ?? '') === true &&
        gateway.server
          .of('/nursing')
          .adapter.rooms.get(`hospital-${delegatedId}`)
          ?.has(nursing.id ?? '') === true,
    );
    for (const namespace of ['', '/nursing']) {
      const hostile = openBrowser(namespace, 'https://untrusted.invalid');
      let forbidden = false;
      hostile.once('connect_error', () => {
        forbidden = true;
      });
      hostile.connect();
      await until(() => forbidden);
      expect(hostile.connected).toBe(false);
      const stale = openBrowser(namespace, origin, homeId);
      let rejected = false;
      stale.once('disconnect', () => {
        rejected = true;
      });
      stale.connect();
      await until(() => rejected);
    }
    await request(app.getHttpServer())
      .get('/socket.io/?EIO=4&transport=polling')
      .set('Origin', 'https://untrusted.invalid')
      .set('Cookie', `Authentication=${token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/socket.io/?EIO=4&transport=polling')
      .set('Origin', origin)
      .set('Cookie', `Authentication=${token}`)
      .expect(200);
  });

  it('allows one successor and checks the secret before revoking a rotated credential', async () => {
    const original = sessionCookie(await login(), 'Refresh');
    const responses = await Promise.all([refresh(original), refresh(original)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const accepted = responses.find(({ status }) => status === 200)!;
    const conflict = responses.find(({ status }) => status === 409)!;
    expect(conflict.get('Set-Cookie')).toBeUndefined();
    expect(await db.refreshToken.count({ where: { userId: staffId } })).toBe(2);

    const [id] = original.split('.');
    await db.refreshToken.update({
      where: { id: Number(id) },
      data: { updatedAt: new Date(Date.now() - 60_000) },
    });
    await refresh(`${id}.${'f'.repeat(64)}`).expect(403);
    const issued = sessionCookie(accepted, 'Authentication');
    await me(issued).expect(200);
    expect(
      await db.refreshToken.count({
        where: { userId: staffId, revoked: false },
      }),
    ).toBe(1);
    await refresh(original).expect(403);
    await me(issued).expect(401);
    expect(
      await db.refreshToken.count({
        where: { userId: staffId, revoked: false },
      }),
    ).toBe(0);
  });

  it('ends another device across servers without closing the requesting device, with database fallback', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const peer = module.createNestApplication<NestExpressApplication<Server>>();
    try {
      await peer.listen(0, '127.0.0.1');
      await until(
        () =>
          app.get(StaffRealtimeBus).isReady() === true &&
          peer.get(StaffRealtimeBus).isReady() === true,
      );
      const [first, second] = await Promise.all([login(), login()]);
      const firstAccess = sessionCookie(first, 'Authentication');
      const secondAccess = sessionCookie(second, 'Authentication');
      const firstSocket = open(firstAccess, peer);
      const secondSocket = open(secondAccess, peer);
      const firstNursingSocket = open(firstAccess, peer, '/nursing');
      const gateway = peer.get(EventsGateway);
      firstSocket.connect();
      secondSocket.connect();
      firstNursingSocket.connect();
      await until(
        () =>
          gateway.server.sockets.adapter.rooms.get(`STAFF_USER:${staffId}`)
            ?.size === 2,
      );
      await until(
        () =>
          gateway.server
            .of('/nursing')
            .adapter.rooms.get(`STAFF_USER:${staffId}`)
            ?.has(firstNursingSocket.id ?? '') === true,
      );
      const firstSession = app
        .get(JwtService)
        .decode<{ sid: string }>(firstAccess);
      await request(app.getHttpServer())
        .delete(`/auth/sessions/${firstSession.sid}`)
        .auth(secondAccess, { type: 'bearer' })
        .expect(204);
      await until(
        () => !firstSocket.connected && !firstNursingSocket.connected,
      );
      expect(secondSocket.connected).toBe(true);
      await request(peer.getHttpServer())
        .get('/auth/me')
        .auth(firstAccess, { type: 'bearer' })
        .expect(401);
      await refresh(sessionCookie(first, 'Refresh')).expect(403);
      await me(secondAccess).expect(200);
      await refresh(sessionCookie(second, 'Refresh')).expect(200);
      const staleNursing = open(firstAccess, peer, '/nursing');
      let nursingRejected = false;
      staleNursing.once('disconnect', () => {
        nursingRejected = true;
      });
      staleNursing.connect();
      await until(() => nursingRejected);

      const session = app.get(JwtService).decode<{ sid: string }>(secondAccess);
      await db.staffSession.update({
        where: { id: session.sid },
        data: { revokedAt: new Date() },
      });
      await gateway.revalidateStaffSockets();
      await until(() => !secondSocket.connected);
      await me(secondAccess).expect(401);
    } finally {
      for (const socket of sockets.splice(0)) socket.disconnect();
      await peer.close();
    }
  });

  it('lists only owned live sessions and refuses to revoke this device or disclose another account', async () => {
    const first = sessionCookie(await login(), 'Authentication');
    const second = await login();
    const switched = await switchBranch(
      sessionCookie(second, 'Authentication'),
      sessionCookie(second, 'Refresh'),
    ).expect(200);
    const other = sessionCookie(switched, 'Authentication');
    const jwt = app.get(JwtService);
    const currentId = jwt.decode<{ sid: string }>(first).sid;
    const otherId = jwt.decode<{ sid: string }>(other).sid;
    const foreignId = jwt.decode<{ sid: string }>(branchAdminToken).sid;
    await db.staffSession.updateMany({
      where: { userId: staffId, id: { notIn: [currentId, otherId] } },
      data: { expiresAt: new Date(0) },
    });
    const list = () =>
      request(app.getHttpServer())
        .get('/auth/sessions')
        .auth(first, { type: 'bearer' });
    const end = (id: string) =>
      request(app.getHttpServer())
        .delete(`/auth/sessions/${id}`)
        .auth(first, { type: 'bearer' });

    await request(app.getHttpServer()).get('/auth/sessions').expect(401);
    const response = await list()
      .expect('Cache-Control', 'no-store')
      .expect(200);
    const result = responseBody<{
      userId: number;
      sessions: {
        id: string;
        current: boolean;
        branchName: string;
        createdAt: string;
        lastRenewedAt: string;
      }[];
    }>(response);
    expect(result.userId).toBe(staffId);
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.find(({ id }) => id === currentId)).toMatchObject({
      current: true,
      branchName: 'Home',
    });
    expect(result.sessions.find(({ id }) => id === otherId)).toMatchObject({
      current: false,
      branchName: 'Branch',
    });
    for (const session of result.sessions) {
      expect(Object.keys(session).sort()).toEqual([
        'branchName',
        'createdAt',
        'current',
        'id',
        'lastRenewedAt',
      ]);
      expect(Date.parse(session.lastRenewedAt)).toBeGreaterThanOrEqual(
        Date.parse(session.createdAt),
      );
    }
    await end('invalid').expect(400);
    await end(currentId.toUpperCase()).expect(409);
    await end(foreignId).expect(204);
    await me(branchAdminToken).expect(200);

    await Promise.all([end(otherId).expect(204), end(otherId).expect(204)]);
    await me(other).expect(401);
    await me(first).expect(200);
    const after = responseBody<{ sessions: { id: string }[] }>(
      await list().expect(200),
    );
    expect(after.sessions.map((session) => session.id)).toEqual([currentId]);
  });

  it('revokes only a compromised device on old-token replay and supports explicit logout of every device', async () => {
    const [first, second, third] = await Promise.all([
      login(),
      login(),
      login(),
    ]);
    const original = sessionCookie(first, 'Refresh');
    const issued = await refresh(original).expect(200);
    await db.refreshToken.update({
      where: { id: Number(original.split('.')[0]) },
      data: { updatedAt: new Date(Date.now() - 60_000) },
    });
    await refresh(original).expect(403);
    await me(sessionCookie(issued, 'Authentication')).expect(401);
    await me(sessionCookie(second, 'Authentication')).expect(200);
    await request(app.getHttpServer())
      .post('/auth/logout-all')
      .auth(sessionCookie(second, 'Authentication'), { type: 'bearer' })
      .expect(200);
    await me(sessionCookie(third, 'Authentication')).expect(401);
    await refresh(sessionCookie(third, 'Refresh')).expect(403);
  });

  it('rolls back both changes if signing the successor fails', async () => {
    const original = sessionCookie(await login(), 'Refresh');
    const sign = jest
      .spyOn(app.get(AuthService), 'generateAccessToken')
      .mockRejectedValueOnce(new Error('Synthetic signing failure'));
    try {
      await refresh(original).expect(500);
    } finally {
      sign.mockRestore();
    }
    expect(
      await db.refreshToken.count({
        where: { userId: staffId, revoked: false },
      }),
    ).toBe(1);
    expect(await db.refreshToken.count({ where: { userId: staffId } })).toBe(1);
    await refresh(original).expect(200);
  });

  it('preserves the selected branch and closes its live socket when access is withdrawn', async () => {
    const home = await login();
    const switched = await switchBranch(
      sessionCookie(home, 'Authentication'),
      sessionCookie(home, 'Refresh'),
    ).expect(200);
    const refreshed = await refresh(sessionCookie(switched, 'Refresh')).expect(
      200,
    );
    const latest = sessionCookie(refreshed, 'Authentication');
    await me(sessionCookie(home, 'Authentication')).expect(401);
    expect(switched.body).toMatchObject({
      accessToken: sessionCookie(switched, 'Authentication'),
    });
    expect(refreshed.body).toMatchObject({
      accessToken: latest,
      hospitalId: delegatedId,
      userId: staffId,
    });
    expect(refreshed.body).not.toHaveProperty('refreshToken');
    const checked = await me(latest).expect(200);
    expect(checked.body).toMatchObject({ hospitalId: delegatedId });
    const homeAgain = await login();
    const branchSocket = open(latest);
    const homeSocket = open(sessionCookie(homeAgain, 'Authentication'));
    branchSocket.connect();
    homeSocket.connect();
    const rooms = app.get(EventsGateway).server.sockets.adapter.rooms;
    await until(
      () =>
        rooms
          .get(`HOSPITAL_${delegatedId}:USER_${staffId}`)
          ?.has(branchSocket.id ?? '') === true &&
        rooms
          .get(`HOSPITAL_${homeId}:USER_${staffId}`)
          ?.has(homeSocket.id ?? '') === true,
    );
    const [rotated, revoked] = await Promise.all([
      refresh(sessionCookie(refreshed, 'Refresh')),
      request(app.getHttpServer())
        .delete(`/organizations/branches/users/${staffId}/${delegatedId}`)
        .auth(branchAdminToken, { type: 'bearer' }),
    ]);
    expect(revoked.status).toBe(200);
    expect([200, 403]).toContain(rotated.status);
    await until(() => !branchSocket.connected);
    expect(homeSocket.connected).toBe(true);
    await me(latest).expect(401);
    await refresh(sessionCookie(refreshed, 'Refresh')).expect(403);
    if (rotated.status === 200) {
      await me(sessionCookie(rotated, 'Authentication')).expect(401);
      await refresh(sessionCookie(rotated, 'Refresh')).expect(403);
    }
    await refresh(sessionCookie(homeAgain, 'Refresh')).expect(200);
    const stale = open(latest);
    let rejected = false;
    stale.once('disconnect', () => {
      rejected = true;
    });
    stale.connect();
    await until(() => rejected);
  });

  it('serializes logout with refresh and rejects any successor after logout completes', async () => {
    const original = await login();
    const accessToken = sessionCookie(original, 'Authentication');
    const refreshToken = sessionCookie(original, 'Refresh');
    const [rotated, loggedOut] = await Promise.all([
      refresh(refreshToken),
      request(app.getHttpServer())
        .post('/auth/logout')
        .auth(accessToken, { type: 'bearer' }),
    ]);
    expect(loggedOut.status).toBe(200);
    expect([200, 403]).toContain(rotated.status);
    await me(accessToken).expect(401);
    await refresh(refreshToken).expect(403);
    if (rotated.status === 200) {
      await me(sessionCookie(rotated, 'Authentication')).expect(401);
      await refresh(sessionCookie(rotated, 'Refresh')).expect(403);
    }
  });

  it('binds a branch switch to the authenticated refresh cookie and serializes it with refresh', async () => {
    const original = await login();
    const access = sessionCookie(original, 'Authentication');
    const refreshToken = sessionCookie(original, 'Refresh');
    await request(app.getHttpServer())
      .post('/auth/switch-branch')
      .auth(access, { type: 'bearer' })
      .send({ targetHospitalId: delegatedId })
      .expect(401);
    const [switched, rotated] = await Promise.all([
      switchBranch(access, refreshToken),
      refresh(refreshToken),
    ]);
    expect([switched.status, rotated.status].sort()).toEqual([200, 409]);
    const winner = switched.status === 200 ? switched : rotated;
    expect(
      (await me(sessionCookie(winner, 'Authentication')).expect(200)).body,
    ).toMatchObject({
      hospitalId: switched.status === 200 ? delegatedId : homeId,
    });
    expect(
      await db.refreshToken.count({
        where: { userId: staffId, revoked: false },
      }),
    ).toBe(1);
  });
});
