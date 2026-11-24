import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { EncounterType, Gender, ServiceType } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

interface LabTestRes {
  id: number;
  code: string;
  parameters: Array<{ id: number; code: string; name: string }>;
}

interface LabOrderRes {
  id: number;
  orderId: number;
  isVerified: boolean;
  isAmended: boolean;
  verificationHash: string | null;
  lastAmendmentReason: string | null;
  results: Array<{
    id: number;
    parameterName: string;
    value: string;
    flag: string | null;
    range: string | null;
  }>;
  criticalNotifications: Array<{
    id: number;
    parameterName: string;
    criticalValue: string;
    flag: string;
    status: string;
  }>;
  amendments?: Array<{
    id: number;
    reason: string;
    previousHash: string | null;
    newHash: string;
  }>;
}

describe('E2E Tests - Laboratory P0/P1 Modernization (Multi-Tenant Catalog, IDOR Fix, Money Billing, Multi-Parameter Panels, Age/Sex Ranges, JCI Read-Back & Amendments)', () => {
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

  it('enforces multi-tenant LabTest codes, closes LabOrders IDOR, validates OPD paywall & Money billing, auto-flags age/sex ranges, triggers JCI critical read-back, SHA-256 verification lock, immutable amendments, and order cancellation', async () => {
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const server = app.getHttpServer();

    const hospA = await prisma.hospital.create({
      data: { name: 'Saraya Lab A', code: `HOSP-LAB-A-${Date.now()}` },
    });
    const hospB = await prisma.hospital.create({
      data: { name: 'Saraya Lab B', code: `HOSP-LAB-B-${Date.now()}` },
    });

    const labUserA = await auth.createTestUser('lab-mod-a', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'labs:view',
        'labs:manage',
        'lab:results:verify',
        'lab-orders:view',
        'lab-orders:manage',
      ],
    });
    const labUserB = await auth.createTestUser('lab-mod-b', 'password', {
      hospitalId: hospB.id,
      permissions: [
        'labs:view',
        'labs:manage',
        'lab:results:verify',
        'lab-orders:view',
        'lab-orders:manage',
      ],
    });

    const now = new Date();
    const fy = await prisma.financialYear.create({
      data: {
        hospitalId: hospA.id,
        name: `FY-${now.getUTCFullYear()}`,
        code: `FY-${now.getUTCFullYear()}`,
        startDate: new Date(`${now.getUTCFullYear()}-01-01T00:00:00.000Z`),
        endDate: new Date(`${now.getUTCFullYear()}-12-31T00:00:00.000Z`),
        status: 'OPEN',
        isCurrent: true,
      },
    });
    await prisma.financialPeriod.create({
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

    // 1. Multi-tenant catalog: BOTH Hospital A and Hospital B can define code 'CBC' (global @unique dropped!)
    const svcA = await prisma.serviceItem.create({
      data: {
        hospitalId: hospA.id,
        code: 'SRV-CBC-A',
        name: 'CBC Test',
        type: ServiceType.LAB,
        defaultPrice: '45.500',
      },
    });
    const cbcARes = await request(server)
      .post('/lab/catalog/tests')
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .send({
        code: 'CBC',
        name: 'Complete Blood Count',
        arabicName: 'صورة دم كاملة',
        category: 'Hematology',
        serviceItemId: svcA.id,
        parameters: [
          { code: 'HGB', name: 'Hemoglobin', unit: 'g/dL' },
          { code: 'K', name: 'Potassium', unit: 'mmol/L' },
        ],
      })
      .expect(201);
    const cbcA = cbcARes.body as LabTestRes;
    expect(cbcA.code).toBe('CBC');
    expect(cbcA.parameters).toHaveLength(2);

    // Hospital B creates the exact same code 'CBC' -> succeeds (201)
    await request(server)
      .post('/lab/catalog/tests')
      .set('Authorization', `Bearer ${labUserB.accessToken}`)
      .send({
        code: 'CBC',
        name: 'Complete Blood Count (Hosp B)',
        category: 'Hematology',
      })
      .expect(201);

    // Configure Age/Sex Reference Ranges for Hospital A CBC parameters
    const hgbParam = cbcA.parameters.find((p) => p.code === 'HGB')!;
    const kParam = cbcA.parameters.find((p) => p.code === 'K')!;

    await request(server)
      .post('/lab/catalog/reference-ranges')
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .send({
        labTestId: cbcA.id,
        parameterId: hgbParam.id,
        gender: 'MALE',
        ageMinDays: 6570,
        ageMaxDays: 50000,
        normalLow: '13.5',
        normalHigh: '17.5',
        criticalLow: '7.0',
        criticalHigh: '20.0',
        unit: 'g/dL',
      })
      .expect(201);

    await request(server)
      .post('/lab/catalog/reference-ranges')
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .send({
        labTestId: cbcA.id,
        parameterId: kParam.id,
        gender: 'ANY',
        ageMinDays: 0,
        ageMaxDays: 50000,
        normalLow: '3.5',
        normalHigh: '5.1',
        criticalLow: '2.5',
        criticalHigh: '6.5',
        unit: 'mmol/L',
      })
      .expect(201);

    // 2. Create patient & OPD encounter in Hospital A
    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospA.id,
        mrn: 'MRN-LAB-MOD-1',
        fullName: 'أحمد مصباح',
        gender: Gender.MALE,
        dateOfBirth: new Date('1988-03-15T00:00:00.000Z'),
      },
    });
    const encounter = await prisma.encounter.create({
      data: {
        hospitalId: hospA.id,
        patientId: patient.id,
        type: EncounterType.OPD,
        status: 'OPEN',
      },
    });

    // Create Lab Order via /lab/encounters/:id/orders (uses Money & creates invoice)
    const createRes = await request(server)
      .post(`/lab/encounters/${encounter.id}/orders`)
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .send({ testIds: [cbcA.id], notes: 'Routine check' })
      .expect(201);
    const createdOrders = createRes.body as LabOrderRes[];
    expect(createdOrders).toHaveLength(1);
    const labOrderId = createdOrders[0].id;
    const parentOrderId = createdOrders[0].orderId;

    // 3. Verify P0 IDOR fix on LabOrdersController: Hospital B MUST get [] for Hospital A's encounter
    const idorCheck = await request(server)
      .get(`/encounters/${encounter.id}/lab-orders`)
      .set('Authorization', `Bearer ${labUserB.accessToken}`)
      .expect(200);
    expect(idorCheck.body).toEqual([]);

    // 4. OPD Paywall enforcement: unpaid order cannot start or complete (409)
    await request(server)
      .post(`/lab/orders/${labOrderId}/start`)
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .expect(409);

    await prisma.order.update({
      where: { id: parentOrderId },
      data: { paymentStatus: 'PAID' },
    });

    // 5. Enter multi-parameter panel with LOW HGB (12.0 -> L) and CRITICAL HIGH K (6.9 -> HH)
    const completeRes = await request(server)
      .patch(`/lab/orders/${labOrderId}/complete`)
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .send({
        parameters: [
          {
            parameterId: hgbParam.id,
            parameterName: 'Hemoglobin',
            value: '12.0',
            unit: 'g/dL',
          },
          {
            parameterId: kParam.id,
            parameterName: 'Potassium',
            value: '6.9',
            unit: 'mmol/L',
          },
        ],
      })
      .expect(200);
    const completed = completeRes.body as LabOrderRes;
    expect(completed.results).toHaveLength(2);
    expect(
      completed.results.find((r) => r.parameterName === 'Hemoglobin')?.flag,
    ).toBe('L');
    expect(
      completed.results.find((r) => r.parameterName === 'Potassium')?.flag,
    ).toBe('HH');
    expect(completed.criticalNotifications).toHaveLength(1);
    const critNotifId = completed.criticalNotifications[0].id;

    // 6. JCI IPSG.2 Critical Value Read-Back
    // Reject unconfirmed read-back (400)
    await request(server)
      .post(`/lab/critical-notifications/${critNotifId}/read-back`)
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .send({
        notifiedClinicianName: 'د. خالد',
        notificationMethod: 'PHONE',
        readBackConfirmed: false,
        readBackValue: '6.9',
      })
      .expect(400);

    // Document confirmed read-back -> ACKNOWLEDGED_READBACK
    const readBackRes = await request(server)
      .post(`/lab/critical-notifications/${critNotifId}/read-back`)
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .send({
        notifiedClinicianName: 'د. خالد الباطنية',
        notificationMethod: 'PHONE',
        readBackConfirmed: true,
        readBackValue: '6.9 mmol/L',
        notes:
          'الطبيب أكد إعادة قراءة البوتاسيوم الحرج وبدأ بروتوكول فرط البوتاسيوم',
      })
      .expect(201);
    expect((readBackRes.body as { status: string }).status).toBe(
      'ACKNOWLEDGED_READBACK',
    );

    // PostgreSQL immutability trigger blocks deleting or mutating acknowledged read-back
    await expect(
      prisma.$executeRaw`DELETE FROM "LabCriticalNotification" WHERE "id" = ${critNotifId}`,
    ).rejects.toThrow();

    // 7. Final Verification (SHA-256 lock)
    const verifyRes = await request(server)
      .post(`/lab/orders/${labOrderId}/verify`)
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .expect(201);
    const verified = verifyRes.body as LabOrderRes;
    expect(verified.isVerified).toBe(true);
    expect(verified.verificationHash).toHaveLength(64);

    // Direct overwrite on verified order MUST fail (409)
    await request(server)
      .patch(`/lab/orders/${labOrderId}/complete`)
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .send({ resultValue: '999' })
      .expect(409);

    // Cancelling verified order MUST fail (409)
    await request(server)
      .post(`/lab/orders/${labOrderId}/cancel`)
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .send({ reason: 'خطأ' })
      .expect(409);

    // 8. Signed Amendment with immutable LabResultAmendment record
    const amendRes = await request(server)
      .post(`/lab/orders/${labOrderId}/amend`)
      .set('Authorization', `Bearer ${labUserA.accessToken}`)
      .send({
        reason: 'إعادة تحليل العينة بعد استبعاد انحلال الدم (Hemolysis)',
        parameters: [
          {
            parameterId: hgbParam.id,
            parameterName: 'Hemoglobin',
            value: '12.0',
            unit: 'g/dL',
            flag: 'L',
          },
          {
            parameterId: kParam.id,
            parameterName: 'Potassium',
            value: '4.4',
            unit: 'mmol/L',
            flag: 'N',
          },
        ],
      })
      .expect(201);
    const amended = amendRes.body as LabOrderRes;
    expect(amended.isAmended).toBe(true);
    expect(amended.verificationHash).not.toBe(verified.verificationHash);
    expect(amended.amendments).toHaveLength(1);
    expect(amended.amendments?.[0].previousHash).toBe(
      verified.verificationHash,
    );

    // PostgreSQL append-only guard blocks deleting LabResultAmendment
    await expect(
      prisma.$executeRaw`DELETE FROM "LabResultAmendment" WHERE "labOrderId" = ${labOrderId}`,
    ).rejects.toThrow();
  });
});
