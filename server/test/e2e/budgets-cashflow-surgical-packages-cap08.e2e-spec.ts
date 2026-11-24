// server/test/e2e/budgets-cashflow-surgical-packages-cap08.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Batch 25 Corporate Budgets, Cash Flow Statement, Tafqeet & CAP08 Surgical Packages / DRG Bundled Billing (Migration #79)', () => {
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

  it('enforces multi-tenant budgets vs actual, reconciled cash flow statement + Tafqeet, CAP08 DRG package caps/overages + SHA-256 settlement immutability, and tenant isolation', async () => {
    const admin = await auth.createTestUser('b25-admin', 'synthetic', {
      permissions: [
        'accounting:view',
        'accounting:manage',
        'surgery:view',
        'surgery:manage',
        'billing:view',
        'billing:manage',
      ],
    });
    const hospitalId = admin.user.hospitalId;

    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_B25_OTHER_${Date.now()}`,
        name: 'Other Hospital B25',
        isActive: true,
      },
    });
    const foreignUser = await auth.createTestUser('b25-foreign', 'synthetic', {
      hospitalId: otherHospital.id,
      permissions: [
        'accounting:view',
        'accounting:manage',
        'surgery:view',
        'surgery:manage',
      ],
    });

    // 1. Accounting setup: FinancialYear, Cash/Bank/Revenue/Expense accounts + entries
    const fy = await db.financialYear.create({
      data: {
        hospitalId,
        name: 'FY 2026',
        code: 'FY-2026',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T23:59:59.999Z'),
        status: 'OPEN',
        isCurrent: true,
      },
    });
    const period11 = await db.financialPeriod.create({
      data: {
        financialYearId: fy.id,
        periodIndex: 11,
        periodCode: '2026-11',
        monthStartDate: new Date('2026-11-01T00:00:00.000Z'),
        monthEndDate: new Date('2026-11-30T23:59:59.999Z'),
        numberOfDays: 30,
        isOpen: true,
      },
    });

    const cashAcc = await db.account.create({
      data: {
        hospitalId,
        code: '100100',
        name: 'الخزينة الرئيسية',
        type: 'ASSET',
        isActive: true,
      },
    });
    const bankAcc = await db.account.create({
      data: {
        hospitalId,
        code: '101100',
        name: 'المصرف الرئيسي',
        type: 'ASSET',
        isActive: true,
      },
    });
    const revAcc = await db.account.create({
      data: {
        hospitalId,
        code: '400100',
        name: 'إيرادات العيادات والعمليات',
        type: 'REVENUE',
        isActive: true,
      },
    });
    const expAcc = await db.account.create({
      data: {
        hospitalId,
        code: '500100',
        name: 'مصروف الرواتب والتشغيل',
        type: 'EXPENSE',
        isActive: true,
      },
    });
    await db.systemAccountMapping.createMany({
      data: [
        { hospitalId, key: 'CASH_MAIN', accountId: cashAcc.id, isActive: true },
        { hospitalId, key: 'BANK_MAIN', accountId: bankAcc.id, isActive: true },
      ],
    });

    // Opening cash balance: 1000.000
    await db.accountingEntry.create({
      data: {
        hospitalId,
        entryDate: new Date('2026-01-01T00:00:00.000Z'),
        financialYearId: fy.id,
        sourceModule: 'OPENING',
        description: 'رصيد افتتاحي',
        lines: {
          create: [
            { accountId: cashAcc.id, debit: '1000.000', credit: '0.000' },
            { accountId: revAcc.id, debit: '0.000', credit: '1000.000' },
          ],
        },
      },
    });
    // Operating cash inflow: +5000.000 revenue
    await db.accountingEntry.create({
      data: {
        hospitalId,
        entryDate: new Date('2026-11-10T00:00:00.000Z'),
        financialYearId: fy.id,
        financialPeriodId: period11.id,
        sourceModule: 'BILLING',
        description: 'تحصيل عمليات',
        lines: {
          create: [
            { accountId: cashAcc.id, debit: '5000.000', credit: '0.000' },
            { accountId: revAcc.id, debit: '0.000', credit: '5000.000' },
          ],
        },
      },
    });
    // Operating cash outflow: -1200.000 expense
    await db.accountingEntry.create({
      data: {
        hospitalId,
        entryDate: new Date('2026-11-15T00:00:00.000Z'),
        financialYearId: fy.id,
        financialPeriodId: period11.id,
        sourceModule: 'MANUAL',
        description: 'مصروف تشغيل',
        lines: {
          create: [
            { accountId: expAcc.id, debit: '1200.000', credit: '0.000' },
            { accountId: cashAcc.id, debit: '0.000', credit: '1200.000' },
          ],
        },
      },
    });
    // Internal transfer Cash -> Bank (2000.000) -> MUST cancel out in Cash Flow Statement!
    await db.accountingEntry.create({
      data: {
        hospitalId,
        entryDate: new Date('2026-11-18T00:00:00.000Z'),
        financialYearId: fy.id,
        financialPeriodId: period11.id,
        sourceModule: 'VOUCHER',
        description: 'إيداع بنكي داخلي',
        lines: {
          create: [
            { accountId: bankAcc.id, debit: '2000.000', credit: '0.000' },
            { accountId: cashAcc.id, debit: '0.000', credit: '2000.000' },
          ],
        },
      },
    });

    // 2. Budget upsert (Expense budget 2000.000 vs actual 1200.000 -> favorable variance +800.000, utilization 60%)
    await request(app.getHttpServer())
      .post('/accounting/corporate/budgets')
      .auth(admin.accessToken, { type: 'bearer' })
      .send({
        financialYearId: fy.id,
        accountId: expAcc.id,
        period11: 2000,
      })
      .expect(201);

    const bvaRes = await request(app.getHttpServer())
      .get(`/accounting/corporate/budgets/vs-actual?financialYearId=${fy.id}`)
      .auth(admin.accessToken, { type: 'bearer' })
      .expect(200);
    expect(bvaRes.body).toMatchObject({
      financialYearId: fy.id,
      rows: [
        {
          accountCode: '500100',
          totalBudget: '2000.000',
          totalActual: '1200.000',
          variance: '800.000',
        },
      ],
    });

    // 3. Statement of Cash Flows: opening 1000, netChange +3800 (5000 - 1200), closing 4800, diff 0.000
    const cfRes = await request(app.getHttpServer())
      .get(
        '/accounting/corporate/cash-flow?startDate=2026-11-01&endDate=2026-11-30',
      )
      .auth(admin.accessToken, { type: 'bearer' })
      .expect(200);
    expect(cfRes.body).toMatchObject({
      openingCashBalance: '1000.000',
      netCashChange: '3800.000',
      closingCashBalance: '4800.000',
      reconciliationDifference: '0.000',
      classificationComplete: true,
    });

    // Tafqeet endpoint
    const tafRes = await request(app.getHttpServer())
      .get('/accounting/corporate/tafqeet?amount=1250.500&currency=LYD')
      .auth(admin.accessToken, { type: 'bearer' })
      .expect(200);
    expect((tafRes.body as { voucherWords: string }).voucherWords).toBe(
      'فقط ألف ومائتان وخمسون دينار ليبي وخمسمائة درهم لا غير',
    );

    // 4. CAP08: Surgical Package & DRG Bundled Billing Lifecycle
    const pkgRes = await request(app.getHttpServer())
      .post('/surgery/packages')
      .auth(admin.accessToken, { type: 'bearer' })
      .send({
        code: 'PKG-CHOLE-01',
        name: 'حزمة استئصال المرارة بالمنظار',
        drgCode: 'DRG-418',
        packagePrice: 3500,
        includedStayDays: 2,
        inclusions: [
          { category: 'SURGERY', coverageMode: 'INCLUDED_UNLIMITED' },
          { category: 'ROOM', coverageMode: 'INCLUDED_CAPPED', capAmount: 600 },
          { category: 'LAB', coverageMode: 'INCLUDED_CAPPED', capAmount: 250 },
          { category: 'RADIOLOGY', coverageMode: 'EXCLUDED' },
        ],
      })
      .expect(201);
    const packageId = (pkgRes.body as { id: number }).id;

    // Create patient + encounter + service items + charges across categories
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-CAP08-${Date.now()}`,
        fullName: 'مريض حزمة جراحية',
        gender: 'MALE',
      },
    });
    const encounter = await db.encounter.create({
      data: { hospitalId, patientId: patient.id, type: 'IPD', status: 'OPEN' },
    });

    const svcSurgery = await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'SVC-SURG-1',
        name: 'عملية منظار',
        type: 'SURGERY',
        defaultPrice: '2200.000',
      },
    });
    const svcRoom = await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'SVC-ROOM-1',
        name: 'إقامة جناح',
        type: 'BED',
        defaultPrice: '400.000',
      },
    });
    const svcLab = await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'SVC-LAB-1',
        name: 'تحاليل ما قبل العملية',
        type: 'LAB',
        defaultPrice: '200.000',
      },
    });
    const svcRad = await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'SVC-RAD-1',
        name: 'أشعة مقطعية مستثناة',
        type: 'RADIOLOGY',
        defaultPrice: '450.000',
      },
    });

    await db.encounterCharge.createMany({
      data: [
        {
          hospitalId,
          encounterId: encounter.id,
          serviceItemId: svcSurgery.id,
          sourceType: 'SURGERY',
          quantity: 1,
          unitPrice: '2200.0000',
          totalAmount: '2200.000',
        },
        {
          hospitalId,
          encounterId: encounter.id,
          serviceItemId: svcRoom.id,
          sourceType: 'BED',
          quantity: 2,
          unitPrice: '400.0000',
          totalAmount: '800.000',
        },
        {
          hospitalId,
          encounterId: encounter.id,
          serviceItemId: svcLab.id,
          sourceType: 'LAB_ORDER',
          quantity: 1,
          unitPrice: '200.0000',
          totalAmount: '200.000',
        },
        {
          hospitalId,
          encounterId: encounter.id,
          serviceItemId: svcRad.id,
          sourceType: 'RADIOLOGY_ORDER',
          quantity: 1,
          unitPrice: '450.0000',
          totalAmount: '450.000',
        },
      ],
    });

    // Enroll encounter into package
    const enrollRes = await request(app.getHttpServer())
      .post('/surgery/packages/enrollments')
      .auth(admin.accessToken, { type: 'bearer' })
      .send({ encounterId: encounter.id, packageId })
      .expect(201);
    const enrollmentId = (enrollRes.body as { id: number }).id;

    // Duplicate enrollment on same encounter blocked (409)
    await request(app.getHttpServer())
      .post('/surgery/packages/enrollments')
      .auth(admin.accessToken, { type: 'bearer' })
      .send({ encounterId: encounter.id, packageId })
      .expect(409);

    // Preview reconciliation: actual 3650, covered 3000, overage 650 (200 room + 450 rad), netBillable 4150, variance +500
    const prevRes = await request(app.getHttpServer())
      .get(`/surgery/packages/enrollments/${enrollmentId}/preview`)
      .auth(admin.accessToken, { type: 'bearer' })
      .expect(200);
    expect(prevRes.body).toMatchObject({
      reconciliation: {
        packagePrice: '3500.000',
        actualChargesTotal: '3650.000',
        coveredByPackageAmount: '3000.000',
        overageAmount: '650.000',
        netBillableTotal: '4150.000',
        packageVariance: '500.000',
      },
    });

    // Settle & seal with SHA-256
    const settleRes = await request(app.getHttpServer())
      .post(`/surgery/packages/enrollments/${enrollmentId}/settle`)
      .auth(admin.accessToken, { type: 'bearer' })
      .send({ notes: 'Final DRG bundled settlement on discharge' })
      .expect(201);
    expect((settleRes.body as { status: string }).status).toBe('SETTLED');

    const verifyRes = await request(app.getHttpServer())
      .get(`/surgery/packages/enrollments/${enrollmentId}/verify`)
      .auth(admin.accessToken, { type: 'bearer' })
      .expect(200);
    expect(verifyRes.body).toMatchObject({ valid: true, status: 'SETTLED' });

    // PostgreSQL immutability trigger blocks tampering or deleting SETTLED enrollment
    await expect(
      db.$executeRaw`UPDATE "EncounterPackageEnrollment" SET "overageAmount" = 0 WHERE id = ${enrollmentId}`,
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.$executeRaw`DELETE FROM "EncounterPackageEnrollment" WHERE id = ${enrollmentId}`,
    ).rejects.toThrow(/immutable/i);

    // 5. Cross-Tenant Isolation (404)
    await request(app.getHttpServer())
      .get(`/surgery/packages/enrollments/${enrollmentId}/verify`)
      .auth(foreignUser.accessToken, { type: 'bearer' })
      .expect(404);
  });
});
