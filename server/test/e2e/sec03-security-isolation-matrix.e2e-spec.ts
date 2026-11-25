// server/test/e2e/sec03-security-isolation-matrix.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Phase 6 Batch 29 — SEC03 Cross-Tenant & RBAC Security Matrix + OPS03 Atomic Audit', () => {
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

  it('enforces strict cross-tenant 404 isolation, read-only RBAC 403 blocking, and single atomic chained audit logs across critical clinical & financial endpoints', async () => {
    const adminA = await auth.createTestUser('sec03-admin-a', 'synthetic', {
      permissions: [
        'patients:view',
        'patients:manage',
        'labs:view',
        'labs:manage',
        'radiology:view',
        'radiology:manage',
        'accounting:view',
        'accounting:manage',
        'acc:treasury:view',
        'acc:treasury:manage',
        'acc:treasury:approve',
        'surgery:view',
        'surgery:manage',
        'admin:view',
        'admin:manage',
      ],
    });
    const hospitalA = adminA.user.hospitalId;

    // Read-only viewer in Hospital A (ZERO :manage / :approve permissions)
    const viewerA = await auth.createTestUser('sec03-viewer-a', 'synthetic', {
      hospitalId: hospitalA,
      permissions: [
        'patients:view',
        'labs:view',
        'radiology:view',
        'accounting:view',
        'acc:treasury:view',
        'surgery:view',
        'admin:view',
      ],
    });

    // Full-privilege admin in Hospital B
    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_SEC03_B_${Date.now()}`,
        name: 'Hospital B Isolated Tenant',
        isActive: true,
      },
    });
    const adminB = await auth.createTestUser('sec03-admin-b', 'synthetic', {
      hospitalId: otherHospital.id,
      permissions: [
        'patients:view',
        'patients:manage',
        'labs:view',
        'labs:manage',
        'radiology:view',
        'radiology:manage',
        'accounting:view',
        'accounting:manage',
        'acc:treasury:view',
        'acc:treasury:manage',
        'acc:treasury:approve',
        'surgery:view',
        'surgery:manage',
        'admin:view',
        'admin:manage',
      ],
    });

    // =========================================================================
    // Seed Hospital A Domain Entities
    // =========================================================================
    const patientA = await db.patient.create({
      data: {
        hospitalId: hospitalA,
        mrn: 'SEC03-PAT-A1',
        fullName: 'مريض المنشأة أ',
        gender: 'MALE',
        isActive: true,
      },
    });

    const encounterA = await db.encounter.create({
      data: {
        hospitalId: hospitalA,
        patientId: patientA.id,
        type: 'IPD',
        status: 'OPEN',
      },
    });

    // Lab Test + QC Lot + QC Run in Hospital A
    const labTestA = await db.labTest.create({
      data: {
        hospitalId: hospitalA,
        code: 'SEC03-GLU',
        name: 'Glucose SEC03',
        isActive: true,
      },
    });
    const qcLotRes = await request(app.getHttpServer())
      .post('/lab/qc/lots')
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({
        testId: labTestA.id,
        analyzerName: 'Cobas-A',
        lotNumber: 'LOT-SEC03-1',
        level: 'LEVEL_2_NORMAL',
        targetMean: 100,
        targetSd: 5,
      })
      .expect(201);
    const qcLotAId = (qcLotRes.body as { id: number }).id;

    const qcRunRes = await request(app.getHttpServer())
      .post('/lab/qc/runs')
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ qcLotId: qcLotAId, measuredValue: 118 })
      .expect(201);
    const qcRunAId = (qcRunRes.body as { id: number }).id;

    // Radiology Study + Order in Hospital A
    const radStudyA = await db.radiologyStudy.create({
      data: {
        hospitalId: hospitalA,
        code: 'SEC03-CT',
        name: 'CT Chest SEC03',
        modality: 'CT',
        bodyPart: 'CHEST',
        isActive: true,
      },
    });
    const orderA = await db.order.create({
      data: {
        hospitalId: hospitalA,
        encounterId: encounterA.id,
        orderedById: adminA.user.id,
        type: 'RADIOLOGY',
        status: 'NEW',
      },
    });
    const radOrderA = await db.radiologyOrder.create({
      data: {
        orderId: orderA.id,
        studyId: radStudyA.id,
        status: 'IN_PROGRESS',
      },
    });

    // Financial Year, Period, Accounts, Currency, Bank Account, Reconciliation Session, Voucher in Hospital A
    const fyA = await db.financialYear.create({
      data: {
        hospitalId: hospitalA,
        name: 'FY 2026 A',
        code: 'FY-2026-A',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T23:59:59.999Z'),
        status: 'OPEN',
        isCurrent: true,
      },
    });
    await db.financialPeriod.create({
      data: {
        financialYearId: fyA.id,
        periodIndex: 11,
        periodCode: '2026-11',
        monthStartDate: new Date('2026-11-01T00:00:00.000Z'),
        monthEndDate: new Date('2026-11-30T23:59:59.999Z'),
        numberOfDays: 30,
        isOpen: true,
      },
    });
    const cashAccA = await db.account.create({
      data: {
        hospitalId: hospitalA,
        code: '100100',
        name: 'الصندوق أ',
        type: 'ASSET',
        isActive: true,
      },
    });
    const expenseAccA = await db.account.create({
      data: {
        hospitalId: hospitalA,
        code: '500100',
        name: 'مصروفات تشغيلية أ',
        type: 'EXPENSE',
        isActive: true,
      },
    });
    const usdBankAccGlA = await db.account.create({
      data: {
        hospitalId: hospitalA,
        code: '101200',
        name: 'بنك الدولار أ',
        type: 'ASSET',
        isActive: true,
      },
    });
    const lydA = await db.currency.create({
      data: {
        hospitalId: hospitalA,
        code: 'LYD',
        nameAr: 'دينار ليبي',
        nameEn: 'Libyan Dinar',
        symbol: 'د.ل',
        decimalPlaces: 3,
        isBase: true,
        isActive: true,
        createdById: adminA.user.id,
      },
    });
    const usdA = await db.currency.create({
      data: {
        hospitalId: hospitalA,
        code: 'USD',
        nameAr: 'دولار أمريكي',
        nameEn: 'US Dollar',
        symbol: '$',
        decimalPlaces: 2,
        isBase: false,
        isActive: true,
        createdById: adminA.user.id,
      },
    });
    const bankAccA = await db.bankAccount.create({
      data: {
        hospitalId: hospitalA,
        bankName: 'مصرف أ',
        accountNumber: 'ACC-A-001',
        accountId: usdBankAccGlA.id,
        currencyId: usdA.id,
        isActive: true,
        createdById: adminA.user.id,
      },
    });
    const reconA = await db.bankReconciliationSession.create({
      data: {
        hospitalId: hospitalA,
        bankAccountId: bankAccA.id,
        statementNumber: 'STMT-SEC03-A',
        periodStart: new Date('2026-11-01T00:00:00.000Z'),
        periodEnd: new Date('2026-11-30T00:00:00.000Z'),
        openingBalanceBank: '0.000',
        closingBalanceBank: '0.000',
        bookBalanceAsOfEnd: '0.000',
        reconciledBalance: '0.000',
        differenceAmount: '0.000',
        status: 'DRAFT',
        preparedById: adminA.user.id,
      },
    });

    // Voucher in Hospital A
    const voucherRes = await request(app.getHttpServer())
      .post('/accounting/vouchers')
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({
        type: 'PAYMENT',
        date: '2026-11-25',
        amount: 250,
        accountId: expenseAccA.id,
        cashAccountId: cashAccA.id,
        payeeOrPayer: 'مورد صيانة',
        notes: 'سند صرف اختبار SEC03',
      })
      .expect(201);
    const voucherAId = (voucherRes.body as { id: number }).id;

    // System Setting in Hospital A only
    const settingKeyA = 'SEC03_TENANT_A_ONLY_KEY';
    await db.systemSetting.create({
      data: {
        hospitalId: hospitalA,
        key: settingKeyA,
        value: 'INITIAL_VALUE',
        type: 'STRING',
        group: 'GENERAL',
      },
    });

    // Keep lydA referenced so linter is happy
    expect(lydA.code).toBe('LYD');

    // =========================================================================
    // MATRIX 1: Cross-Tenant Isolation (Admin B -> Hospital A resources = 403/404)
    // =========================================================================
    // ClinicalABACGuard blocks cross-tenant patient access at guard layer (403)
    const patProbe = await request(app.getHttpServer())
      .get(`/patients/${patientA.id}`)
      .set('Authorization', `Bearer ${adminB.accessToken}`);
    expect([403, 404]).toContain(patProbe.status);

    await request(app.getHttpServer())
      .get(`/lab/qc/lots/${qcLotAId}/levey-jennings`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post('/lab/qc/runs')
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .send({ qcLotId: qcLotAId, measuredValue: 100 })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/lab/qc/runs/${qcRunAId}/review`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .send({ correctiveAction: 'Cross-tenant unauthorized review' })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/radiology/dose/patients/${patientA.id}/summary`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/radiology/dose/orders/${radOrderA.id}`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .send({ modality: 'CT', bodyRegion: 'CHEST', dlpMgyCm: 400 })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/accounting/treasury/reconciliations/${reconA.id}`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/accounting/treasury/reconciliations/${reconA.id}/import-file`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .send({
        format: 'CSV',
        content:
          'date,reference,description,debit,credit\n2026-11-25,REF1,Test,0,100',
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/accounting/treasury/fx-revaluations')
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .send({
        bankAccountId: bankAccA.id,
        foreignBalance: '100.000',
        asOfDate: '2026-11-25T00:00:00.000Z',
      })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/accounting/vouchers/${voucherAId}`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .expect(404);

    // Cross-tenant IDOR check on voucher creation referencing Hospital A accounts
    await request(app.getHttpServer())
      .post('/accounting/vouchers')
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .send({
        type: 'PAYMENT',
        date: '2026-11-25',
        amount: 100,
        accountId: expenseAccA.id,
        cashAccountId: cashAccA.id,
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/accounting/vouchers/${voucherAId}/post`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/system-settings/${settingKeyA}`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/system-settings/${settingKeyA}`)
      .set('Authorization', `Bearer ${adminB.accessToken}`)
      .send({ value: 'TAMPERED' })
      .expect(404);

    // =========================================================================
    // MATRIX 2: Read-Only RBAC Enforcement (Viewer A: GET=200, Write=403)
    // =========================================================================
    // Allowed GET routes (also confirms labs:view works on /lab/qc/*!)
    const viewerLotsRes = await request(app.getHttpServer())
      .get('/lab/qc/lots')
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .expect(200);
    expect((viewerLotsRes.body as unknown[]).length).toBe(1);

    await request(app.getHttpServer())
      .get(`/radiology/dose/patients/${patientA.id}/summary`)
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/accounting/treasury/fx-revaluations')
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/accounting/vouchers/${voucherAId}`)
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/system-settings/${settingKeyA}`)
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .expect(200);

    // Blocked mutating/approval routes -> 403 Forbidden
    await request(app.getHttpServer())
      .post('/lab/qc/lots')
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .send({
        testId: labTestA.id,
        analyzerName: 'Cobas-A',
        lotNumber: 'LOT-FORBIDDEN',
        level: 'LEVEL_1_LOW',
        targetMean: 50,
        targetSd: 2,
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/lab/qc/runs')
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .send({ qcLotId: qcLotAId, measuredValue: 100 })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/radiology/dose/orders/${radOrderA.id}`)
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .send({ modality: 'CT', bodyRegion: 'CHEST', dlpMgyCm: 400 })
      .expect(403);

    await request(app.getHttpServer())
      .post('/accounting/treasury/fx-revaluations')
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .send({
        bankAccountId: bankAccA.id,
        foreignBalance: '100.000',
        asOfDate: '2026-11-25T00:00:00.000Z',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/accounting/treasury/reconciliations/${reconA.id}/import-file`)
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .send({
        format: 'CSV',
        content:
          'date,reference,description,debit,credit\n2026-11-25,REF1,Test,0,100',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/accounting/vouchers/${voucherAId}/post`)
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/system-settings/${settingKeyA}`)
      .set('Authorization', `Bearer ${viewerA.accessToken}`)
      .send({ value: 'FORBIDDEN' })
      .expect(403);

    // =========================================================================
    // MATRIX 3: OPS03 Atomic Audit Verification (Zero Duplicate Interceptor Rows)
    // =========================================================================
    const beforeInterceptorWrites = await db.auditLog.count({
      where: {
        hospitalId: hospitalA,
        action: { in: ['CREATE_ENTITY', 'UPDATE_ENTITY', 'DELETE_ENTITY'] },
      },
    });

    await request(app.getHttpServer())
      .patch(`/system-settings/${settingKeyA}`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .send({ value: 'UPDATED_SECURE_VALUE' })
      .expect(200);

    const settingAudits = await db.auditLog.findMany({
      where: { hospitalId: hospitalA, action: 'UPDATE_SYSTEM_SETTING' },
    });
    expect(settingAudits).toHaveLength(1);
    expect(settingAudits[0].hash).toBeTruthy();

    // Voucher post & cancel atomic chained audit (1 chained row each, zero AuditInterceptor rows)
    await request(app.getHttpServer())
      .post(`/accounting/vouchers/${voucherAId}/post`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .expect(201);

    const postAudits = await db.auditLog.findMany({
      where: { hospitalId: hospitalA, action: 'VOUCHER_POSTED' },
    });
    expect(postAudits).toHaveLength(1);
    expect(postAudits[0].hash).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/accounting/vouchers/${voucherAId}/cancel`)
      .set('Authorization', `Bearer ${adminA.accessToken}`)
      .expect(201);

    const cancelAudits = await db.auditLog.findMany({
      where: { hospitalId: hospitalA, action: 'VOUCHER_CANCELLED' },
    });
    expect(cancelAudits).toHaveLength(1);
    expect(cancelAudits[0].hash).toBeTruthy();

    const afterInterceptorWrites = await db.auditLog.count({
      where: {
        hospitalId: hospitalA,
        action: { in: ['CREATE_ENTITY', 'UPDATE_ENTITY', 'DELETE_ENTITY'] },
      },
    });
    expect(afterInterceptorWrites).toBe(beforeInterceptorWrites);
  });
});
