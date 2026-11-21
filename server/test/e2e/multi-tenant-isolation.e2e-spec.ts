import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('E2E Tests - Multi-Tenant Isolation', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns only the authenticated branch patients in both directions', async () => {
    // Run only against an isolated, disposable E2E database.
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const tokens: string[] = [];
    const patientIds: number[] = [];
    for (const branch of ['A', 'B']) {
      const organization = await prisma.organization.create({
        data: { name: `Organization ${branch}`, code: `ORG-${branch}` },
      });
      const hospital = await prisma.hospital.create({
        data: {
          name: `Branch ${branch}`,
          code: `BR-${branch}`,
          organizationId: organization.id,
        },
      });
      const staff = await auth.createTestUser(
        `user-${branch}`,
        'test-password',
        {
          hospitalId: hospital.id,
          permissions: ['patients:view'],
        },
      );
      tokens.push(staff.accessToken);
      const patient = await prisma.patient.create({
        data: {
          hospitalId: hospital.id,
          fullName: `Patient ${branch}`,
          mrn: `MRN-${branch}`,
          gender: 'MALE',
        },
      });
      patientIds.push(patient.id);
    }
    for (const [index, token] of tokens.entries()) {
      const response = await request(app.getHttpServer())
        .get('/patients')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = response.body as { items: { id: number }[] };
      const ids = body.items.map((patient) => patient.id);
      expect(ids).toContain(patientIds[index]);
      expect(ids).not.toContain(patientIds[1 - index]);
    }
  });

  it('enforces tenant isolation on nursing care-tasks and separates write permissions from :view (SEC03 / OPS02)', async () => {
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const server = app.getHttpServer();

    const hospA = await prisma.hospital.create({
      data: { name: 'Hospital A', code: `HOSP-A-${Date.now()}` },
    });
    const hospB = await prisma.hospital.create({
      data: { name: 'Hospital B', code: `HOSP-B-${Date.now()}` },
    });

    const nurseA = await auth.createTestUser('nurse-a', 'test-password', {
      hospitalId: hospA.id,
      permissions: ['nursing:view', 'nursing:notes:manage'],
    });
    const nurseB = await auth.createTestUser('nurse-b', 'test-password', {
      hospitalId: hospB.id,
      permissions: ['nursing:view', 'nursing:notes:manage'],
    });

    const patientA = await prisma.patient.create({
      data: {
        hospitalId: hospA.id,
        fullName: 'Care Task Patient',
        mrn: `MRN-CT-${Date.now()}`,
        gender: 'FEMALE',
      },
    });
    const encounterA = await prisma.encounter.create({
      data: {
        hospitalId: hospA.id,
        patientId: patientA.id,
        type: 'IPD',
        status: 'OPEN',
      },
    });
    const encounterER = await prisma.encounter.create({
      data: {
        hospitalId: hospA.id,
        patientId: patientA.id,
        type: 'ER',
        status: 'OPEN',
      },
    });

    const pathwayA = await prisma.clinicalPathway.create({
      data: {
        hospitalId: hospA.id,
        name: 'Post-Op Pathway',
        createdById: nurseA.user.id,
        steps: {
          create: {
            dayNumber: 1,
            title: 'Day 1 Check',
          },
        },
      },
      include: { steps: true },
    });
    const enrollmentA = await prisma.pathwayEnrollment.create({
      data: {
        pathwayId: pathwayA.id,
        encounterId: encounterA.id,
        patientId: patientA.id,
        enrolledById: nurseA.user.id,
      },
    });
    const careTaskA = await prisma.careTask.create({
      data: {
        enrollmentId: enrollmentA.id,
        stepId: pathwayA.steps[0].id,
        title: 'Assess wound dressing',
      },
    });

    // Cross-hospital access to care-tasks must be rejected
    await request(server)
      .get(`/nursing/encounters/${encounterA.id}/care-tasks`)
      .set('Authorization', `Bearer ${nurseB.accessToken}`)
      .expect(404);

    await request(server)
      .post(`/nursing/care-tasks/${careTaskA.id}/status`)
      .set('Authorization', `Bearer ${nurseB.accessToken}`)
      .send({ status: 'COMPLETED', notes: 'Cross-tenant attempt' })
      .expect(404);

    // Same-hospital access succeeds
    const listRes = await request(server)
      .get(`/nursing/encounters/${encounterA.id}/care-tasks`)
      .set('Authorization', `Bearer ${nurseA.accessToken}`)
      .expect(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect((listRes.body as { id: number }[]).map((t) => t.id)).toContain(
      careTaskA.id,
    );

    const updateRes = await request(server)
      .post(`/nursing/care-tasks/${careTaskA.id}/status`)
      .set('Authorization', `Bearer ${nurseA.accessToken}`)
      .send({ status: 'COMPLETED', notes: 'Completed in Hospital A' })
      .expect(201);
    expect((updateRes.body as { status: string }).status).toBe('COMPLETED');

    // OPS02: :view alone cannot create or mutate appointments or triage
    const apptViewer = await auth.createTestUser(
      'appt-viewer',
      'test-password',
      {
        hospitalId: hospA.id,
        permissions: ['appointments:view', 'clinical:appointments:view'],
      },
    );
    const doctorUser = await auth.createTestUser(
      'doc-status',
      'test-password',
      {
        hospitalId: hospA.id,
        isDoctor: true,
        roles: ['DOCTOR'],
        permissions: [
          'clinical:appointments:view',
          'clinical:appointments:status',
        ],
      },
    );
    const apptOwned = await prisma.appointment.create({
      data: {
        hospitalId: hospA.id,
        patientId: patientA.id,
        doctorId: doctorUser.user.id,
        status: 'CONFIRMED',
        scheduledStart: new Date('2026-11-22T09:00:00.000Z'),
        scheduledEnd: new Date('2026-11-22T09:30:00.000Z'),
      },
    });

    await request(server)
      .post('/appointments')
      .set('Authorization', `Bearer ${apptViewer.accessToken}`)
      .send({
        patientId: patientA.id,
        scheduledStart: '2026-11-22T10:00:00.000Z',
        scheduledEnd: '2026-11-22T10:30:00.000Z',
      })
      .expect(403);

    await request(server)
      .patch(`/appointments/${apptOwned.id}/status`)
      .set('Authorization', `Bearer ${apptViewer.accessToken}`)
      .send({ status: 'CHECKED_IN' })
      .expect(403);

    // Doctor with clinical:appointments:status cannot create appointments, but can check in their own
    await request(server)
      .post('/appointments')
      .set('Authorization', `Bearer ${doctorUser.accessToken}`)
      .send({
        patientId: patientA.id,
        scheduledStart: '2026-11-22T11:00:00.000Z',
        scheduledEnd: '2026-11-22T11:30:00.000Z',
      })
      .expect(403);

    const docStatusRes = await request(server)
      .patch(`/appointments/${apptOwned.id}/status`)
      .set('Authorization', `Bearer ${doctorUser.accessToken}`)
      .send({ status: 'CHECKED_IN' })
      .expect(200);
    expect((docStatusRes.body as { status: string }).status).toBe('CHECKED_IN');

    // Triage: triage:view alone cannot create assessment; nursing:triage:manage can read & assess
    const triageViewer = await auth.createTestUser(
      'triage-viewer',
      'test-password',
      {
        hospitalId: hospA.id,
        permissions: ['triage:view'],
      },
    );
    const triageNurse = await auth.createTestUser(
      'triage-nurse',
      'test-password',
      {
        hospitalId: hospA.id,
        permissions: ['nursing:triage:manage'],
      },
    );

    await request(server)
      .post('/triage/assess')
      .set('Authorization', `Bearer ${triageViewer.accessToken}`)
      .send({
        encounterId: encounterER.id,
        level: 'URGENT',
        chiefComplaint: 'Synthetic chest pain',
        vitals: { heartRate: 92, o2Sat: 98 },
      })
      .expect(403);

    await request(server)
      .get('/triage/waiting')
      .set('Authorization', `Bearer ${triageNurse.accessToken}`)
      .expect(200);

    await request(server)
      .post('/triage/assess')
      .set('Authorization', `Bearer ${triageNurse.accessToken}`)
      .send({
        encounterId: encounterER.id,
        level: 'URGENT',
        chiefComplaint: 'Synthetic chest pain',
        vitals: { heartRate: 92, o2Sat: 98 },
        notes: 'E2E triage test',
      })
      .expect(201);
  });
});
