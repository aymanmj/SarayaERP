// server/test/e2e/cap03-five-rights-cln03-cdss.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import {
  medicationScheduleDate,
  medicationScheduleZone,
  medicationSlots,
} from '../../src/nursing/medication-schedule';

describe('Phase 6 Batch 27 — CAP03/UI14 Full 5-Rights CLMA & CLN03 Unified CDSS / OrderSets Safety (Migration #81)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let auth: AuthHelper;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
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

  it('enforces full 5-Rights CLMA (patient, drug, dose, route, time window + PostgreSQL check) and CLN03 CDSS safety (active-med DDI, single-value renal eGFR, and atomic OrderSet medication batch blocking)', async () => {
    const clinician = await auth.createTestUser('b27-clinician', 'synthetic', {
      isDoctor: true,
      permissions: [
        'nursing:view',
        'nursing:station:view',
        'nursing:medications:administer',
        'nursing:medications:override',
        'pharmacy:view',
        'pharmacy:manage',
        'pharmacy:prescribe',
        'order-sets:view',
        'order-sets:manage',
      ],
    });
    const hospitalId = clinician.user.hospitalId;

    // Open Financial Year/Period + Pharmacy billing accounts so valid prescriptions succeed
    const now = new Date();
    const fy = await db.financialYear.create({
      data: {
        hospitalId,
        name: `FY ${now.getUTCFullYear()}`,
        code: `FY-${now.getUTCFullYear()}`,
        startDate: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
        endDate: new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59)),
        status: 'OPEN',
        isCurrent: true,
      },
    });
    await db.financialPeriod.create({
      data: {
        financialYearId: fy.id,
        periodIndex: now.getUTCMonth() + 1,
        periodCode: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
        monthStartDate: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        ),
        monthEndDate: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59),
        ),
        numberOfDays: 30,
        isOpen: true,
      },
    });
    const arPatient = await db.account.create({
      data: {
        hospitalId,
        code: '120100',
        name: 'ذمم المرضى',
        type: 'ASSET',
        isActive: true,
      },
    });
    const revPharm = await db.account.create({
      data: {
        hospitalId,
        code: '400700',
        name: 'إيرادات الصيدلية',
        type: 'REVENUE',
        isActive: true,
      },
    });
    await db.systemAccountMapping.createMany({
      data: [
        { hospitalId, key: 'RECEIVABLE_PATIENTS', accountId: arPatient.id },
        { hospitalId, key: 'REVENUE_PHARMACY', accountId: revPharm.id },
        { hospitalId, key: 'REVENUE_OUTPATIENT', accountId: revPharm.id },
      ],
    });

    // 70-year-old patient so Creatinine 4.5 mg/dL produces Cockcroft-Gault eGFR ~ 15.1 (< 30 CRITICAL)
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-B27-${Date.now()}`,
        fullName: 'مريض اختبار السلامة الدوائية الخماسية',
        gender: 'MALE',
        dateOfBirth: new Date('1956-01-01T00:00:00.000Z'),
        isActive: true,
      },
    });
    const encounter = await db.encounter.create({
      data: {
        hospitalId,
        patientId: patient.id,
        doctorId: clinician.user.id,
        type: 'IPD',
        status: 'OPEN',
      },
    });

    const ceftriaxone = await db.product.create({
      data: {
        hospitalId,
        code: 'DRUG-CEF-500',
        barcode: 'BC-CEF-500',
        name: 'Ceftriaxone 500mg IV',
        genericName: 'Ceftriaxone',
        type: 'DRUG',
        sellPrice: '15.0000',
        isActive: true,
      },
    });
    const warfarin = await db.product.create({
      data: {
        hospitalId,
        code: 'DRUG-WARF-5',
        barcode: 'BC-WARF-5',
        name: 'Warfarin 5mg',
        genericName: 'Warfarin',
        type: 'DRUG',
        sellPrice: '10.0000',
        isActive: true,
      },
    });
    const aspirin = await db.product.create({
      data: {
        hospitalId,
        code: 'DRUG-ASP-100',
        barcode: 'BC-ASP-100',
        name: 'Aspirin 100mg',
        genericName: 'Aspirin',
        type: 'DRUG',
        sellPrice: '5.0000',
        isActive: true,
      },
    });
    const vancomycin = await db.product.create({
      data: {
        hospitalId,
        code: 'DRUG-VANC-1G',
        barcode: 'BC-VANC-1G',
        name: 'Vancomycin 1g IV',
        genericName: 'Vancomycin',
        type: 'DRUG',
        sellPrice: '45.0000',
        isActive: true,
      },
    });

    // =========================================================================
    // PART A: CAP03 / UI14 Full 5-Rights CLMA Verification & Administration
    // =========================================================================
    const rx = await db.prescription.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        patientId: patient.id,
        doctorId: clinician.user.id,
        status: 'ACTIVE',
        pharmacistVerificationStatus: 'VERIFIED',
        createdAt: new Date(Date.now() - 48 * 3600 * 1000),
        items: {
          create: [
            {
              productId: ceftriaxone.id,
              dose: '500 mg',
              route: 'IV',
              frequency: 'QID',
              durationDays: 5,
              quantity: 20,
            },
          ],
        },
      },
      include: { items: true },
    });
    const rxItem = rx.items[0];

    // Pick a scheduled slot closest to now for testing
    const tz = await medicationScheduleZone(db, hospitalId);
    const todayKey = medicationScheduleDate(new Date(), tz);
    const slots = medicationSlots('QID', todayKey, tz);
    const closestSlot = slots.reduce((best, cur) =>
      Math.abs(cur.scheduledTime.getTime() - Date.now()) <
      Math.abs(best.scheduledTime.getTime() - Date.now())
        ? cur
        : best,
    );

    // 1. Verify 5-Rights with unit-normalized dose ("0.5 g" === "500 mg") & route alias ("Intravenous" === "IV")
    const verifyRes = await request(app.getHttpServer())
      .post(`/nursing/encounters/${encounter.id}/verify-five-rights`)
      .auth(clinician.accessToken, { type: 'bearer' })
      .send({
        prescriptionItemId: rxItem.id,
        patientBarcode: patient.mrn,
        drugBarcode: 'BC-CEF-500',
        confirmedDose: '0.5 g',
        confirmedRoute: 'Intravenous',
        scheduledSlot: closestSlot.scheduledSlot,
      })
      .expect(200);

    expect(verifyRes.body).toMatchObject({
      isPatientMatch: true,
      isDrugMatch: true,
      isBarcodeMatch: true,
      isDoseMatch: true,
      isRouteMatch: true,
      verificationScope: 'FULL_FIVE_RIGHTS',
    });

    // 2. Wrong dose (1000 mg vs 500 mg) without override -> BLOCKED 400
    await request(app.getHttpServer())
      .post(`/nursing/encounters/${encounter.id}/administer-barcode`)
      .auth(clinician.accessToken, { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        prescriptionItemId: rxItem.id,
        patientBarcode: patient.mrn,
        drugBarcode: 'BC-CEF-500',
        confirmedDose: '1000 mg',
        confirmedRoute: 'IV',
      })
      .expect(400);

    // 3. Wrong route (PO vs IV) without override -> BLOCKED 400
    await request(app.getHttpServer())
      .post(`/nursing/encounters/${encounter.id}/administer-barcode`)
      .auth(clinician.accessToken, { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        prescriptionItemId: rxItem.id,
        patientBarcode: patient.mrn,
        drugBarcode: 'BC-CEF-500',
        confirmedDose: '500 mg',
        confirmedRoute: 'PO',
      })
      .expect(400);

    // 4. Full 5-Rights administration (if closest QID slot is > 60 min from now, supply override; otherwise clean 5/5)
    const withinWindow =
      Math.abs(Date.now() - closestSlot.scheduledTime.getTime()) <=
      60 * 60 * 1000;
    const adminRes = await request(app.getHttpServer())
      .post(`/nursing/encounters/${encounter.id}/administer-barcode`)
      .auth(clinician.accessToken, { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        prescriptionItemId: rxItem.id,
        patientBarcode: patient.mrn,
        drugBarcode: 'BC-CEF-500',
        confirmedDose: '0.5 g',
        confirmedRoute: 'Intravenous',
        scheduledSlot: closestSlot.scheduledSlot,
        ...(withinWindow
          ? {}
          : {
              isEmergencyOverride: true,
              varianceReason:
                'Administered outside scheduled QID window in E2E test',
            }),
      })
      .expect(201);

    const adminBody = adminRes.body as {
      id: number;
      verificationScope: string;
      verifiedDose: string;
      verifiedRoute: string;
      isVerified5Rights: boolean;
      timeVarianceMinutes: number;
    };
    expect(adminBody.verificationScope).toBe('FULL_FIVE_RIGHTS');
    expect(adminBody.verifiedDose).toBe('0.5 g');
    expect(adminBody.verifiedRoute).toBe('Intravenous');
    expect(typeof adminBody.timeVarianceMinutes).toBe('number');
    expect(adminBody.isVerified5Rights).toBe(withinWindow);

    // 5. PostgreSQL CHECK constraint blocks forging isVerified5Rights = true without verifiedDose/verifiedRoute
    await expect(
      db.$executeRaw`INSERT INTO "MedicationAdministration" ("hospitalId", "encounterId", "prescriptionItemId", "performerId", "isBarcodeMatch", "isVerified5Rights", "verificationScope", "updatedAt") VALUES (${hospitalId}, ${encounter.id}, ${rxItem.id}, ${clinician.user.id}, true, true, 'PATIENT_AND_DRUG', NOW())`,
    ).rejects.toThrow(/MedicationAdministration_five_rights_chk/i);

    // =========================================================================
    // PART B: CLN03 CDSS Safety — Active-Drug DDI, Single-Value Renal eGFR, & OrderSet Atomic Batch
    // =========================================================================
    await db.drugInteraction.create({
      data: {
        drugAGeneric: 'Warfarin',
        drugBGeneric: 'Aspirin',
        severity: 'CONTRAINDICATED',
        description:
          'High risk of severe bleeding when Warfarin is combined with Aspirin',
        descriptionAr: 'خطر نزيف حاد عند الجمع بين الوارفارين والأسبرين',
        isActive: true,
      },
    });

    // 1. OrderSet containing BOTH Warfarin + Aspirin -> blocked BEFORE creating any prescription!
    const orderSet = await db.orderSet.create({
      data: {
        hospitalId,
        name: 'Cardiac Antithrombotic Bundle',
        contentKey: `cardiac-b27-${Date.now()}`,
        version: 1,
        status: 'PUBLISHED',
        isActive: true,
        createdById: clinician.user.id,
        items: {
          create: [
            {
              itemType: 'MEDICATION',
              productId: warfarin.id,
              dose: '5 mg',
              route: 'ORAL',
              frequency: 'DAILY',
              durationDays: 7,
              sortOrder: 0,
            },
            {
              itemType: 'MEDICATION',
              productId: aspirin.id,
              dose: '100 mg',
              route: 'ORAL',
              frequency: 'DAILY',
              durationDays: 7,
              sortOrder: 1,
            },
          ],
        },
      },
    });

    const countBeforeBlocked = await db.prescription.count({
      where: { encounterId: encounter.id },
    });

    const blockedSetRes = await request(app.getHttpServer())
      .post(`/order-sets/${orderSet.id}/execute`)
      .auth(clinician.accessToken, { type: 'bearer' })
      .send({ encounterId: encounter.id })
      .expect(400);

    expect((blockedSetRes.body as { code?: string }).code).toBe(
      'SAFETY_WARNING',
    );
    // Zero orphan prescriptions created!
    expect(
      await db.prescription.count({ where: { encounterId: encounter.id } }),
    ).toBe(countBeforeBlocked);

    // 2. Single-value LabOrder Creatinine (4.5 mg/dL -> eGFR ~ 15.1 < 30 CRITICAL) blocks Vancomycin
    const creaTest = await db.labTest.create({
      data: {
        hospitalId,
        code: 'CREA',
        name: 'Serum Creatinine',
        isActive: true,
      },
    });
    const orderForCrea = await db.order.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        orderedById: clinician.user.id,
        type: 'LAB',
        status: 'COMPLETED',
      },
    });
    await db.labOrder.create({
      data: {
        orderId: orderForCrea.id,
        testId: creaTest.id,
        resultValue: '4.5',
        resultUnit: 'mg/dL',
        resultStatus: 'COMPLETED',
        resultDate: new Date(),
      },
    });

    const renalBlocked = await request(app.getHttpServer())
      .post(`/pharmacy/encounters/${encounter.id}/prescriptions`)
      .auth(clinician.accessToken, { type: 'bearer' })
      .send({
        items: [
          {
            drugItemId: vancomycin.id,
            dose: '1000 mg',
            route: 'IV',
            frequency: 'BID',
            durationDays: 5,
            quantity: 10,
          },
        ],
      })
      .expect(400);
    expect((renalBlocked.body as { code?: string }).code).toBe(
      'SAFETY_WARNING',
    );

    // 3. Active-prescription DDI: patient receives Warfarin (ACTIVE), then prescribing Aspirin separately is blocked!
    await request(app.getHttpServer())
      .post(`/pharmacy/encounters/${encounter.id}/prescriptions`)
      .auth(clinician.accessToken, { type: 'bearer' })
      .send({
        items: [
          {
            drugItemId: warfarin.id,
            dose: '5 mg',
            route: 'ORAL',
            frequency: 'DAILY',
            durationDays: 7,
            quantity: 7,
          },
        ],
      })
      .expect(201);

    const activeDdiBlocked = await request(app.getHttpServer())
      .post(`/pharmacy/encounters/${encounter.id}/prescriptions`)
      .auth(clinician.accessToken, { type: 'bearer' })
      .send({
        items: [
          {
            drugItemId: aspirin.id,
            dose: '100 mg',
            route: 'ORAL',
            frequency: 'DAILY',
            durationDays: 7,
            quantity: 7,
          },
        ],
      })
      .expect(400);
    expect((activeDdiBlocked.body as { code?: string }).code).toBe(
      'SAFETY_WARNING',
    );

    // 4. Executing OrderSet WITH explicit overrideSafety + overrideReason succeeds atomically (1 unified prescription)
    const overriddenSetRes = await request(app.getHttpServer())
      .post(`/order-sets/${orderSet.id}/execute`)
      .auth(clinician.accessToken, { type: 'bearer' })
      .send({
        encounterId: encounter.id,
        overrideSafety: true,
        overrideReason:
          'Cardiology specialist dual-therapy approved with close INR monitoring',
      })
      .expect(201);
    const overriddenBody = overriddenSetRes.body as {
      prescriptions: Array<{ id: number; items?: unknown[] }>;
      total: number;
    };
    expect(overriddenBody.prescriptions.length).toBe(1);
    expect(overriddenBody.total).toBe(2);
  });
});
