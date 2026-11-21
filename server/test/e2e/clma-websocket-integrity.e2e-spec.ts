import { responseBody } from '../http-response';
type TestResponse = {
  id: number;
  message: string;
  status: string;
  isPatientMatch: boolean;
  isDrugMatch: boolean;
  isBarcodeMatch: boolean;
  isVerified5Rights: boolean;
  expectedPatientBarcode: string;
  expectedDrugBarcode: string;
  drugName: string;
  dose: string;
  route: string;
  isEmergencyOverride: boolean;
  varianceReason: string;
};
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { connect, createServer, type Socket as TcpSocket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  createServer as createHttpServer,
  request as forwardHttp,
  type Server,
} from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EventsGateway } from '../../src/events/events.gateway';
import { UsersService } from '../../src/users/users.service';
import { StaffRealtimeBus } from '../../src/websocket/staff-realtime.bus';
import { AuthHelper } from '../auth-helper';
import { AuditService } from '../../src/audit/audit.service';
import { medicationContext } from '../../src/nursing/medication-administration';
import { resetDatabase } from '../db-reset';
import {
  AdministrationStatus,
  EncounterStatus,
  EncounterType,
  PrescriptionStatus,
  ProductType,
} from '@prisma/client';

describe('Patient-and-drug barcode matching (partial CLMA) & Real-Time WebSocket Multi-Tenant Security (UI14 / CAP03 / SEC04 / OPS02 / OPS03)', () => {
  let app: INestApplication<Server>;
  let peer: INestApplication<Server> | undefined;
  let db: PrismaService;
  let jwt: JwtService;
  let gateway: EventsGateway;
  let usersService: UsersService;
  let auth: AuthHelper;

  let hospitalId: number;
  let otherHospitalId: number;
  let nurseToken: string;
  let nurseUserId: number;
  let otherNurseToken: string;
  let encounterId: number;
  let prescriptionId: number;
  let prescriptionItemId: number;
  let patientMrn: string;
  let drugBarcode: string;
  let drugCode: string;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');

    db = app.get(PrismaService);
    jwt = app.get(JwtService);
    gateway = app.get(EventsGateway);
    usersService = app.get(UsersService);
    auth = new AuthHelper(db, jwt);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  afterEach(async () => {
    await peer?.close();
    peer = undefined;
  });

  beforeEach(async () => {
    await resetDatabase(db);

    // 1. Primary Hospital setup
    const hospital = await db.hospital.create({
      data: {
        code: 'CLMA_HOSPITAL_A',
        name: 'Hospital A CLMA Center',
        isActive: true,
      },
    });
    hospitalId = hospital.id;

    // 2. Secondary Hospital setup for tenant isolation tests
    const otherHospital = await db.hospital.create({
      data: {
        code: 'CLMA_HOSPITAL_B',
        name: 'Hospital B CLMA Center',
        isActive: true,
      },
    });
    otherHospitalId = otherHospital.id;

    // 3. Nurse Actor for Hospital A
    const nurse = await auth.createTestUser('nurse-actor-a', 'securePass123', {
      hospitalId,
      roles: ['NURSE'],
      permissions: [
        'nursing:medications:administer',
        'nursing:medications:override',
        'nursing:view',
        'nursing:station:view',
        'nursing:notes:manage',
        'nursing:dashboard:view',
        'vitals:manage',
      ],
    });
    nurseToken = nurse.accessToken;
    nurseUserId = nurse.user.id;

    // 4. Nurse Actor for Hospital B
    const otherNurse = await auth.createTestUser(
      'nurse-actor-b',
      'securePass123',
      {
        hospitalId: otherHospitalId,
        roles: ['NURSE'],
        permissions: [
          'nursing:medications:administer',
          'nursing:medications:override',
          'nursing:view',
          'nursing:station:view',
          'nursing:notes:manage',
        ],
      },
    );
    otherNurseToken = otherNurse.accessToken;

    // 5. Doctor Actor for Hospital A
    const doctor = await auth.createTestUser(
      'doctor-actor-a',
      'securePass123',
      {
        hospitalId,
        roles: ['DOCTOR'],
        permissions: ['clinical:doctor:view'],
      },
    );

    // 6. Patient in Hospital A
    patientMrn = 'H701-MRN-9021';
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: patientMrn,
        fullName: 'طارق عبد السلام',
        dateOfBirth: new Date('1985-04-12'),
      },
    });

    // 7. Open Inpatient Encounter
    const encounter = await db.encounter.create({
      data: {
        hospitalId,
        patientId: patient.id,
        doctorId: doctor.user.id,
        type: EncounterType.IPD,
        status: EncounterStatus.OPEN,
      },
    });
    encounterId = encounter.id;

    // 8. Drug Product with verified barcode & code
    drugBarcode = '6281009876543';
    drugCode = 'MED-CEFTRIAX-1G';
    const drug = await db.product.create({
      data: {
        hospitalId,
        code: drugCode,
        name: 'سيفوترياكسون 1 جم حقن',
        type: ProductType.DRUG,
        barcode: drugBarcode,
        strength: '1g',
        form: 'VIAL',
        isActive: true,
      },
    });

    // 9. Prescription & PrescriptionItem
    const prescription = await db.prescription.create({
      data: {
        hospitalId,
        encounterId,
        patientId: patient.id,
        doctorId: doctor.user.id,
        status: PrescriptionStatus.ACTIVE,
        pharmacistVerificationStatus: 'VERIFIED',
        items: {
          create: {
            productId: drug.id,
            dose: '1g',
            route: 'IV',
            frequency: 'BID',
            durationDays: 5,
            quantity: 10,
          },
        },
      },
      include: { items: true },
    });
    prescriptionId = prescription.id;
    prescriptionItemId = prescription.items[0].id;
  });

  it('broadcasts saved nursing records once on both servers and isolates the other hospital', async () => {
    const reader = await auth.createTestUser(
      'read-only-nursing-socket',
      'synthetic',
      {
        hospitalId,
        permissions: ['nursing:view'],
      },
    );
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    peer = module.createNestApplication<INestApplication<Server>>();
    await peer.listen(0, '127.0.0.1');
    const buses = [app.get(StaffRealtimeBus), peer.get(StaffRealtimeBus)];
    const deadline = Date.now() + 5000;
    while (buses.some((bus) => !bus.isReady())) {
      if (Date.now() >= deadline)
        throw new Error('Expected both Redis subscribers to be ready');
      await delay(20);
    }
    const open = (token: string, node: INestApplication<Server>) => {
      const address = node.getHttpServer().address();
      if (!address || typeof address === 'string')
        throw new Error('Expected local listener');
      return io(`http://127.0.0.1:${address.port}/nursing`, {
        autoConnect: false,
        forceNew: true,
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Cookie: `Authentication=${token}` },
      });
    };
    const next = (socket: Socket, event: string) =>
      new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Missing ${event}`)),
          3000,
        );
        socket.once(event, (payload: unknown) => {
          clearTimeout(timeout);
          resolve(payload);
        });
      });
    const local = open(reader.accessToken, app);
    const remote = open(reader.accessToken, peer);
    const foreign = open(otherNurseToken, peer);
    const received: unknown[] = [];
    const remoteEvents: unknown[] = [];
    const foreignEvents: unknown[] = [];
    const publish = jest.spyOn(Redis.prototype, 'publish');
    for (const event of [
      'medication_update',
      'vitals_update',
      'patient_alert',
    ]) {
      local.on(event, (payload: unknown) => received.push(payload));
      remote.on(event, (payload: unknown) => remoteEvents.push(payload));
      foreign.on(event, (payload: unknown) => foreignEvents.push(payload));
    }
    try {
      const ready = [
        next(local, 'initial_data'),
        next(remote, 'initial_data'),
        next(foreign, 'initial_data'),
      ];
      local.connect();
      remote.connect();
      foreign.connect();
      await Promise.all(ready);
      local.emit('medication_administered', {
        encounterId,
        medicationName: 'Forged drug',
        administeredBy: 'Unknown',
        status: 'ADMINISTERED',
      });
      local.emit('vitals_updated', {
        encounterId,
        vitals: { pulse: 170 },
        nurseName: 'Unknown',
      });
      local.emit('patient_alert', {
        encounterId,
        alertType: 'CRITICAL',
        patientName: 'Unknown',
        message: 'Forged alert',
      });
      await request(app.getHttpServer())
        .post(`/vitals/encounter/${encounterId}`)
        .auth(reader.accessToken, { type: 'bearer' })
        .send({ pulse: 75 })
        .expect(403);
      const dose = {
        requestId: randomUUID(),
        prescriptionItemId,
        patientBarcode: patientMrn,
        drugBarcode,
      };
      const sendDose = (body: object) =>
        request(app.getHttpServer())
          .post(`/nursing/encounters/${encounterId}/administer-barcode`)
          .auth(nurseToken, { type: 'bearer' })
          .send(body)
          .expect(201);
      const heldNotices = Promise.all([
        next(local, 'medication_update'),
        next(remote, 'medication_update'),
      ]);
      const held = await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/administer-med`)
        .auth(nurseToken, { type: 'bearer' })
        .send({
          prescriptionItemId,
          requestId: randomUUID(),
          status: 'HELD',
          notes: 'Synthetic held dose',
        })
        .expect(201);
      for (const notice of await heldNotices) {
        expect(notice).toMatchObject({
          administrationId: responseBody<TestResponse>(held).id,
          type: 'not_given',
          status: 'HELD',
        });
      }
      const givenNotices = Promise.all([
        next(local, 'medication_update'),
        next(remote, 'medication_update'),
      ]);
      const given = { ...dose, requestId: randomUUID() };
      const saved = responseBody<TestResponse>(await sendDose(given));
      for (const notice of await givenNotices) {
        expect(notice).toMatchObject({
          administrationId: saved.id,
          encounterId,
          type: 'administered',
          status: 'GIVEN',
          medication: 'سيفوترياكسون 1 جم حقن',
          administeredBy: 'Test User',
        });
      }
      expect(responseBody<TestResponse>(await sendDose(given)).id).toBe(
        saved.id,
      );
      const measured = Promise.all([
        next(local, 'vitals_update'),
        next(remote, 'vitals_update'),
      ]);
      const alerts = Promise.all([
        next(local, 'patient_alert'),
        next(remote, 'patient_alert'),
      ]);
      const vital = await request(app.getHttpServer())
        .post(`/vitals/encounter/${encounterId}`)
        .auth(nurseToken, { type: 'bearer' })
        .send({ pulse: 125 })
        .expect(201);
      const vitalId = responseBody<{ id: number }>(vital).id;
      for (const update of await measured) {
        expect(update).toMatchObject({
          encounterId,
          vitalSignId: vitalId,
          vitals: { pulse: 125 },
        });
      }
      for (const alert of await alerts) {
        expect(alert).toMatchObject({
          encounterId,
          vitalSignId: vitalId,
          message: 'Critical Vitals Detected: HR 125',
        });
      }
      expect(received).toHaveLength(4);
      expect(remoteEvents).toEqual(received);
      expect(foreignEvents).toEqual([]);
      expect(await db.vitalSign.count({ where: { encounterId } })).toBe(1);
      expect(
        await db.medicationAdministration.count({ where: { encounterId } }),
      ).toBe(2);
      const references = publish.mock.calls
        .filter(
          ([channel]) =>
            typeof channel === 'string' &&
            channel.startsWith('saraya:nursing-record:'),
        )
        .map(([, message]) => {
          const envelope = JSON.parse(String(message)) as { payload: unknown };
          return envelope.payload;
        });
      expect(references).toEqual([
        {
          kind: 'medication',
          hospitalId,
          encounterId,
          recordId: responseBody<TestResponse>(held).id,
        },
        { kind: 'medication', hospitalId, encounterId, recordId: saved.id },
        { kind: 'vital', hospitalId, encounterId, recordId: vitalId },
      ]);

      publish.mockRejectedValueOnce(
        new Error('Synthetic Redis publish failure'),
      );
      const localOnly = next(local, 'vitals_update');
      const recordedWhileRedisUnavailable = responseBody<{ id: number }>(
        await request(app.getHttpServer())
          .post(`/vitals/encounter/${encounterId}`)
          .auth(nurseToken, { type: 'bearer' })
          .send({ pulse: 81 })
          .expect(201),
      );
      expect(await localOnly).toMatchObject({
        vitalSignId: recordedWhileRedisUnavailable.id,
        vitals: { pulse: 81 },
      });
      expect(await db.vitalSign.count({ where: { encounterId } })).toBe(2);
      expect(remoteEvents).toHaveLength(4);
    } finally {
      publish.mockRestore();
      local.disconnect();
      remote.disconnect();
      foreign.disconnect();
    }
  });

  it('recovers persisted records on another server after a transport interruption', async () => {
    type Page = {
      cursor: string;
      hasMore: boolean;
      messages: {
        event: string;
        payload: { administrationId?: number; vitalSignId?: number };
      }[];
    };
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string')
      throw new Error('Expected local listener');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    peer = module.createNestApplication<INestApplication<Server>>();
    await peer.listen(0, '127.0.0.1');
    const peerAddress = peer.getHttpServer().address();
    if (!peerAddress || typeof peerAddress === 'string')
      throw new Error('Expected peer listener');

    let upstreamPort: number | null = address.port;
    const links = new Set<TcpSocket>();
    const relay = createServer((downstream) => {
      if (upstreamPort === null) {
        downstream.destroy();
        return;
      }
      const upstream = connect(upstreamPort, '127.0.0.1');
      for (const [socket, other] of [
        [downstream, upstream],
        [upstream, downstream],
      ]) {
        links.add(socket);
        socket.on('error', () => socket.destroy());
        socket.once('close', () => {
          links.delete(socket);
          other.destroy();
        });
      }
      downstream.pipe(upstream).pipe(downstream);
    });
    const sockets: Socket[] = [];
    const openSocket = (port: number, token: string, reconnection = false) => {
      const socket = io(`http://127.0.0.1:${port}/nursing`, {
        autoConnect: false,
        forceNew: true,
        transports: ['websocket'],
        reconnection,
        reconnectionDelay: 100,
        reconnectionDelayMax: 100,
        randomizationFactor: 0,
        extraHeaders: { Cookie: `Authentication=${token}` },
      });
      sockets.push(socket);
      return socket;
    };
    const waitForSnapshot = (socket: Socket) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Expected nursing snapshot')),
          10000,
        );
        socket.once('initial_data', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    const recover = (
      socket: Socket,
      after: string | null,
      requestedHospital?: number,
    ) =>
      socket.timeout(5000).emitWithAck('recover_notifications', {
        after,
        hospitalId: requestedHospital,
      }) as Promise<Page>;
    try {
      await once(relay.listen(0, '127.0.0.1'), 'listening');
      const relayAddress = relay.address();
      if (!relayAddress || typeof relayAddress === 'string')
        throw new Error('Expected relay listener');
      const nurse = openSocket(relayAddress.port, nurseToken, true);
      const initialSnapshot = waitForSnapshot(nurse);
      nurse.connect();
      await initialSnapshot;
      const empty = await recover(nurse, null);
      expect(empty).toEqual({ cursor: '0', hasMore: false, messages: [] });
      const disconnected = new Promise<string>((resolve) => {
        nurse.once('disconnect', resolve);
      });
      upstreamPort = null;
      for (const link of links) link.destroy();
      expect(await disconnected).toBe('transport close');

      const dose = {
        prescriptionItemId,
        status: 'HELD',
        requestId: randomUUID(),
        notes: 'Synthetic held dose',
      };
      const hold = async () =>
        responseBody<{ id: number }>(
          await request(app.getHttpServer())
            .post(`/nursing/encounters/${encounterId}/administer-med`)
            .auth(nurseToken, { type: 'bearer' })
            .send(dose)
            .expect(201),
        );
      const medication = await hold();
      expect(await hold()).toMatchObject({ id: medication.id });
      const vital = responseBody<{ id: number }>(
        await request(app.getHttpServer())
          .post(`/vitals/encounter/${encounterId}`)
          .auth(nurseToken, { type: 'bearer' })
          .send({ pulse: 125 })
          .expect(201),
      );
      expect(
        await db.nursingNotification.count({ where: { hospitalId } }),
      ).toBe(2);

      expect(nurse.connected).toBe(false);
      const restoredSnapshot = waitForSnapshot(nurse);
      upstreamPort = peerAddress.port;
      await restoredSnapshot;
      const page = await recover(nurse, empty.cursor);
      expect(page.messages.map(({ event }) => event)).toEqual([
        'medication_update',
        'vitals_update',
        'patient_alert',
      ]);
      expect(page.messages[0].payload.administrationId).toBe(medication.id);
      expect(page.messages[1].payload.vitalSignId).toBe(vital.id);
      expect(page.messages[2].payload.vitalSignId).toBe(vital.id);
      const foreign = openSocket(relayAddress.port, otherNurseToken);
      const foreignSnapshot = waitForSnapshot(foreign);
      foreign.connect();
      await foreignSnapshot;
      expect(await recover(foreign, '0', hospitalId)).toEqual(empty);
      await delay(260);
      expect(await recover(nurse, page.cursor)).toEqual({
        cursor: page.cursor,
        hasMore: false,
        messages: [],
      });
      await db.encounter.update({
        where: { id: encounterId },
        data: { status: 'CLOSED' },
      });
      await delay(260);
      expect(await recover(nurse, '0')).toEqual({
        cursor: page.cursor,
        hasMore: false,
        messages: [],
      });
    } finally {
      for (const socket of sockets) socket.disconnect();
      for (const link of links) link.destroy();
      if (relay.listening) await once(relay.close(), 'close');
    }
  });

  it('rolls back vitals when their audit fails and replays the original reading only once', async () => {
    const payload = { pulse: 125, requestId: randomUUID() };
    const submit = (body: Record<string, unknown> = payload) =>
      request(app.getHttpServer())
        .post(`/vitals/encounter/${encounterId}`)
        .auth(nurseToken, { type: 'bearer' })
        .send(body);
    await db.$executeRaw`
      CREATE FUNCTION repair_vital_audit_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic vital audit failure'; END $$
    `;
    try {
      await db.$executeRaw`
        CREATE TRIGGER repair_vital_audit_failure BEFORE INSERT ON "AuditLog"
        FOR EACH ROW WHEN (NEW.action = 'VITALS_RECORDED')
        EXECUTE FUNCTION repair_vital_audit_failure()
      `;
      await submit().expect(500);
      expect(await db.vitalSign.count({ where: { encounterId } })).toBe(0);
      expect(
        await db.nursingNotification.count({ where: { encounterId } }),
      ).toBe(0);
    } finally {
      await db.$executeRaw`DROP TRIGGER IF EXISTS repair_vital_audit_failure ON "AuditLog"`;
      await db.$executeRaw`DROP FUNCTION IF EXISTS repair_vital_audit_failure()`;
    }

    const [saved, retry] = await Promise.all([
      submit().expect(201),
      submit().expect(201),
    ]);
    expect(retry.body).toEqual(saved.body);
    const { id } = responseBody<{ id: number }>(saved);
    expect(JSON.stringify(saved.body)).not.toMatch(
      /requestKey|requestFingerprint/,
    );
    await submit({ ...payload, pulse: 126 }).expect(409);
    await submit({ ...payload, requestId: 'invalid' }).expect(400);
    await submit({ ...payload, pulse: false }).expect(400);
    expect(await db.vitalSign.count({ where: { encounterId } })).toBe(1);
    expect(await db.nursingNotification.count({ where: { encounterId } })).toBe(
      1,
    );
    expect(
      await db.auditLog.count({
        where: {
          hospitalId,
          action: 'VITALS_RECORDED',
          entityId: id,
          hash: { not: null },
        },
      }),
    ).toBe(1);
  });

  it('rolls back clinical writes when the notification journal cannot be written', async () => {
    await db.$executeRaw`
      CREATE FUNCTION repair_nursing_notification_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic nursing journal failure'; END $$
    `;
    try {
      await db.$executeRaw`
        CREATE TRIGGER repair_nursing_notification_failure BEFORE INSERT ON "NursingNotification"
        FOR EACH ROW EXECUTE FUNCTION repair_nursing_notification_failure()
      `;
      await request(app.getHttpServer())
        .post(`/vitals/encounter/${encounterId}`)
        .auth(nurseToken, { type: 'bearer' })
        .send({ pulse: 125 })
        .expect(500);
      await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/administer-med`)
        .auth(nurseToken, { type: 'bearer' })
        .send({
          prescriptionItemId,
          status: 'HELD',
          requestId: randomUUID(),
          notes: 'Synthetic held dose',
        })
        .expect(500);
      expect(await db.vitalSign.count({ where: { encounterId } })).toBe(0);
      expect(
        await db.medicationAdministration.count({ where: { encounterId } }),
      ).toBe(0);
      expect(
        await db.nursingNotification.count({ where: { encounterId } }),
      ).toBe(0);
    } finally {
      await db.$executeRaw`DROP TRIGGER IF EXISTS repair_nursing_notification_failure ON "NursingNotification"`;
      await db.$executeRaw`DROP FUNCTION IF EXISTS repair_nursing_notification_failure()`;
    }
  });

  it.each([
    ['administer-med', 'EMAR_MEDICATION_ADMINISTERED'],
    ['administer-barcode', 'CLMA_MEDICATION_ADMINISTERED'],
  ] as const)(
    'rolls back %s on audit failure and reconciles a lost HTTP reply across servers',
    async (route, action) => {
      const fixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      peer = fixture.createNestApplication<INestApplication<Server>>();
      peer.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await peer.listen(0, '127.0.0.1');

      const barcode = route === 'administer-barcode';
      const varianceReason = 'Synthetic emergency override reason';
      const payload = {
        prescriptionItemId,
        requestId: randomUUID(),
        ...(barcode
          ? {
              patientBarcode: 'SYNTHETIC-UNREADABLE-WRISTBAND',
              drugBarcode,
              isEmergencyOverride: true,
              varianceReason,
            }
          : { status: 'HELD', notes: 'Synthetic withheld-dose note' }),
      };
      const send = (server: Server, userAgent: string) =>
        request(server)
          .post(`/nursing/encounters/${encounterId}/${route}`)
          .auth(nurseToken, { type: 'bearer' })
          .set('User-Agent', userAgent)
          .send(payload)
          .timeout({ deadline: 10000 });
      const counts = async () => [
        await db.medicationAdministration.count({ where: { hospitalId } }),
        await db.nursingNotification.count({
          where: { hospitalId, kind: 'medication' },
        }),
        await db.auditLog.count({
          where: { hospitalId, entity: 'MedicationAdministration' },
        }),
      ];

      await db.$executeRaw`
      CREATE FUNCTION repair_medication_audit_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic medication audit failure'; END $$
    `;
      try {
        await db.$executeRaw`
        CREATE TRIGGER repair_medication_audit_failure BEFORE INSERT ON "AuditLog"
        FOR EACH ROW WHEN (NEW.action IN ('EMAR_MEDICATION_ADMINISTERED', 'CLMA_MEDICATION_ADMINISTERED'))
        EXECUTE FUNCTION repair_medication_audit_failure()
      `;
        await send(app.getHttpServer(), 'saraya-medication-fault').expect(500);
        expect(await counts()).toEqual([0, 0, 0]);
      } finally {
        await db.$executeRaw`DROP TRIGGER IF EXISTS repair_medication_audit_failure ON "AuditLog"`;
        await db.$executeRaw`DROP FUNCTION IF EXISTS repair_medication_audit_failure()`;
      }

      const listener = app.getHttpServer().address();
      if (!listener || typeof listener === 'string')
        throw new Error('Expected a local listener');
      let upstreamStatus: number | undefined;
      const relay = createHttpServer((incoming, outgoing) => {
        const forwarded = forwardHttp(
          {
            host: '127.0.0.1',
            port: listener.port,
            path: incoming.url,
            method: incoming.method,
            headers: incoming.headers,
          },
          (response) => {
            upstreamStatus = response.statusCode;
            response.resume();
            outgoing.destroy();
          },
        );
        forwarded.on('error', (error) => outgoing.destroy(error));
        incoming.pipe(forwarded);
      });
      const genericAudits = [app, peer].map((node) =>
        jest
          .spyOn(node.get(AuditService), 'logCritical')
          .mockRejectedValue(new Error('synthetic post-handler audit failure')),
      );
      const events = [app, peer].map((node) =>
        jest.spyOn(node.get(EventEmitter2), 'emit'),
      );
      try {
        await once(relay.listen(0, '127.0.0.1'), 'listening');
        await expect(
          send(relay, 'saraya-medication-original'),
        ).rejects.toThrow();
        expect(upstreamStatus).toBe(201);
        expect(await counts()).toEqual([1, 1, 1]);
        const committed = await db.medicationAdministration.findFirstOrThrow({
          where: { hospitalId },
        });
        const retry = await send(
          peer.getHttpServer(),
          'saraya-medication-retry',
        ).expect(201);
        expect(responseBody<TestResponse>(retry).id).toBe(committed.id);
        expect(await counts()).toEqual([1, 1, 1]);
        const audit = await db.auditLog.findFirstOrThrow({
          where: { hospitalId, entity: 'MedicationAdministration' },
        });
        expect(audit).toMatchObject({
          action,
          userId: nurseUserId,
          entityId: committed.id,
          clientName: 'saraya-medication-original',
          details: {
            _chainVersion: 2,
            payload: {
              encounterId,
              prescriptionItemId,
              status: barcode ? 'GIVEN' : 'HELD',
              isEmergencyOverride: barcode,
              varianceReason: barcode ? varianceReason : null,
              notes: barcode ? null : 'Synthetic withheld-dose note',
            },
          },
        });
        expect(audit.ipAddress).toBeTruthy();
        expect(audit.hash).toMatch(/^[0-9a-f]{64}$/);
        for (const spy of genericAudits) expect(spy).not.toHaveBeenCalled();
        expect(
          events.map(
            (spy) =>
              spy.mock.calls.filter(
                ([event]) => event === 'nursing.medication_administered',
              ).length,
          ),
        ).toEqual([1, 0]);
      } finally {
        for (const spy of [...genericAudits, ...events]) spy.mockRestore();
        if (relay.listening) await once(relay.close(), 'close');
      }
    },
  );

  it('links one final administration to each schedule slot across servers and preserves held history', async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    peer = fixture.createNestApplication<INestApplication<Server>>();
    peer.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await peer.listen(0, '127.0.0.1');
    const schedule = async () =>
      responseBody<
        {
          scheduledSlot: string;
          scheduledTime: string;
          status: string;
        }[]
      >(
        await request(app.getHttpServer())
          .get(`/nursing/encounters/${encounterId}/mar-schedule`)
          .auth(nurseToken, { type: 'bearer' })
          .expect(200),
      );
    const slots = await schedule();
    expect(slots.map((slot) => slot.scheduledSlot.slice(11))).toEqual([
      '08:00',
      '20:00',
    ]);
    const [morning, evening] = slots;
    const submit = (
      node: INestApplication<Server>,
      body: object,
      barcode = false,
      token = nurseToken,
    ) =>
      request(node.getHttpServer())
        .post(
          `/nursing/encounters/${encounterId}/${barcode ? 'administer-barcode' : 'administer-med'}`,
        )
        .auth(token, { type: 'bearer' })
        .send({ prescriptionItemId, ...body });
    await submit(app, {
      scheduledSlot: morning.scheduledSlot.replace('08:00', '07:35'),
      status: 'GIVEN',
      requestId: randomUUID(),
    }).expect(400);
    await submit(
      app,
      {
        scheduledSlot: morning.scheduledSlot,
        status: 'GIVEN',
        requestId: randomUUID(),
      },
      false,
      otherNurseToken,
    ).expect(404);
    const hold = {
      scheduledSlot: morning.scheduledSlot,
      status: 'HELD',
      notes: 'Synthetic hold',
      requestId: randomUUID(),
    };
    await submit(app, hold).expect(201);
    expect((await schedule())[0].status).toBe('HELD');
    await submit(peer, { ...hold, requestId: randomUUID() }).expect(409);
    const manual = {
      scheduledSlot: morning.scheduledSlot,
      status: 'GIVEN',
      requestId: randomUUID(),
    };
    const barcode = {
      scheduledSlot: morning.scheduledSlot,
      patientBarcode: patientMrn,
      drugBarcode,
      requestId: randomUUID(),
    };
    const results = await Promise.all([
      submit(app, manual),
      submit(peer, barcode, true),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    const wonManual = results[0].status === 201;
    const retry = await submit(
      wonManual ? peer : app,
      wonManual ? manual : barcode,
      !wonManual,
    ).expect(201);
    expect(responseBody<TestResponse>(retry).id).toBe(
      responseBody<TestResponse>(results[wonManual ? 0 : 1]).id,
    );
    await submit(app, {
      ...manual,
      status: 'REFUSED',
      notes: 'Synthetic refusal',
      requestId: randomUUID(),
    }).expect(409);
    await submit(peer, {
      ...manual,
      scheduledSlot: evening.scheduledSlot,
      requestId: randomUUID(),
    }).expect(201);
    const after = await schedule();
    expect(after.map((slot) => slot.status)).toEqual(['GIVEN', 'GIVEN']);
    expect(after.map((slot) => slot.scheduledTime)).toEqual(
      slots.map((slot) => slot.scheduledTime),
    );
    await expect(
      db.medicationAdministration.create({
        data: {
          hospitalId,
          encounterId,
          prescriptionItemId,
          performerId: nurseUserId,
          status: 'REFUSED',
          scheduledSlot: morning.scheduledSlot,
          scheduledFor: new Date(morning.scheduledTime),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(
      await db.medicationAdministration.count({ where: { encounterId } }),
    ).toBe(3);
    expect(await db.nursingNotification.count({ where: { encounterId } })).toBe(
      3,
    );
    await db.prescription.update({
      where: { id: prescriptionId },
      data: { status: 'CANCELLED' },
    });
    await submit(app, { ...manual, requestId: randomUUID() }).expect(400);
  });

  it('serializes exact retries, conflicting UUIDs and repeat doses across servers', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    peer = module.createNestApplication<INestApplication<Server>>();
    peer.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await peer.listen(0, '127.0.0.1');
    const source = await db.prescription.findUniqueOrThrow({
      where: { id: prescriptionId },
      select: { doctorId: true, items: { select: { productId: true } } },
    });
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: 'SYN-CLMA-LOCK-PEER',
        fullName: 'Synthetic Second Patient',
        dateOfBirth: new Date('1985-04-12'),
      },
    });
    const otherEncounter = await db.encounter.create({
      data: {
        hospitalId,
        patientId: patient.id,
        doctorId: source.doctorId,
        type: 'IPD',
        status: 'OPEN',
      },
    });
    const otherPrescription = await db.prescription.create({
      data: {
        hospitalId,
        patientId: patient.id,
        doctorId: source.doctorId,
        encounterId: otherEncounter.id,
        status: 'ACTIVE',
        pharmacistVerificationStatus: 'VERIFIED',
        items: {
          create: {
            productId: source.items[0].productId,
            dose: '1g',
            route: 'IV',
            frequency: 'BID',
            durationDays: 1,
            quantity: 1,
          },
        },
      },
      include: { items: true },
    });
    const send = (
      node: INestApplication<Server>,
      encounter: number,
      data: object,
    ) =>
      request(node.getHttpServer())
        .post(`/nursing/encounters/${encounter}/administer-med`)
        .auth(nurseToken, { type: 'bearer' })
        .send(data);
    const held = {
      prescriptionItemId,
      status: 'HELD',
      notes: 'Synthetic held dose',
      requestId: randomUUID(),
    };
    const exact = await Promise.all([
      send(app, encounterId, held).expect(201),
      send(peer, encounterId, held).expect(201),
    ]);
    expect(responseBody<TestResponse>(exact[0]).id).toBe(
      responseBody<TestResponse>(exact[1]).id,
    );
    const conflictKey = randomUUID();
    const conflicts = await Promise.all([
      send(app, encounterId, { ...held, requestId: conflictKey }),
      send(peer, otherEncounter.id, {
        ...held,
        prescriptionItemId: otherPrescription.items[0].id,
        requestId: conflictKey,
      }),
    ]);
    expect(conflicts.map(({ status }) => status).sort()).toEqual([201, 409]);
    const given = await Promise.all([
      send(app, encounterId, {
        prescriptionItemId,
        status: 'GIVEN',
        requestId: randomUUID(),
      }),
      send(peer, encounterId, {
        prescriptionItemId,
        status: 'GIVEN',
        requestId: randomUUID(),
      }),
    ]);
    expect(given.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      await db.medicationAdministration.count({ where: { hospitalId } }),
    ).toBe(3);
    expect(
      await db.nursingNotification.count({
        where: { hospitalId, kind: 'medication' },
      }),
    ).toBe(3);

    let signalReady!: () => void;
    let releaseLock!: () => void;
    const ready = new Promise<void>((resolve) => {
      signalReady = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockedContext = db.$transaction(
      async (tx) => {
        await medicationContext(
          tx,
          hospitalId,
          encounterId,
          prescriptionItemId,
        );
        signalReady();
        await release;
      },
      { timeout: 12000 },
    );
    try {
      await Promise.race([ready, lockedContext]);
      await request(peer.getHttpServer())
        .post(`/vitals/encounter/${encounterId}`)
        .auth(nurseToken, { type: 'bearer' })
        .send({ pulse: 80 })
        .timeout({ deadline: 5000 })
        .expect(201);
    } finally {
      releaseLock();
      await lockedContext;
    }
  });

  describe('1. Patient-and-drug barcode verification (UI14 / CAP03 / OPS02)', () => {
    it('1.1 should verify patient and drug identity without claiming all five rights', async () => {
      const res = await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/verify-five-rights`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: patientMrn,
          drugBarcode: drugBarcode,
        })
        .expect(200);

      expect(responseBody<TestResponse>(res).isPatientMatch).toBe(true);
      expect(responseBody<TestResponse>(res).isDrugMatch).toBe(true);
      expect(responseBody<TestResponse>(res).isBarcodeMatch).toBe(true);
      expect(responseBody<TestResponse>(res).isVerified5Rights).toBe(false);
      expect(responseBody<TestResponse>(res).expectedPatientBarcode).toBe(
        patientMrn,
      );
      expect(responseBody<TestResponse>(res).expectedDrugBarcode).toBe(
        drugBarcode,
      );
      expect(responseBody<TestResponse>(res).drugName).toContain(
        'سيفوترياكسون',
      );
      expect(responseBody<TestResponse>(res).dose).toBe('1g');
      expect(responseBody<TestResponse>(res).route).toBe('IV');
    });

    it('1.2 should return mismatch verdict when scanned barcodes belong to wrong patient or wrong drug', async () => {
      const res = await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/verify-five-rights`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: 'WRONG-PATIENT-MRN',
          drugBarcode: 'WRONG-DRUG-BARCODE',
        })
        .expect(200);

      expect(responseBody<TestResponse>(res).isPatientMatch).toBe(false);
      expect(responseBody<TestResponse>(res).isDrugMatch).toBe(false);
      expect(responseBody<TestResponse>(res).isVerified5Rights).toBe(false);
    });

    it('1.3 should reject administration with 400 when 5-rights fail and emergency override is not enabled', async () => {
      const res = await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/administer-barcode`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: 'WRONG-MRN',
          drugBarcode: 'WRONG-BARCODE',
          isEmergencyOverride: false,
        })
        .expect(400);

      expect(responseBody<TestResponse>(res).message).toContain(
        'الباركود غير مطابق',
      );
    });

    it('1.4 should reject administration with 400 when emergency override is requested without a variance reason', async () => {
      const res = await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/administer-barcode`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: 'WRONG-MRN',
          drugBarcode: 'WRONG-BARCODE',
          isEmergencyOverride: true,
          varianceReason: '   ', // Empty or whitespace
        })
        .expect(400);

      expect(responseBody<TestResponse>(res).message).toContain('سبب تجاوز');
    });

    it('1.5 should accept emergency override when valid variance reason is provided and audit trail is recorded', async () => {
      const varianceReason =
        'إسوارة المريض تالفة أثناء الإنعاش القلبي الرئوي في الطوارئ';

      const res = await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/administer-barcode`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: 'EMERGENCY-UNREADABLE-WRISTBAND',
          drugBarcode: drugBarcode,
          isEmergencyOverride: true,
          varianceReason,
          notes: 'إعطاء استثنائي معتمد سريرياً',
        })
        .expect(201);

      expect(responseBody<TestResponse>(res).id).toBeDefined();
      expect(responseBody<TestResponse>(res).status).toBe(
        AdministrationStatus.GIVEN,
      );
      expect(responseBody<TestResponse>(res).isEmergencyOverride).toBe(true);
      expect(responseBody<TestResponse>(res).isVerified5Rights).toBe(false);
      expect(responseBody<TestResponse>(res).varianceReason).toBe(
        varianceReason,
      );

      // Verify chained audit log in database
      const audit = await db.auditLog.findFirst({
        where: {
          hospitalId,
          entity: 'MedicationAdministration',
          entityId: responseBody<TestResponse>(res).id,
          action: 'CLMA_MEDICATION_ADMINISTERED',
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.details).toMatchObject({
        _chainVersion: 2,
        payload: {
          isEmergencyOverride: true,
          varianceReason,
        },
      });
    });

    it('1.6 should administer with matching barcodes and prevent rapid duplicate execution', async () => {
      // 1. Positive 5-rights administration
      const adminRes = await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/administer-barcode`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: patientMrn,
          drugBarcode: drugBarcode,
        })
        .expect(201);

      expect(responseBody<TestResponse>(adminRes).isBarcodeMatch).toBe(true);
      expect(responseBody<TestResponse>(adminRes).isEmergencyOverride).toBe(
        false,
      );

      // 2. Immediate double-tap within 60s must be prevented
      const doubleTapRes = await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/administer-barcode`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: patientMrn,
          drugBarcode: drugBarcode,
        })
        .expect(409);

      expect(responseBody<TestResponse>(doubleTapRes).message).toContain(
        'إعطاء قريب مسجل',
      );
    });
  });

  describe('2. Clinical Safety Invariants & Multi-Tenant Boundaries (SEC03 / CLN01)', () => {
    it('2.1 should reject cross-tenant administration from another hospital with 404', async () => {
      await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/verify-five-rights`)
        .set('Authorization', `Bearer ${otherNurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: patientMrn,
          drugBarcode: drugBarcode,
        })
        .expect(404);

      await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/administer-barcode`)
        .set('Authorization', `Bearer ${otherNurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: patientMrn,
          drugBarcode: drugBarcode,
        })
        .expect(404);
    });

    it('2.2 should strictly reject administration when prescription is cancelled', async () => {
      await db.prescription.update({
        where: { id: prescriptionId },
        data: { status: PrescriptionStatus.CANCELLED },
      });

      const res = await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/administer-barcode`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: patientMrn,
          drugBarcode: drugBarcode,
        })
        .expect(400);

      expect(responseBody<TestResponse>(res).message).toContain('غير متاح');
    });

    it('2.3 should strictly reject administration when encounter is closed', async () => {
      await db.encounter.update({
        where: { id: encounterId },
        data: { status: EncounterStatus.CLOSED },
      });

      const res = await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/administer-barcode`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({
          requestId: randomUUID(),
          prescriptionItemId,
          patientBarcode: patientMrn,
          drugBarcode: drugBarcode,
        })
        .expect(400);

      expect(responseBody<TestResponse>(res).message).toContain('غير متاح');
    });
  });

  describe('3. Real-Time WebSocket Multi-Tenant Isolation & Active Session Invalidation (SEC04 / OPS03)', () => {
    it('3.1 should authenticate socket, join tenant-isolated rooms, and reject invalid tokens or inactive users', async () => {
      // 1. Valid socket mock
      const joinedRooms: string[] = [];
      let isDisconnected = false;
      const mockClientA: any = {
        id: 'socket-client-a-101',
        handshake: {
          auth: { token: nurseToken },
          headers: {},
        },
        join: (room: string) => joinedRooms.push(room),
        disconnect: () => {
          isDisconnected = true;
        },
        data: {},
      };

      await gateway.handleConnection(mockClientA);

      expect(isDisconnected).toBe(false);
      expect(joinedRooms).toContain(`HOSPITAL_${hospitalId}:ROLE_NURSE`);
      expect(joinedRooms).toContain(`STAFF_USER:${nurseUserId}`);
      expect(joinedRooms).toContain(`HOSPITAL_${hospitalId}:ALL`);
      // Crucial: Must NEVER join Hospital B rooms
      expect(
        joinedRooms.some((r) => r.startsWith(`HOSPITAL_${otherHospitalId}:`)),
      ).toBe(false);

      // 2. Invalid / forged token rejection
      let invalidDisconnected = false;
      const mockInvalidClient: any = {
        id: 'socket-client-bad',
        handshake: {
          auth: { token: 'invalid.forged.jwt.token' },
          headers: {},
        },
        join: () => {},
        disconnect: () => {
          invalidDisconnected = true;
        },
      };
      await gateway.handleConnection(mockInvalidClient);
      expect(invalidDisconnected).toBe(true);

      // 3. Foreign issuer rejection (e.g. patient token trying to access staff socket)
      const patientToken = await jwt.signAsync(
        { sub: 9999, hospitalId, roles: ['PATIENT'] },
        {
          secret: process.env.JWT_SECRET || 'PRODUCTION_SECRET_KEY_CHANGE_ME',
          issuer: 'saraya-patient',
        },
      );
      let foreignIssuerDisconnected = false;
      const mockPatientClient: any = {
        id: 'socket-client-patient',
        handshake: {
          auth: { token: patientToken },
          headers: {},
        },
        join: () => {},
        disconnect: () => {
          foreignIssuerDisconnected = true;
        },
      };
      await gateway.handleConnection(mockPatientClient);
      expect(foreignIssuerDisconnected).toBe(true);
    });

    it('3.2 should immediately disconnect active sockets when user is deactivated in database', async () => {
      const rootRoom = jest.spyOn(gateway.server, 'in');
      const nursingRoom = jest.spyOn(gateway.server.of('/nursing'), 'in');
      try {
        await usersService.update(hospitalId, nurseUserId, {
          fullName: 'طارق تمريض معطل',
          isActive: false,
        });
        expect(rootRoom).toHaveBeenCalledWith(`STAFF_USER:${nurseUserId}`);
        expect(nursingRoom).toHaveBeenCalledWith(`STAFF_USER:${nurseUserId}`);
      } finally {
        rootRoom.mockRestore();
        nursingRoom.mockRestore();
      }

      // Verify subsequent connection attempt by the deactivated user is rejected
      let connectionRejected = false;
      const mockClientDeactivated: any = {
        id: 'socket-deactivated-retry',
        handshake: {
          auth: { token: nurseToken },
          headers: {},
        },
        join: () => {},
        disconnect: () => {
          connectionRejected = true;
        },
      };
      await gateway.handleConnection(mockClientDeactivated);
      expect(connectionRejected).toBe(true);
    });
  });
});
