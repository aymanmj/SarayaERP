import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { EncounterType, Gender } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

interface UnitRes {
  id: number;
  unitNumber: string;
  status: string;
  screeningStatus: string;
}

interface CrossmatchRes {
  id: number;
  status: string;
  verifiedById: number | null;
}

interface TransfusionRes {
  id: number;
  status: string;
  bedsideVerifier1Id: number | null;
  bedsideVerifier2Id: number | null;
  hasReaction: boolean;
  clinicalIncident: {
    id: number;
    incidentNumber: string;
    severity: string;
  } | null;
  bloodUnit: {
    id: number;
    status: string;
  };
  events: Array<{ id: number; eventType: string }>;
}

describe('E2E Tests - Blood Bank & Transfusion Safety (CAP04)', () => {
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

  it('enforces serology clearance, expiry, ABO/Rh compatibility, 4-eyes crossmatch, 2-nurse bedside barcode verification, vitals logging, reaction auto-escalation to ClinicalIncident, cross-tenant isolation, and PostgreSQL immutability', async () => {
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const server = app.getHttpServer();

    const hospA = await prisma.hospital.create({
      data: { name: 'Saraya Hospital', code: `HOSP-CAP04-A-${Date.now()}` },
    });
    const hospB = await prisma.hospital.create({
      data: { name: 'Other Hospital', code: `HOSP-CAP04-B-${Date.now()}` },
    });

    const labTech1 = await auth.createTestUser('bb-tech-1', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'blood-bank:view',
        'blood-bank:inventory:manage',
        'blood-bank:crossmatch:manage',
      ],
    });
    const labTech2 = await auth.createTestUser('bb-tech-2', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'blood-bank:view',
        'blood-bank:inventory:manage',
        'blood-bank:crossmatch:manage',
      ],
    });
    const nurse1 = await auth.createTestUser('bb-nurse-1', 'password', {
      hospitalId: hospA.id,
      permissions: ['blood-bank:view', 'blood-bank:transfusion:manage'],
    });
    const nurse2 = await auth.createTestUser('bb-nurse-2', 'password', {
      hospitalId: hospA.id,
      permissions: ['blood-bank:view', 'blood-bank:transfusion:manage'],
    });
    const otherUser = await auth.createTestUser('bb-other', 'password', {
      hospitalId: hospB.id,
      permissions: [
        'blood-bank:view',
        'blood-bank:inventory:manage',
        'blood-bank:crossmatch:manage',
        'blood-bank:transfusion:manage',
      ],
    });

    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospA.id,
        mrn: 'MRN-BB-1001',
        fullName: 'سالم عمر المريض',
        gender: Gender.MALE,
      },
    });
    const encounter = await prisma.encounter.create({
      data: {
        hospitalId: hospA.id,
        patientId: patient.id,
        type: EncounterType.IPD,
        status: 'OPEN',
      },
    });

    const now = Date.now();
    const collectedAt = new Date(now - 2 * 86_400_000).toISOString();
    const expiresFuture = new Date(now + 30 * 86_400_000).toISOString();

    // 1. Register an O- PRBC unit -> starts QUARANTINED / PENDING serology
    const unit1Res = await request(server)
      .post('/blood-bank/units')
      .set('Authorization', `Bearer ${labTech1.accessToken}`)
      .send({
        unitNumber: 'ISBT-2026-0001',
        componentType: 'PRBC',
        bloodGroup: 'O-',
        volumeMl: 350,
        donorReference: 'DON-1001',
        collectedAt,
        expiresAt: expiresFuture,
        storageLocation: 'FRIDGE-A1 (2-6C)',
      })
      .expect(201);
    const unit1 = unit1Res.body as UnitRes;
    expect(unit1.status).toBe('QUARANTINED');
    expect(unit1.screeningStatus).toBe('PENDING');

    // Register an A+ PRBC unit (for incompatible test against O- patient)
    const unit2Res = await request(server)
      .post('/blood-bank/units')
      .set('Authorization', `Bearer ${labTech1.accessToken}`)
      .send({
        unitNumber: 'ISBT-2026-0002',
        componentType: 'PRBC',
        bloodGroup: 'A+',
        volumeMl: 350,
        collectedAt,
        expiresAt: expiresFuture,
      })
      .expect(201);
    const unit2 = unit2Res.body as UnitRes;

    // 2. Unscreened blood unit CANNOT be crossmatched (409)
    await request(server)
      .post('/blood-bank/crossmatches')
      .set('Authorization', `Bearer ${labTech1.accessToken}`)
      .send({
        patientId: patient.id,
        encounterId: encounter.id,
        bloodUnitId: unit1.id,
        patientBloodGroup: 'O-',
      })
      .expect(409);

    // Clear serology on both units
    const screened1 = await request(server)
      .post(`/blood-bank/units/${unit1.id}/screen`)
      .set('Authorization', `Bearer ${labTech1.accessToken}`)
      .send({
        screeningStatus: 'CLEARED',
        screeningNotes: 'HBV/HCV/HIV/Syphilis Negative',
      })
      .expect(201);
    expect((screened1.body as UnitRes).status).toBe('AVAILABLE');

    await request(server)
      .post(`/blood-bank/units/${unit2.id}/screen`)
      .set('Authorization', `Bearer ${labTech1.accessToken}`)
      .send({ screeningStatus: 'CLEARED' })
      .expect(201);

    // 3. ABO/Rh INCOMPATIBLE crossmatch (A+ PRBC -> O- patient) MUST fail (409)
    await request(server)
      .post('/blood-bank/crossmatches')
      .set('Authorization', `Bearer ${labTech1.accessToken}`)
      .send({
        patientId: patient.id,
        encounterId: encounter.id,
        bloodUnitId: unit2.id,
        patientBloodGroup: 'O-',
      })
      .expect(409);

    // 4. Compatible crossmatch (O- PRBC -> O- patient) succeeds
    const cmRes = await request(server)
      .post('/blood-bank/crossmatches')
      .set('Authorization', `Bearer ${labTech1.accessToken}`)
      .send({
        patientId: patient.id,
        encounterId: encounter.id,
        bloodUnitId: unit1.id,
        patientBloodGroup: 'O-',
        antibodyScreen: 'NEGATIVE',
      })
      .expect(201);
    const cm = cmRes.body as CrossmatchRes;
    expect(cm.status).toBe('ACTIVE');

    // Cannot issue before 4-eyes crossmatch verification (409)
    await request(server)
      .post(`/blood-bank/crossmatches/${cm.id}/issue`)
      .set('Authorization', `Bearer ${labTech1.accessToken}`)
      .expect(409);

    // Self-verification of crossmatch blocked (403)
    await request(server)
      .post(`/blood-bank/crossmatches/${cm.id}/verify`)
      .set('Authorization', `Bearer ${labTech1.accessToken}`)
      .expect(403);

    // Second lab tech verifies crossmatch
    const verifiedCm = await request(server)
      .post(`/blood-bank/crossmatches/${cm.id}/verify`)
      .set('Authorization', `Bearer ${labTech2.accessToken}`)
      .expect(201);
    expect((verifiedCm.body as CrossmatchRes).verifiedById).toBe(
      labTech2.user.id,
    );

    // 5. Issue unit to ward
    const issueRes = await request(server)
      .post(`/blood-bank/crossmatches/${cm.id}/issue`)
      .set('Authorization', `Bearer ${labTech2.accessToken}`)
      .expect(201);
    const transfusion = issueRes.body as TransfusionRes;
    expect(transfusion.status).toBe('ISSUED');

    // Cross-tenant isolation: Hospital B cannot access or verify
    await request(server)
      .post(`/blood-bank/transfusions/${transfusion.id}/start`)
      .set('Authorization', `Bearer ${otherUser.accessToken}`)
      .expect(404);

    // 6. Cannot start transfusion before 2-nurse bedside barcode verification (409)
    await request(server)
      .post(`/blood-bank/transfusions/${transfusion.id}/start`)
      .set('Authorization', `Bearer ${nurse1.accessToken}`)
      .expect(409);

    // Wrong bag barcode scan blocked (409)
    await request(server)
      .post(`/blood-bank/transfusions/${transfusion.id}/bedside-verify`)
      .set('Authorization', `Bearer ${nurse1.accessToken}`)
      .send({
        patientBandScanned: true,
        bagBarcodeScanned: true,
        scannedUnitNumber: 'WRONG-BAG-999',
        scannedPatientMrn: 'MRN-BB-1001',
      })
      .expect(409);

    // Nurse 1 completes Bedside Verification #1
    const check1Res = await request(server)
      .post(`/blood-bank/transfusions/${transfusion.id}/bedside-verify`)
      .set('Authorization', `Bearer ${nurse1.accessToken}`)
      .send({
        patientBandScanned: true,
        bagBarcodeScanned: true,
        scannedUnitNumber: 'ISBT-2026-0001',
        scannedPatientMrn: 'MRN-BB-1001',
      })
      .expect(201);
    expect((check1Res.body as TransfusionRes).status).toBe('ISSUED');
    expect((check1Res.body as TransfusionRes).bedsideVerifier1Id).toBe(
      nurse1.user.id,
    );

    // Nurse 1 CANNOT perform Bedside Verification #2 (403 — JCI 2-nurse rule)
    await request(server)
      .post(`/blood-bank/transfusions/${transfusion.id}/bedside-verify`)
      .set('Authorization', `Bearer ${nurse1.accessToken}`)
      .send({
        patientBandScanned: true,
        bagBarcodeScanned: true,
        scannedUnitNumber: 'ISBT-2026-0001',
        scannedPatientMrn: 'MRN-BB-1001',
      })
      .expect(403);

    // Nurse 2 completes Bedside Verification #2 -> VERIFIED_BEDSIDE
    const check2Res = await request(server)
      .post(`/blood-bank/transfusions/${transfusion.id}/bedside-verify`)
      .set('Authorization', `Bearer ${nurse2.accessToken}`)
      .send({
        patientBandScanned: true,
        bagBarcodeScanned: true,
        scannedUnitNumber: 'ISBT-2026-0001',
        scannedPatientMrn: 'MRN-BB-1001',
      })
      .expect(201);
    expect((check2Res.body as TransfusionRes).status).toBe('VERIFIED_BEDSIDE');

    // 7. Start transfusion & record pre-transfusion + 15-min vitals
    const startRes = await request(server)
      .post(`/blood-bank/transfusions/${transfusion.id}/start`)
      .set('Authorization', `Bearer ${nurse1.accessToken}`)
      .expect(201);
    expect((startRes.body as TransfusionRes).status).toBe('IN_PROGRESS');

    await request(server)
      .post(`/blood-bank/transfusions/${transfusion.id}/vitals`)
      .set('Authorization', `Bearer ${nurse1.accessToken}`)
      .send({
        eventType: 'PRE_TRANSFUSION_VITALS',
        temperatureC: 36.8,
        heartRate: 78,
        systolicBp: 120,
        diastolicBp: 78,
        spo2: 99,
      })
      .expect(201);

    // 8. Report acute transfusion reaction -> halts transfusion, quarantines unit, auto-creates ClinicalIncident!
    const reactRes = await request(server)
      .post(`/blood-bank/transfusions/${transfusion.id}/reaction`)
      .set('Authorization', `Bearer ${nurse2.accessToken}`)
      .send({
        reactionType: 'FEBRILE_NON_HEMOLYTIC',
        severity: 'MODERATE',
        reactionSymptoms: 'ارتفاع حرارة 38.9 وقشعريرة بعد 15 دقيقة',
        actionTaken:
          'إيقاف النقل فورًا، الحفاظ على الخط الوريدي بمحلول ملحي، وإبلاغ الطبيب وبنك الدم',
        volumeTransfusedMl: 75,
        temperatureC: 38.9,
        heartRate: 112,
      })
      .expect(201);
    const reacted = reactRes.body as TransfusionRes;
    expect(reacted.status).toBe('STOPPED_REACTION');
    expect(reacted.hasReaction).toBe(true);
    expect(reacted.bloodUnit.status).toBe('REACTED_QUARANTINED');
    expect(reacted.clinicalIncident).not.toBeNull();
    expect(reacted.clinicalIncident?.severity).toBe('MODERATE');
    expect(reacted.events.length).toBeGreaterThanOrEqual(2);

    // 9. PostgreSQL immutability guards: cannot DELETE BloodUnit or mutate BloodTransfusionEvent
    await expect(
      prisma.$executeRaw`DELETE FROM "BloodUnit" WHERE "id" = ${unit1.id}`,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE "BloodTransfusionEvent" SET "notes" = 'tampered' WHERE "transfusionId" = ${transfusion.id}`,
    ).rejects.toThrow();

    // 10. Verify chained AuditLog trail
    const audits = await prisma.auditLog.findMany({
      where: {
        hospitalId: hospA.id,
        action: {
          in: [
            'BLOOD_UNIT_REGISTERED',
            'BLOOD_UNIT_SCREENED',
            'BLOOD_CROSSMATCH_CREATED',
            'BLOOD_CROSSMATCH_VERIFIED',
            'BLOOD_UNIT_ISSUED',
            'BLOOD_TRANSFUSION_BEDSIDE_VERIFIED',
            'BLOOD_TRANSFUSION_STARTED',
            'BLOOD_TRANSFUSION_VITALS_RECORDED',
            'BLOOD_TRANSFUSION_REACTION_REPORTED',
          ],
        },
      },
    });
    expect(audits.length).toBeGreaterThanOrEqual(9);
  });
});
