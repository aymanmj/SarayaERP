import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { seedFinancialAccounts } from '../financial-fixture';

describe('Radiology Clinical Modernization P0/P1 (Batch 20 — Migration #74)', () => {
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

  it('enforces multi-tenant catalog parity, contrast/eGFR/pregnancy safety, SHA-256 report lock, append-only addenda, JCI critical Read-Back, and order cancellation', async () => {
    const radUserA = await auth.createTestUser('rad-doc-a', 'Pass123!', {
      isDoctor: true,
      permissions: ['radiology:view', 'radiology:manage'],
    });
    const hospitalA = radUserA.user.hospitalId;

    const otherHospital = await db.hospital.create({
      data: { code: 'HOSP-RAD-B', name: 'Hospital B Radiology' },
    });
    const radUserB = await auth.createTestUser('rad-doc-b', 'Pass123!', {
      hospitalId: otherHospital.id,
      isDoctor: true,
      permissions: ['radiology:view', 'radiology:manage'],
    });

    await seedFinancialAccounts(db, hospitalA);
    const year = new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1) - 1);
    await db.financialYear.create({
      data: {
        hospitalId: hospitalA,
        code: `FY-${year}`,
        name: `FY ${year}`,
        startDate: start,
        endDate: end,
        status: 'OPEN',
        isCurrent: true,
        periods: {
          create: {
            periodCode: `P1-${year}`,
            periodIndex: 1,
            monthStartDate: start,
            monthEndDate: end,
            numberOfDays: 365,
            isOpen: true,
          },
        },
      },
    });

    const serviceItemA = await db.serviceItem.create({
      data: {
        hospitalId: hospitalA,
        name: 'CT Chest Contrast Service',
        type: 'RADIOLOGY',
        defaultPrice: '250.000',
      },
    });

    // 1. Both Hospital A and Hospital B can define identical study code CT-CHEST-C (global unique dropped)
    const studyARes = await request(app.getHttpServer())
      .post('/radiology/catalog/studies')
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({
        code: 'CT-CHEST-C',
        name: 'CT Chest with IV Contrast',
        modality: 'CT',
        bodyPart: 'CHEST',
        requiresContrast: true,
        contrastType: 'IODINATED',
        ionizingRadiation: true,
        minEgfrThreshold: 30,
        serviceItemId: serviceItemA.id,
      })
      .expect(201);
    const studyAId = (studyARes.body as { id: number }).id;

    await request(app.getHttpServer())
      .post('/radiology/catalog/studies')
      .auth(radUserB.accessToken, { type: 'bearer' })
      .send({
        code: 'CT-CHEST-C',
        name: 'Hospital B CT Chest',
        modality: 'CT',
        bodyPart: 'CHEST',
      })
      .expect(201);

    // 2. Multi-modality MWL Station & Report Template CRUD
    const stationRes = await request(app.getHttpServer())
      .post('/radiology/stations')
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({
        stationAet: 'CT_SCANNER_01',
        stationName: 'Siemens Somatom CT Room 1',
        modality: 'CT',
        roomLocation: 'Radiology Wing B',
      })
      .expect(201);
    const stationId = (stationRes.body as { id: number }).id;

    await request(app.getHttpServer())
      .post('/radiology/templates')
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({
        code: 'CT_CHEST_PE',
        title: 'CT Pulmonary Angiography Template',
        modality: 'CT',
        bodyPart: 'CHEST',
        techniqueTemplate: 'Helical thin-section CT pulmonary angiogram.',
        findingsTemplate: 'Pulmonary arteries opacified.',
        impressionTemplate: 'No pulmonary embolism.',
      })
      .expect(201);

    // 3. Create female patient of childbearing age with contrast allergy & high creatinine (low eGFR)
    const patient = await db.patient.create({
      data: {
        hospitalId: hospitalA,
        mrn: 'RAD-SAFE-01',
        fullName: 'Fatima Safety Patient',
        gender: 'FEMALE',
        dateOfBirth: new Date('1994-03-10T00:00:00Z'),
      },
    });
    const encounter = await db.encounter.create({
      data: {
        hospitalId: hospitalA,
        patientId: patient.id,
        type: 'IPD',
        status: 'OPEN',
        doctorId: radUserA.user.id,
      },
    });
    await db.patientAllergy.create({
      data: {
        patientId: patient.id,
        allergen: 'Iodinated Contrast',
        severity: 'SEVERE',
        reaction: 'Anaphylaxis',
      },
    });
    const creatTest = await db.labTest.create({
      data: {
        hospitalId: hospitalA,
        code: 'CREAT',
        name: 'Serum Creatinine',
      },
    });
    const creatParent = await db.order.create({
      data: {
        hospitalId: hospitalA,
        encounterId: encounter.id,
        orderedById: radUserA.user.id,
        type: 'LAB',
        status: 'COMPLETED',
        paymentStatus: 'PAID',
      },
    });
    await db.labOrder.create({
      data: {
        orderId: creatParent.id,
        testId: creatTest.id,
        resultStatus: 'COMPLETED',
        resultValue: '3.6',
        resultDate: new Date(),
      },
    });

    // 4. Pre-order safety check flags CONTRAST_ALLERGY + LOW_EGFR_CONTRAST + PREGNANCY_IONIZING_RADIATION
    const safetyRes = await request(app.getHttpServer())
      .post(`/radiology/encounters/${encounter.id}/safety-check`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({ studyIds: [studyAId], pregnancyStatus: 'PREGNANT' })
      .expect(201);
    const safetyBody = safetyRes.body as {
      canProceed: boolean;
      egfr: number;
      alerts: Array<{ code: string }>;
    };
    expect(safetyBody.canProceed).toBe(false);
    expect(safetyBody.egfr).toBeLessThan(30);
    expect(safetyBody.alerts.map((a) => a.code)).toEqual(
      expect.arrayContaining([
        'CONTRAST_ALLERGY',
        'LOW_EGFR_CONTRAST',
        'PREGNANCY_IONIZING_RADIATION',
      ]),
    );

    // Order without overrides MUST be rejected with 409 Conflict
    await request(app.getHttpServer())
      .post(`/radiology/encounters/${encounter.id}/orders`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({ studyIds: [studyAId], pregnancyStatus: 'PREGNANT', stationId })
      .expect(409);

    // Order WITH documented overrides succeeds
    const createdOrdersRes = await request(app.getHttpServer())
      .post(`/radiology/encounters/${encounter.id}/orders`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({
        studyIds: [studyAId],
        pregnancyStatus: 'NOT_PREGNANT',
        contrastOverrideReason:
          'Pre-medicated per ACR protocol; urgent rule-out PE',
        stationId,
      })
      .expect(201);
    const radOrderId = (createdOrdersRes.body as Array<{ id: number }>)[0].id;
    const radOrderRow = await db.radiologyOrder.findUniqueOrThrow({
      where: { id: radOrderId },
    });
    expect(radOrderRow.contrastSafetyChecked).toBe(true);
    expect(Number(radOrderRow.egfrAtOrder)).toBeLessThan(30);

    // Settle order payment so it is released to worklist
    await db.order.update({
      where: { id: radOrderRow.orderId },
      data: { paymentStatus: 'PAID' },
    });

    // 5. Start processing, save PRELIMINARY structured draft, then SIGN FINAL with Critical Finding
    await request(app.getHttpServer())
      .post(`/radiology/orders/${radOrderId}/start`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/radiology/orders/${radOrderId}/report`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({
        indicationText: 'Acute dyspnea and tachycardia',
        techniqueText: 'CTPA with IV contrast',
        findingsText: 'Large saddle filling defect in main pulmonary artery.',
        impressionText: 'CRITICAL: Acute saddle pulmonary embolism.',
        isCriticalFinding: false,
      })
      .expect(200);

    const signRes = await request(app.getHttpServer())
      .post(`/radiology/orders/${radOrderId}/sign`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({
        isCriticalFinding: true,
        criticalFindingSummary: 'Acute saddle pulmonary embolism',
      })
      .expect(201);
    expect(signRes.body).toMatchObject({
      reportStatus: 'FINAL',
      isCriticalFinding: true,
    });
    expect((signRes.body as { signatureHash: string }).signatureHash).toMatch(
      /^[0-9a-f]{64}$/,
    );

    // Cryptographic verification succeeds
    const verify1 = await request(app.getHttpServer())
      .get(`/radiology/orders/${radOrderId}/verify`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .expect(200);
    expect(verify1.body).toMatchObject({ valid: true, reason: 'VERIFIED' });

    // Silent overwrite of signed report is BLOCKED (409)
    await request(app.getHttpServer())
      .patch(`/radiology/orders/${radOrderId}/report`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({ impressionText: 'Tampered silently' })
      .expect(409);

    // Direct PostgreSQL mutation of signed report text is BLOCKED by trigger
    await expect(
      db.$executeRaw`UPDATE "RadiologyOrder" SET "impressionText" = 'SQL Tamper' WHERE id = ${radOrderId}`,
    ).rejects.toThrow(/immutable/i);

    // 6. JCI IPSG.2 Critical Notification Read-Back & Immutability
    const notifListRes = await request(app.getHttpServer())
      .get('/radiology/critical-notifications?pending=true')
      .auth(radUserA.accessToken, { type: 'bearer' })
      .expect(200);
    const notifs = notifListRes.body as Array<{ id: number }>;
    expect(notifs).toHaveLength(1);
    const notifId = notifs[0].id;

    await request(app.getHttpServer())
      .post(`/radiology/critical-notifications/${notifId}/read-back`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({
        notifiedToName: 'Dr. Tarek ICU',
        communicationChannel: 'PHONE',
        readBackNotes: 'Clinician read back saddle PE; heparin initiated.',
      })
      .expect(201);

    // Second read-back is blocked (409), and DB DELETE/UPDATE blocked by trigger
    await request(app.getHttpServer())
      .post(`/radiology/critical-notifications/${notifId}/read-back`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({
        notifiedToName: 'Dr. Duplicate',
        communicationChannel: 'PHONE',
      })
      .expect(409);

    await expect(
      db.$executeRaw`DELETE FROM "RadiologyCriticalNotification" WHERE id = ${notifId}`,
    ).rejects.toThrow(/cannot be deleted/i);

    // 7. Signed Append-Only Addendum -> AMENDED + intact hash chain + trigger lock
    const addRes = await request(app.getHttpServer())
      .post(`/radiology/orders/${radOrderId}/addenda`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({
        reason: 'Right ventricular strain measurement',
        addendumText: 'RV/LV ratio measures 1.4 indicating RV strain.',
      })
      .expect(201);
    const addendumId = (addRes.body as { addendum: { id: number } }).addendum
      .id;
    expect(addRes.body).toMatchObject({ reportStatus: 'AMENDED' });

    const verify2 = await request(app.getHttpServer())
      .get(`/radiology/orders/${radOrderId}/verify`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .expect(200);
    expect(verify2.body).toMatchObject({
      valid: true,
      reason: 'VERIFIED',
      reportStatus: 'AMENDED',
      addendaCount: 1,
    });

    await expect(
      db.$executeRaw`UPDATE "RadiologyReportAddendum" SET "addendumText" = 'Tampered' WHERE id = ${addendumId}`,
    ).rejects.toThrow(/append-only/i);

    // 8. Cannot cancel a completed order (409); CAN cancel a pending order; cross-tenant blocked (404)
    await request(app.getHttpServer())
      .post(`/radiology/orders/${radOrderId}/cancel`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({ reason: 'Cannot cancel completed' })
      .expect(409);

    await request(app.getHttpServer())
      .get(`/radiology/orders/${radOrderId}`)
      .auth(radUserB.accessToken, { type: 'bearer' })
      .expect(404);

    const pendingOrderRes = await request(app.getHttpServer())
      .post(`/radiology/encounters/${encounter.id}/orders`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({
        studyIds: [studyAId],
        pregnancyStatus: 'NOT_PREGNANT',
        contrastOverrideReason: 'Second test order to cancel',
      })
      .expect(201);
    const pendingRadOrderId = (pendingOrderRes.body as Array<{ id: number }>)[0]
      .id;

    await request(app.getHttpServer())
      .post(`/radiology/orders/${pendingRadOrderId}/cancel`)
      .auth(radUserA.accessToken, { type: 'bearer' })
      .send({ reason: 'Duplicate order requested by mistake' })
      .expect(201);

    const cancelledRow = await db.radiologyOrder.findUniqueOrThrow({
      where: { id: pendingRadOrderId },
      include: { order: true },
    });
    expect(cancelledRow.status).toBe('CANCELLED');
    expect(cancelledRow.order.status).toBe('CANCELLED');
  });
});
