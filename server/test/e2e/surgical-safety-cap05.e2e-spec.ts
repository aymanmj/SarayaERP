import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('CAP05 Surgical Safety Checklist, Dual-Nurse Count, Anesthesia Record & Delivery Safety (Migration #75)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let auth: AuthHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    db = app.get(PrismaService);
    auth = new AuthHelper(db, app.get(JwtService));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('enforces WHO 3-phase sequence & 4-eyes, dual-nurse surgical count lock & incident escalation, signed anesthesia immutability, delivery PPH escalation, and tenant isolation', async () => {
    const scrubNurse = await auth.createTestUser('or-scrub', 'Pass123!', {
      permissions: ['surgery:view', 'surgery:manage'],
    });
    const hospitalA = scrubNurse.user.hospitalId;

    const circNurse = await auth.createTestUser('or-circ', 'Pass123!', {
      hospitalId: hospitalA,
      permissions: ['surgery:view', 'surgery:manage'],
    });
    const anesthesiologist = await auth.createTestUser(
      'or-anesth',
      'Pass123!',
      {
        hospitalId: hospitalA,
        isDoctor: true,
        permissions: ['surgery:view', 'surgery:manage'],
      },
    );

    const foreignHospital = await db.hospital.create({
      data: { code: 'HOSP-OR-B', name: 'Foreign OR Hospital' },
    });
    const foreignUser = await auth.createTestUser('or-foreign', 'Pass123!', {
      hospitalId: foreignHospital.id,
      permissions: ['surgery:view', 'surgery:manage'],
    });

    const patient = await db.patient.create({
      data: {
        hospitalId: hospitalA,
        mrn: 'CAP05-P1',
        fullName: 'Amina Surgery Patient',
        gender: 'FEMALE',
        dateOfBirth: new Date('1992-06-15T00:00:00Z'),
      },
    });
    const encounter = await db.encounter.create({
      data: {
        hospitalId: hospitalA,
        patientId: patient.id,
        type: 'IPD',
        status: 'OPEN',
        doctorId: anesthesiologist.user.id,
      },
    });
    const theatre = await db.operatingTheatre.create({
      data: { hospitalId: hospitalA, name: 'OR-1 Main Theatre' },
    });
    const surgeryCase = await db.surgeryCase.create({
      data: {
        hospitalId: hospitalA,
        encounterId: encounter.id,
        theatreId: theatre.id,
        surgeryName: 'Emergency Cesarean Section',
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 3600_000),
        status: 'IN_PROGRESS',
      },
    });

    // 1. WHO Checklist sequence: TIME_OUT before SIGN_IN is BLOCKED (409)
    await request(app.getHttpServer())
      .post(`/surgery/safety/cases/${surgeryCase.id}/checklist`)
      .auth(scrubNurse.accessToken, { type: 'bearer' })
      .send({
        phase: 'TIME_OUT',
        checklistItems: { teamIntroduced: true },
        verifiedById: circNurse.user.id,
      })
      .expect(409);

    // SIGN_IN succeeds and produces SHA-256 signatureHash
    const signInRes = await request(app.getHttpServer())
      .post(`/surgery/safety/cases/${surgeryCase.id}/checklist`)
      .auth(scrubNurse.accessToken, { type: 'bearer' })
      .send({
        phase: 'SIGN_IN',
        checklistItems: { identityConfirmed: true, oximeterFunctional: true },
        siteMarked: true,
        consentConfirmed: true,
        allergyChecked: true,
      })
      .expect(201);
    const signInId = (signInRes.body as { id: number }).id;
    expect((signInRes.body as { signatureHash: string }).signatureHash).toMatch(
      /^[0-9a-f]{64}$/,
    );

    // Append-only trigger blocks UPDATE/DELETE on SurgicalSafetyChecklist
    await expect(
      db.$executeRaw`UPDATE "SurgicalSafetyChecklist" SET notes = 'Tampered' WHERE id = ${signInId}`,
    ).rejects.toThrow(/immutable/i);

    // TIME_OUT with self-verification (4-eyes violation) is BLOCKED (409)
    await request(app.getHttpServer())
      .post(`/surgery/safety/cases/${surgeryCase.id}/checklist`)
      .auth(scrubNurse.accessToken, { type: 'bearer' })
      .send({
        phase: 'TIME_OUT',
        checklistItems: { siteVerified: true, teamIntroduced: true },
        verifiedById: scrubNurse.user.id,
      })
      .expect(409);

    // TIME_OUT with independent verifier succeeds
    await request(app.getHttpServer())
      .post(`/surgery/safety/cases/${surgeryCase.id}/checklist`)
      .auth(scrubNurse.accessToken, { type: 'bearer' })
      .send({
        phase: 'TIME_OUT',
        checklistItems: { siteVerified: true, teamIntroduced: true },
        antibioticProphylaxisGiven: true,
        imagingDisplayed: true,
        verifiedById: circNurse.user.id,
      })
      .expect(201);

    // 2. Dual-Nurse Surgical Count (Sponges & Needles)
    const spongeRes = await request(app.getHttpServer())
      .post(`/surgery/safety/cases/${surgeryCase.id}/counts`)
      .auth(scrubNurse.accessToken, { type: 'bearer' })
      .send({
        category: 'SPONGE',
        itemName: 'Laparotomy Pads',
        initialCount: 10,
      })
      .expect(201);
    const spongeId = (spongeRes.body as { id: number }).id;

    await request(app.getHttpServer())
      .post(`/surgery/safety/counts/${spongeId}/add`)
      .auth(scrubNurse.accessToken, { type: 'bearer' })
      .send({ addedDelta: 5 })
      .expect(201);

    // Self-verification by same scrub nurse is BLOCKED (409)
    await request(app.getHttpServer())
      .post(`/surgery/safety/counts/${spongeId}/verify`)
      .auth(scrubNurse.accessToken, { type: 'bearer' })
      .send({ finalCount: 15 })
      .expect(409);

    // Circulating nurse counts 14 (expected 15 -> DISCREPANCY!)
    const discRes = await request(app.getHttpServer())
      .post(`/surgery/safety/counts/${spongeId}/verify`)
      .auth(circNurse.accessToken, { type: 'bearer' })
      .send({ finalCount: 14 })
      .expect(201);
    expect(discRes.body).toMatchObject({
      status: 'DISCREPANCY',
      finalCount: 14,
    });

    // SIGN_OUT AND SurgeryCase COMPLETED are BOTH BLOCKED (409) while discrepancy exists!
    await request(app.getHttpServer())
      .post(`/surgery/safety/cases/${surgeryCase.id}/checklist`)
      .auth(scrubNurse.accessToken, { type: 'bearer' })
      .send({
        phase: 'SIGN_OUT',
        checklistItems: { countComplete: false },
        verifiedById: circNurse.user.id,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/surgery/cases/${surgeryCase.id}/status`)
      .auth(scrubNurse.accessToken, { type: 'bearer' })
      .send({ status: 'COMPLETED' })
      .expect(409);

    // Resolve discrepancy via ESCALATED_INCIDENT -> auto-creates SENTINEL ClinicalIncident!
    const resolveRes = await request(app.getHttpServer())
      .post(`/surgery/safety/counts/${spongeId}/resolve`)
      .auth(circNurse.accessToken, { type: 'bearer' })
      .send({
        resolutionStatus: 'ESCALATED_INCIDENT',
        resolutionNotes:
          'Intra-op portable X-ray performed; radiologist notified and sentinel incident filed.',
      })
      .expect(201);
    expect(resolveRes.body).toMatchObject({
      countItem: { status: 'ESCALATED_INCIDENT' },
      incident: { severity: 'SENTINEL' },
    });

    // Finalized SurgicalCountItem cannot be deleted or modified in PostgreSQL
    await expect(
      db.$executeRaw`DELETE FROM "SurgicalCountItem" WHERE id = ${spongeId}`,
    ).rejects.toThrow(/cannot be deleted/i);

    // Now SIGN_OUT succeeds!
    await request(app.getHttpServer())
      .post(`/surgery/safety/cases/${surgeryCase.id}/checklist`)
      .auth(scrubNurse.accessToken, { type: 'bearer' })
      .send({
        phase: 'SIGN_OUT',
        checklistItems: { countReconciled: true, specimenLabeled: true },
        verifiedById: circNurse.user.id,
      })
      .expect(201);

    // 3. Signed Intra-Op Anesthesia Record & immutability
    await request(app.getHttpServer())
      .put(`/surgery/safety/cases/${surgeryCase.id}/anesthesia`)
      .auth(anesthesiologist.accessToken, { type: 'bearer' })
      .send({
        asaClass: 'ASA_2',
        isEmergency: true,
        anesthesiaType: 'SPINAL',
        airwayManagement: 'Natural airway + O2 4L/min',
        fluidsInMl: 2000,
        estimatedBloodLossMl: 600,
        urineOutputMl: 250,
        pacuAldreteScore: 9,
      })
      .expect(200);

    const anesthSignRes = await request(app.getHttpServer())
      .post(`/surgery/safety/cases/${surgeryCase.id}/anesthesia/sign`)
      .auth(anesthesiologist.accessToken, { type: 'bearer' })
      .expect(201);
    const anesthId = (anesthSignRes.body as { id: number }).id;
    expect(anesthSignRes.body).toMatchObject({ status: 'SIGNED' });
    expect(
      (anesthSignRes.body as { signatureHash: string }).signatureHash,
    ).toMatch(/^[0-9a-f]{64}$/);

    // Subsequent edit is BLOCKED (409) and DB UPDATE is blocked by trigger
    await request(app.getHttpServer())
      .put(`/surgery/safety/cases/${surgeryCase.id}/anesthesia`)
      .auth(anesthesiologist.accessToken, { type: 'bearer' })
      .send({ asaClass: 'ASA_1', anesthesiaType: 'LOCAL' })
      .expect(409);

    await expect(
      db.$executeRaw`UPDATE "AnesthesiaRecord" SET "estimatedBloodLossMl" = 0 WHERE id = ${anesthId}`,
    ).rejects.toThrow(/immutable/i);

    // 4. Obstetrical Delivery Safety Sign-Off with PPH (>=1000mL CS) + low APGAR auto-incident
    const delivery = await db.deliveryAdmission.create({
      data: {
        encounterId: encounter.id,
        deliveryMethod: 'CS_EMERGENCY',
        bloodLoss: 1350,
        babyCount: 1,
        babies: {
          create: {
            gender: 'FEMALE',
            birthTime: new Date(),
            apgarScore1: 5,
            apgarScore5: 6,
            status: 'NICU',
          },
        },
      },
    });

    const delivSignRes = await request(app.getHttpServer())
      .post(`/surgery/safety/deliveries/${delivery.id}/safety-sign`)
      .auth(anesthesiologist.accessToken, { type: 'bearer' })
      .send({ notes: 'Oxytocin + tranexamic acid given; NICU team attended' })
      .expect(201);
    expect(delivSignRes.body).toMatchObject({
      delivery: { pphAlertTriggered: true },
      evaluation: { pphTriggered: true, neonatalAlertTriggered: true },
      incident: { severity: 'MAJOR' },
    });

    // 5. Cross-tenant isolation: foreign hospital user gets 404
    await request(app.getHttpServer())
      .get(`/surgery/safety/cases/${surgeryCase.id}/summary`)
      .auth(foreignUser.accessToken, { type: 'bearer' })
      .expect(404);
  });
});
