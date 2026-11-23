import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

interface MergeRecordResponse {
  id: number;
  status: string;
  sourcePatientId: number;
  targetPatientId: number;
  transferManifest?: {
    encounterIds: number[];
    appointmentIds: number[];
    allergyIds: number[];
  };
}

interface DeathOutcomeResponse {
  patient: {
    id: number;
    isDeceased: boolean;
    isActive: boolean;
    deathCertificateNumber: string | null;
  };
  deathEvent: { id: number; eventType: string };
  cancelledAppointmentIds: number[];
}

interface DeathEventResponse {
  id: number;
  eventType: string;
}

describe('E2E Tests - Patient Merge/Unmerge & Death Management (CAP06 / OPS02 / OPS03 / SEC03)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('executes 4-eyes merge with full clinical transfer, blocks merged records, losslessly unmerges, documents death with appointment cancellation, and supports 4-eyes death reversal', async () => {
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const server = app.getHttpServer();

    const hospA = await prisma.hospital.create({
      data: { name: 'Saraya Main', code: `HOSP-CAP06-A-${Date.now()}` },
    });
    const hospB = await prisma.hospital.create({
      data: { name: 'Other Branch', code: `HOSP-CAP06-B-${Date.now()}` },
    });

    const requesterClerk = await auth.createTestUser('clerk-req', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'patients:view',
        'patients:merge:request',
        'encounters:create',
        'appointments:manage',
      ],
    });
    const approverAdmin = await auth.createTestUser('admin-app', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'patients:view',
        'patients:merge:request',
        'patients:merge:approve',
        'encounters:create',
        'appointments:manage',
      ],
    });
    const physicianOne = await auth.createTestUser('dr-one', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'patients:view',
        'patients:death:record',
        'patients:death:reverse',
        'encounters:manage',
        'appointments:manage',
      ],
    });
    const physicianTwo = await auth.createTestUser('dr-two', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'patients:view',
        'patients:death:record',
        'patients:death:reverse',
      ],
    });
    const otherHospitalAdmin = await auth.createTestUser(
      'admin-hosp-b',
      'password',
      {
        hospitalId: hospB.id,
        permissions: [
          'patients:view',
          'patients:merge:request',
          'patients:merge:approve',
          'patients:death:record',
          'patients:death:reverse',
        ],
      },
    );

    const globalCanonical = await prisma.globalPatient.create({
      data: { fullName: 'Canonical Patient', gender: 'MALE' },
    });

    const sourcePatient = await prisma.patient.create({
      data: {
        hospitalId: hospA.id,
        fullName: 'Duplicate Patient File',
        mrn: `MRN-DUP-${Date.now()}`,
        gender: 'MALE',
        dateOfBirth: new Date('1982-03-15T00:00:00.000Z'),
      },
    });
    const targetPatient = await prisma.patient.create({
      data: {
        hospitalId: hospA.id,
        globalPatientId: globalCanonical.id,
        fullName: 'Canonical Patient',
        mrn: `MRN-CANON-${Date.now()}`,
        gender: 'MALE',
        dateOfBirth: new Date('1982-03-15T00:00:00.000Z'),
      },
    });

    // Populate source patient with closed encounter, future appointment, and allergy
    const closedEnc = await prisma.encounter.create({
      data: {
        hospitalId: hospA.id,
        patientId: sourcePatient.id,
        type: 'OPD',
        status: 'CLOSED',
      },
    });
    const futureStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);
    const sourceAppt = await prisma.appointment.create({
      data: {
        hospitalId: hospA.id,
        patientId: sourcePatient.id,
        scheduledStart: futureStart,
        scheduledEnd: futureEnd,
        status: 'CONFIRMED',
      },
    });
    const sourceAllergy = await prisma.patientAllergy.create({
      data: {
        patientId: sourcePatient.id,
        allergen: 'Penicillin',
        severity: 'SEVERE',
      },
    });

    // 1. Clerk requests merge
    const mergeReqRes = await request(server)
      .post('/patients/governance/merges')
      .set('Authorization', `Bearer ${requesterClerk.accessToken}`)
      .send({
        sourcePatientId: sourcePatient.id,
        targetPatientId: targetPatient.id,
        reason: 'Verified duplicate registration by national ID and DOB',
      })
      .expect(201);
    const mergeReq = mergeReqRes.body as MergeRecordResponse;
    expect(mergeReq.status).toBe('PENDING');

    // Duplicate pending request for same source blocked (409)
    await request(server)
      .post('/patients/governance/merges')
      .set('Authorization', `Bearer ${approverAdmin.accessToken}`)
      .send({
        sourcePatientId: sourcePatient.id,
        targetPatientId: targetPatient.id,
        reason: 'Second pending attempt',
      })
      .expect(409);

    // Clerk without approve permission gets 403
    await request(server)
      .post(`/patients/governance/merges/${mergeReq.id}/review`)
      .set('Authorization', `Bearer ${requesterClerk.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(403);

    // Cross-hospital admin gets 404
    await request(server)
      .post(`/patients/governance/merges/${mergeReq.id}/review`)
      .set('Authorization', `Bearer ${otherHospitalAdmin.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(404);

    // 2. Independent approver approves merge (4-eyes)
    const approveRes = await request(server)
      .post(`/patients/governance/merges/${mergeReq.id}/review`)
      .set('Authorization', `Bearer ${approverAdmin.accessToken}`)
      .send({
        decision: 'APPROVE',
        reviewNote: 'Confirmed matching identity documents',
      })
      .expect(201);
    const approvedMerge = approveRes.body as MergeRecordResponse;
    expect(approvedMerge.status).toBe('APPROVED');
    expect(approvedMerge.transferManifest?.encounterIds).toEqual([
      closedEnc.id,
    ]);
    expect(approvedMerge.transferManifest?.appointmentIds).toEqual([
      sourceAppt.id,
    ]);
    expect(approvedMerge.transferManifest?.allergyIds).toEqual([
      sourceAllergy.id,
    ]);

    // Verify all linked records moved to targetPatient and source is deactivated + linked to canonical MPI
    const [movedEnc, movedAppt, movedAllergy, mergedSource] = await Promise.all(
      [
        prisma.encounter.findUniqueOrThrow({ where: { id: closedEnc.id } }),
        prisma.appointment.findUniqueOrThrow({ where: { id: sourceAppt.id } }),
        prisma.patientAllergy.findUniqueOrThrow({
          where: { id: sourceAllergy.id },
        }),
        prisma.patient.findUniqueOrThrow({ where: { id: sourcePatient.id } }),
      ],
    );
    expect(movedEnc.patientId).toBe(targetPatient.id);
    expect(movedAppt.patientId).toBe(targetPatient.id);
    expect(movedAllergy.patientId).toBe(targetPatient.id);
    expect(mergedSource.mergedIntoPatientId).toBe(targetPatient.id);
    expect(mergedSource.isActive).toBe(false);
    expect(mergedSource.globalPatientId).toBe(globalCanonical.id);

    // PostgreSQL trigger blocks deleting PatientMergeRecord
    await expect(
      prisma.$executeRaw`DELETE FROM "PatientMergeRecord" WHERE "id" = ${mergeReq.id}`,
    ).rejects.toThrow(/immutable/i);

    // Merged source patient cannot open new encounter (409)
    await request(server)
      .post('/encounters')
      .set('Authorization', `Bearer ${physicianOne.accessToken}`)
      .send({
        patientId: sourcePatient.id,
        type: 'OPD',
        chiefComplaint: 'Should be blocked on merged file',
      })
      .expect(409);

    // 3. Lossless Unmerge restores every moved record back to sourcePatient
    const unmergeRes = await request(server)
      .post(`/patients/governance/merges/${mergeReq.id}/unmerge`)
      .set('Authorization', `Bearer ${approverAdmin.accessToken}`)
      .send({ reason: 'Twin brothers mistakenly merged under same record' })
      .expect(201);
    const unmerged = unmergeRes.body as MergeRecordResponse;
    expect(unmerged.status).toBe('UNMERGED');

    const [restoredEnc, restoredAppt, restoredAllergy, restoredSource] =
      await Promise.all([
        prisma.encounter.findUniqueOrThrow({ where: { id: closedEnc.id } }),
        prisma.appointment.findUniqueOrThrow({ where: { id: sourceAppt.id } }),
        prisma.patientAllergy.findUniqueOrThrow({
          where: { id: sourceAllergy.id },
        }),
        prisma.patient.findUniqueOrThrow({ where: { id: sourcePatient.id } }),
      ]);
    expect(restoredEnc.patientId).toBe(sourcePatient.id);
    expect(restoredAppt.patientId).toBe(sourcePatient.id);
    expect(restoredAllergy.patientId).toBe(sourcePatient.id);
    expect(restoredSource.mergedIntoPatientId).toBeNull();
    expect(restoredSource.isActive).toBe(true);
    expect(restoredSource.globalPatientId).toBeNull();

    // 4. Death Management: record death & auto-cancel future scheduled appointments
    const deathDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const deathRes = await request(server)
      .post(`/patients/governance/${sourcePatient.id}/death`)
      .set('Authorization', `Bearer ${physicianOne.accessToken}`)
      .send({
        dateOfDeath: deathDate,
        causeOfDeath: 'Acute myocardial infarction',
        deathCertificateNumber: 'DC-2026-00981',
        deathLocation: 'ICU Bed 4',
      })
      .expect(201);
    const deathOutcome = deathRes.body as DeathOutcomeResponse;
    expect(deathOutcome.patient.isDeceased).toBe(true);
    expect(deathOutcome.patient.isActive).toBe(false);
    expect(deathOutcome.cancelledAppointmentIds).toEqual([sourceAppt.id]);

    const cancelledAppt = await prisma.appointment.findUniqueOrThrow({
      where: { id: sourceAppt.id },
    });
    expect(cancelledAppt.status).toBe('CANCELLED');

    // PostgreSQL append-only trigger blocks UPDATE/DELETE on PatientDeathEvent
    await expect(
      prisma.$executeRaw`UPDATE "PatientDeathEvent" SET "causeOfDeath" = 'Tampered' WHERE "id" = ${deathOutcome.deathEvent.id}`,
    ).rejects.toThrow(/append-only|immutable/i);

    // Deceased patient cannot open new encounter or book new appointment (409)
    await request(server)
      .post('/encounters')
      .set('Authorization', `Bearer ${physicianOne.accessToken}`)
      .send({
        patientId: sourcePatient.id,
        type: 'OPD',
        chiefComplaint: 'Blocked for deceased patient',
      })
      .expect(409);

    await request(server)
      .post('/appointments')
      .set('Authorization', `Bearer ${physicianOne.accessToken}`)
      .send({
        patientId: sourcePatient.id,
        scheduledStart: futureStart.toISOString(),
        scheduledEnd: futureEnd.toISOString(),
      })
      .expect(409);

    // 5. 4-Eyes Mistaken Death Reversal
    const revReqRes = await request(server)
      .post(`/patients/governance/${sourcePatient.id}/death/reversal-request`)
      .set('Authorization', `Bearer ${physicianOne.accessToken}`)
      .send({
        reason: 'Wrong MRN selected during night shift death documentation',
      })
      .expect(201);
    const revReq = revReqRes.body as DeathEventResponse;
    expect(revReq.eventType).toBe('REVERSAL_REQUESTED');

    // Same physician cannot approve their own reversal request (403)
    await request(server)
      .post(
        `/patients/governance/${sourcePatient.id}/death/reversal-review/${revReq.id}`,
      )
      .set('Authorization', `Bearer ${physicianOne.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(403);

    // Second independent physician approves reversal -> patient reactivated
    await request(server)
      .post(
        `/patients/governance/${sourcePatient.id}/death/reversal-review/${revReq.id}`,
      )
      .set('Authorization', `Bearer ${physicianTwo.accessToken}`)
      .send({
        decision: 'APPROVE',
        reviewNote: 'Verified patient is alive in Ward B',
      })
      .expect(201);

    const reactivated = await prisma.patient.findUniqueOrThrow({
      where: { id: sourcePatient.id },
    });
    expect(reactivated.isDeceased).toBe(false);
    expect(reactivated.dateOfDeath).toBeNull();
    expect(reactivated.isActive).toBe(true);

    // 6. Chained AuditLog captured every governance lifecycle event
    const audits = await prisma.auditLog.findMany({
      where: {
        hospitalId: hospA.id,
        action: { startsWith: 'PATIENT_' },
      },
      orderBy: { id: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual([
      'PATIENT_MERGE_REQUESTED',
      'PATIENT_MERGE_APPROVED',
      'PATIENT_UNMERGED',
      'PATIENT_DEATH_RECORDED',
      'PATIENT_DEATH_REVERSAL_REQUESTED',
      'PATIENT_DEATH_REVERSED',
    ]);
  });
});
