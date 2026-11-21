import { responseBody } from '../http-response';
type TestResponse = {
  id: number;
  financialPreview: { cataloguePrice: string; teamCommissions: string };
};
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CommissionService } from '../../src/commission/commission.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Surgery lifecycle, scheduling, team tenant isolation, atomic base procedure billing & Money surgeon commission (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let token: string;
  let otherToken: string;
  let hospitalId: number;
  let otherHospitalId: number;
  let surgeonId: number;
  let otherUserId: number;
  let encounterId: number;
  let otherEncounterId: number;
  let theatreId: number;
  let otherTheatreId: number;
  let serviceItemId: number;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    db = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    const auth = new AuthHelper(db, app.get(JwtService));
    const actor = await auth.createTestUser('surg-life-actor', 'synthetic', {
      permissions: ['surgery:view', 'surgery:manage'],
    });
    hospitalId = actor.user.hospitalId;
    surgeonId = actor.user.id;
    token = actor.accessToken;

    const otherHospital = await db.hospital.create({
      data: {
        code: 'OTHER_SURG_HOSP',
        name: 'Other Surgery Hospital',
        isActive: true,
      },
    });
    const otherActor = await auth.createTestUser(
      'surg-life-other-actor',
      'synthetic',
      {
        hospitalId: otherHospital.id,
        permissions: ['surgery:view', 'surgery:manage'],
      },
    );
    otherHospitalId = otherActor.user.hospitalId;
    otherUserId = otherActor.user.id;
    otherToken = otherActor.accessToken;

    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: 'SURG-LIFE-PT-1',
        fullName: 'Surgery Patient One',
        isActive: true,
      },
    });
    encounterId = (
      await db.encounter.create({
        data: {
          hospitalId,
          patientId: patient.id,
          type: 'IPD',
          status: 'OPEN',
        },
      })
    ).id;

    const otherPatient = await db.patient.create({
      data: {
        hospitalId: otherHospitalId,
        mrn: 'SURG-LIFE-PT-2',
        fullName: 'Other Hospital Patient',
        isActive: true,
      },
    });
    otherEncounterId = (
      await db.encounter.create({
        data: {
          hospitalId: otherHospitalId,
          patientId: otherPatient.id,
          type: 'IPD',
          status: 'OPEN',
        },
      })
    ).id;

    theatreId = (
      await db.operatingTheatre.create({
        data: {
          hospitalId,
          name: 'Main Operating Theatre 1',
          isActive: true,
        },
      })
    ).id;

    otherTheatreId = (
      await db.operatingTheatre.create({
        data: {
          hospitalId: otherHospitalId,
          name: 'Foreign Theatre',
          isActive: true,
        },
      })
    ).id;

    serviceItemId = (
      await db.serviceItem.create({
        data: {
          hospitalId,
          code: 'SURG-PROC-01',
          name: 'Laparoscopic Cholecystectomy',
          type: 'SURGERY',
          defaultPrice: '333.330',
          isActive: true,
          isDeleted: false,
        },
      })
    ).id;
  });

  it('enforces tenant isolation on scheduling, team management, and clinical logs, and prevents concurrent theatre double-booking', async () => {
    const start = new Date(Date.now() + 3600_000).toISOString();
    const end = new Date(Date.now() + 7200_000).toISOString();

    const foreignEncounterRes = await request(app.getHttpServer())
      .post('/surgery/schedule')
      .set('Authorization', `Bearer ${token}`)
      .send({
        encounterId: otherEncounterId,
        theatreId,
        serviceItemId,
        scheduledStart: start,
        scheduledEnd: end,
      });
    expect(foreignEncounterRes.status).toBe(400);

    const foreignTheatreRes = await request(app.getHttpServer())
      .post('/surgery/schedule')
      .set('Authorization', `Bearer ${token}`)
      .send({
        encounterId,
        theatreId: otherTheatreId,
        serviceItemId,
        scheduledStart: start,
        scheduledEnd: end,
      });
    expect(foreignTheatreRes.status).toBe(400);

    const foreignTeamMemberSchedule = await request(app.getHttpServer())
      .post('/surgery/schedule')
      .set('Authorization', `Bearer ${token}`)
      .send({
        encounterId,
        theatreId,
        serviceItemId,
        scheduledStart: start,
        scheduledEnd: end,
        teamMembers: [{ userId: otherUserId, role: 'SURGEON' }],
      });
    expect(foreignTeamMemberSchedule.status).toBe(400);
    expect(await db.surgeryCase.count({ where: { hospitalId } })).toBe(0);

    // Concurrent booking of the same theatre in overlapping slot
    const [bookA, bookB] = await Promise.all([
      request(app.getHttpServer())
        .post('/surgery/schedule')
        .set('Authorization', `Bearer ${token}`)
        .send({
          encounterId,
          theatreId,
          serviceItemId,
          scheduledStart: start,
          scheduledEnd: end,
          teamMembers: [{ userId: surgeonId, role: 'SURGEON' }],
        }),
      request(app.getHttpServer())
        .post('/surgery/schedule')
        .set('Authorization', `Bearer ${token}`)
        .send({
          encounterId,
          theatreId,
          serviceItemId,
          scheduledStart: start,
          scheduledEnd: end,
          teamMembers: [{ userId: surgeonId, role: 'SURGEON' }],
        }),
    ]);
    expect([bookA.status, bookB.status].sort()).toEqual([201, 400]);
    expect(await db.surgeryCase.count({ where: { hospitalId } })).toBe(1);

    const createdCase =
      bookA.status === 201
        ? responseBody<TestResponse>(bookA)
        : responseBody<TestResponse>(bookB);
    const caseId = createdCase.id;

    // Cross-tenant team add/delete and clinical logs must fail with 404/400
    const foreignAddTeam = await request(app.getHttpServer())
      .post(`/surgery/cases/${caseId}/team`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ userId: otherUserId, role: 'ASSISTANT_SURGEON' });
    expect(foreignAddTeam.status).toBe(404);

    const crossStaffAddTeam = await request(app.getHttpServer())
      .post(`/surgery/cases/${caseId}/team`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: otherUserId, role: 'ASSISTANT_SURGEON' });
    expect(crossStaffAddTeam.status).toBe(400);

    const dupRoleAddTeam = await request(app.getHttpServer())
      .post(`/surgery/cases/${caseId}/team`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: surgeonId, role: 'SURGEON' });
    expect(dupRoleAddTeam.status).toBe(409);

    const teamRow = await db.surgeryTeam.findFirstOrThrow({
      where: { surgeryCaseId: caseId },
    });
    const foreignDeleteTeam = await request(app.getHttpServer())
      .delete(`/surgery/team/${teamRow.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(foreignDeleteTeam.status).toBe(404);

    const foreignChecklist = await request(app.getHttpServer())
      .post(`/surgery/cases/${caseId}/preop-checklist`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ consentSigned: true });
    expect(foreignChecklist.status).toBe(404);
  });

  it('enforces state machine transitions, computes exact Money surgeon commission, and serializes concurrent completion so base surgery charge is posted once', async () => {
    await app.get(CommissionService).upsert(hospitalId, {
      serviceType: 'SURGERY',
      doctorId: surgeonId,
      doctorRate: 17.5,
    });

    const start = new Date(Date.now() + 3600_000).toISOString();
    const end = new Date(Date.now() + 7200_000).toISOString();
    const scheduleRes = await request(app.getHttpServer())
      .post('/surgery/schedule')
      .set('Authorization', `Bearer ${token}`)
      .send({
        encounterId,
        theatreId,
        serviceItemId,
        scheduledStart: start,
        scheduledEnd: end,
        teamMembers: [{ userId: surgeonId, role: 'SURGEON' }],
      });
    expect(scheduleRes.status).toBe(201);
    const caseId = responseBody<TestResponse>(scheduleRes).id;

    const inProgRes = await request(app.getHttpServer())
      .post(`/surgery/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'IN_PROGRESS' });
    expect(inProgRes.status).toBe(201);

    // Concurrent completion requests
    const [compA, compB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/surgery/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'COMPLETED' }),
      request(app.getHttpServer())
        .post(`/surgery/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'COMPLETED' }),
    ]);
    expect([compA.status, compB.status].sort()).toEqual([201, 409]);

    const charges = await db.encounterCharge.findMany({
      where: {
        hospitalId,
        encounterId,
        sourceType: 'SURGERY',
        sourceId: caseId,
      },
    });
    expect(charges).toHaveLength(1);
    expect(charges[0].totalAmount.toFixed(3)).toBe('333.330');
    expect(charges[0].performerId).toBe(surgeonId);

    // 333.330 * 17.5% = 58.33275 -> HALF_EVEN 3dp = 58.333
    const leadTeam = await db.surgeryTeam.findFirstOrThrow({
      where: { surgeryCaseId: caseId, userId: surgeonId, role: 'SURGEON' },
    });
    expect(leadTeam.commissionAmount?.toFixed(3)).toBe('58.333');

    const detailsRes = await request(app.getHttpServer())
      .get(`/surgery/cases/${caseId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailsRes.status).toBe(200);
    expect(
      responseBody<TestResponse>(detailsRes).financialPreview.cataloguePrice,
    ).toBe('333.330');
    expect(
      responseBody<TestResponse>(detailsRes).financialPreview.teamCommissions,
    ).toBe('58.333');

    // Cannot revert COMPLETED surgery or mutate its team
    const revertRes = await request(app.getHttpServer())
      .post(`/surgery/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED' });
    expect(revertRes.status).toBe(409);

    const mutateCompletedTeam = await request(app.getHttpServer())
      .delete(`/surgery/team/${leadTeam.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(mutateCompletedTeam.status).toBe(409);
  });

  it('rolls back surgery completion and commission when EncounterCharge or AuditLog creation fails', async () => {
    await app.get(CommissionService).upsert(hospitalId, {
      serviceType: 'SURGERY',
      doctorId: surgeonId,
      doctorRate: 20,
    });

    const start = new Date(Date.now() + 3600_000).toISOString();
    const end = new Date(Date.now() + 7200_000).toISOString();
    const scheduleRes = await request(app.getHttpServer())
      .post('/surgery/schedule')
      .set('Authorization', `Bearer ${token}`)
      .send({
        encounterId,
        theatreId,
        serviceItemId,
        scheduledStart: start,
        scheduledEnd: end,
        teamMembers: [{ userId: surgeonId, role: 'SURGEON' }],
      });
    expect(scheduleRes.status).toBe(201);
    const caseId = responseBody<TestResponse>(scheduleRes).id;

    await request(app.getHttpServer())
      .post(`/surgery/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(201);

    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_surgery_charge_fn() RETURNS trigger AS $$
      BEGIN
        IF NEW."sourceType" = 'SURGERY' THEN
          RAISE EXCEPTION 'synthetic surgery charge failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS fail_surgery_charge_trg ON "EncounterCharge"`,
    );
    await db.$executeRawUnsafe(`
      CREATE TRIGGER fail_surgery_charge_trg
      BEFORE INSERT ON "EncounterCharge"
      FOR EACH ROW EXECUTE FUNCTION fail_surgery_charge_fn()
    `);

    try {
      const failRes = await request(app.getHttpServer())
        .post(`/surgery/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'COMPLETED' });
      expect(failRes.status).toBeGreaterThanOrEqual(500);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS fail_surgery_charge_trg ON "EncounterCharge"`,
      );
      await db.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS fail_surgery_charge_fn()`,
      );
    }

    const afterChargeFailure = await db.surgeryCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { team: true },
    });
    expect(afterChargeFailure.status).toBe('IN_PROGRESS');
    expect(afterChargeFailure.team[0].commissionAmount).toBeNull();
    expect(
      await db.encounterCharge.count({
        where: { hospitalId, sourceType: 'SURGERY', sourceId: caseId },
      }),
    ).toBe(0);

    // Now succeed once trigger is removed
    const okRes = await request(app.getHttpServer())
      .post(`/surgery/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'COMPLETED' });
    expect(okRes.status).toBe(201);

    const afterSuccess = await db.surgeryCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { team: true },
    });
    expect(afterSuccess.status).toBe('COMPLETED');
    expect(afterSuccess.team[0].commissionAmount?.toFixed(3)).toBe('66.666');
  });
});
