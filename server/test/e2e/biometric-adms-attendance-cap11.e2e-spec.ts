// server/test/e2e/biometric-adms-attendance-cap11.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import express from 'express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Batch 24 Biometric Devices, ZKTeco ADMS Push, Movements, Absence Classification & Holidays (Migration #78)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let auth: AuthHelper;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    const expressApp = app.getHttpAdapter().getInstance() as express.Express;
    expressApp.use(
      '/iclock',
      express.text({ type: 'text/plain', limit: '2mb' }),
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    db = app.get(PrismaService);
    auth = new AuthHelper(db, app.get(JwtService));
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('enforces private-LAN device registry, ZKTeco ADMS handshake & idempotent ATTLOG push with secret verification, immutable BiometricPunchLog, 4-eyes temp-leave movements, absence classification, holidays, and tenant isolation', async () => {
    const hrManager = await auth.createTestUser('bio-hr-mgr', 'synthetic', {
      permissions: ['attendance:manage', 'hr:view', 'hr:manage'],
    });
    const hospitalId = hrManager.user.hospitalId;

    const nurse = await auth.createTestUser('bio-nurse', 'synthetic', {
      hospitalId,
      permissions: ['attendance:manage', 'hr:view', 'hr:manage'],
    });

    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_BIO_OTHER_${Date.now()}`,
        name: 'Other Biometric Hospital',
        isActive: true,
      },
    });
    const foreignUser = await auth.createTestUser('bio-foreign', 'synthetic', {
      hospitalId: otherHospital.id,
      permissions: ['attendance:manage', 'hr:view', 'hr:manage'],
    });

    // 1. Public IP rejected on device registration (400)
    await request(app.getHttpServer())
      .post('/attendance/biometric/devices')
      .auth(hrManager.accessToken, { type: 'bearer' })
      .send({
        name: 'Rogue Public Device',
        serialNumber: 'ZK-PUB-001',
        ipAddress: '8.8.8.8',
      })
      .expect(400);

    // 2. Register legitimate ZKTeco ADMS device on loopback (127.0.0.1) with per-device secret
    const devRes = await request(app.getHttpServer())
      .post('/attendance/biometric/devices')
      .auth(hrManager.accessToken, { type: 'bearer' })
      .send({
        name: 'Main ER Entrance ZKTeco',
        brand: 'ZKTECO',
        model: 'SpeedFace-V5L',
        serialNumber: 'ZK-ER-2026-01',
        ipAddress: '127.0.0.1',
        connectionMode: 'ADMS',
        location: 'Emergency Gate',
        deviceSecret: 'er-gate-secret-99',
      })
      .expect(201);
    const deviceId = (devRes.body as { id: number }).id;

    // Assign badge biometricId = "1042" to nurse
    await request(app.getHttpServer())
      .patch(`/attendance/biometric/employees/${nurse.user.id}/biometric-id`)
      .auth(hrManager.accessToken, { type: 'bearer' })
      .send({ biometricId: '1042' })
      .expect(200);

    // 3. ZKTeco ADMS Handshake: wrong secret rejected (403), valid secret accepted (200)
    await request(app.getHttpServer())
      .get('/iclock/cdata?SN=ZK-ER-2026-01&token=wrong-secret')
      .expect(403);

    const handshakeRes = await request(app.getHttpServer())
      .get('/iclock/cdata?SN=ZK-ER-2026-01&token=er-gate-secret-99')
      .expect(200);
    expect(handshakeRes.text).toContain('GET OPTION FROM: ZK-ER-2026-01');

    // 4. ZKTeco ADMS ATTLOG Push: 2 valid punches for nurse (10:00 -> 18:00 local = 08:00 -> 16:00 UTC = 8.000h) + 1 unmapped badge "9999"
    const attlogPayload = [
      '1042\t2026-11-24 10:00:00\t0\t1',
      '1042\t2026-11-24 18:00:00\t1\t15',
      '9999\t2026-11-24 10:05:00\t0\t1',
    ].join('\n');

    const pushRes = await request(app.getHttpServer())
      .post(
        '/iclock/cdata?SN=ZK-ER-2026-01&table=ATTLOG&Stamp=12345&token=er-gate-secret-99',
      )
      .set('Content-Type', 'text/plain')
      .send(attlogPayload)
      .expect(200);
    expect(pushRes.text).toBe('OK: 3');

    // Replay exact same ATTLOG -> idempotent deduplication (still 3 rows in BiometricPunchLog, zero duplicates!)
    await request(app.getHttpServer())
      .post(
        '/iclock/cdata?SN=ZK-ER-2026-01&table=ATTLOG&Stamp=12345&token=er-gate-secret-99',
      )
      .set('Content-Type', 'text/plain')
      .send(attlogPayload)
      .expect(200);

    const logs = await db.biometricPunchLog.findMany({
      where: { hospitalId },
      orderBy: { id: 'asc' },
    });
    expect(logs).toHaveLength(3);
    expect(logs.filter((l) => l.processed)).toHaveLength(2);
    expect(logs.filter((l) => l.userId === null)).toHaveLength(1);

    // BiometricPunchLog PostgreSQL immutability trigger prevents deleting or altering raw punches
    await expect(
      db.$executeRaw`DELETE FROM "BiometricPunchLog" WHERE id = ${logs[0].id}`,
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.$executeRaw`UPDATE "BiometricPunchLog" SET "biometricId" = 'HACKED' WHERE id = ${logs[0].id}`,
    ).rejects.toThrow(/immutable/i);

    // AttendanceRecord created with workedHours = 8.000
    const attRec = await db.attendanceRecord.findFirstOrThrow({
      where: { userId: nurse.user.id },
    });
    expect(attRec.workedHours.toFixed(3)).toBe('8.000');

    // 5. Temporary Leave Movement (1h temp leave: 12:00 -> 13:00 UTC) + 4-eyes approval -> net workedHours = 7.000
    const leaveMov = await request(app.getHttpServer())
      .post('/attendance/biometric/movements')
      .auth(hrManager.accessToken, { type: 'bearer' })
      .send({
        attendanceRecordId: attRec.id,
        movementType: 'TEMP_LEAVE',
        movementTime: '2026-11-24T12:00:00.000Z',
        reason: 'Personal bank errand',
      })
      .expect(201);
    const leaveMovId = (leaveMov.body as { id: number }).id;

    await request(app.getHttpServer())
      .post('/attendance/biometric/movements')
      .auth(hrManager.accessToken, { type: 'bearer' })
      .send({
        attendanceRecordId: attRec.id,
        movementType: 'RETURN',
        movementTime: '2026-11-24T13:00:00.000Z',
      })
      .expect(201);

    // 4-eyes: nurse cannot self-approve own movement (403)
    await request(app.getHttpServer())
      .post(`/attendance/biometric/movements/${leaveMovId}/decision`)
      .auth(nurse.accessToken, { type: 'bearer' })
      .send({ decision: 'APPROVED' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/attendance/biometric/movements/${leaveMovId}/decision`)
      .auth(hrManager.accessToken, { type: 'bearer' })
      .send({ decision: 'APPROVED' })
      .expect(201);

    const updatedAtt = await db.attendanceRecord.findUniqueOrThrow({
      where: { id: attRec.id },
    });
    expect(updatedAtt.tempLeaveMinutes).toBe(60);
    expect(updatedAtt.workedHours.toFixed(3)).toBe('7.000');

    // 6. Absence Classification (AUTHORIZED vs UNAUTHORIZED) & Official Holiday Calendar
    const absRes = await request(app.getHttpServer())
      .post('/attendance/biometric/absences')
      .auth(hrManager.accessToken, { type: 'bearer' })
      .send({
        userId: nurse.user.id,
        date: '2026-11-25',
        classification: 'AUTHORIZED',
        notes: 'Approved hospital committee duty',
      })
      .expect(201);
    expect(
      (absRes.body as { absenceAuthorization: string }).absenceAuthorization,
    ).toBe('AUTHORIZED');

    const holRes = await request(app.getHttpServer())
      .post('/attendance/biometric/holidays')
      .auth(hrManager.accessToken, { type: 'bearer' })
      .send({
        name: 'عيد الاستقلال',
        nameEn: 'Independence Day',
        date: '2026-12-24',
        isAnnual: true,
      })
      .expect(201);
    expect((holRes.body as { isAnnual: boolean }).isAnnual).toBe(true);

    // 7. Cross-Tenant Isolation: foreign hospital gets 404 on Hospital A device
    await request(app.getHttpServer())
      .patch(`/attendance/biometric/devices/${deviceId}`)
      .auth(foreignUser.accessToken, { type: 'bearer' })
      .send({ isActive: false })
      .expect(404);
  });
});
