// server/test/e2e/cap09-fx-reval-cap02-qc-cap13-rdsr.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { Money } from '../../src/common/utils/money.util';

describe('Phase 6 Batch 28 — CAP09 CSV/MT940 + FX Revaluation, CAP02 Lab Westgard QC, CAP13 Radiology RDSR (Migration #82)', () => {
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

  it('verifies CSV/MT940 bank file import + unrealized FX revaluation GL, Lab Westgard QC + 4-eyes review, Radiology RDSR + 100 mSv incident escalation, triggers & tenant isolation', async () => {
    const userA = await auth.createTestUser('b28-user-a', 'synthetic', {
      permissions: [
        'acc:treasury:view',
        'acc:treasury:manage',
        'acc:treasury:approve',
        'lab:view',
        'lab:manage',
        'radiology:view',
        'radiology:manage',
      ],
    });
    const hospitalId = userA.user.hospitalId;

    const userB = await auth.createTestUser('b28-user-b', 'synthetic', {
      hospitalId,
      permissions: [
        'acc:treasury:view',
        'acc:treasury:approve',
        'lab:view',
        'lab:manage',
      ],
    });

    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_B28_OTHER_${Date.now()}`,
        name: 'Other Hospital B28',
        isActive: true,
      },
    });
    const foreignUser = await auth.createTestUser('b28-foreign', 'synthetic', {
      hospitalId: otherHospital.id,
      permissions: [
        'acc:treasury:approve',
        'lab:view',
        'lab:manage',
        'radiology:view',
        'radiology:manage',
      ],
    });

    // =========================================================================
    // PART A: CAP09 CSV & SWIFT MT940 Import + Period-End FX Revaluation GL
    // =========================================================================
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
    const fp = await db.financialPeriod.create({
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

    const usdBankGl = await db.account.create({
      data: {
        hospitalId,
        code: '101200',
        name: 'حساب مصرفي بالدولار USD',
        type: 'ASSET',
        isActive: true,
      },
    });
    const equityAcc = await db.account.create({
      data: {
        hospitalId,
        code: '300100',
        name: 'رأس المال',
        type: 'EQUITY',
        isActive: true,
      },
    });
    const fxGainLossAcc = await db.account.create({
      data: {
        hospitalId,
        code: '400950',
        name: 'أرباح وخسائر فروق العملة',
        type: 'REVENUE',
        isActive: true,
      },
    });
    await db.systemAccountMapping.create({
      data: {
        hospitalId,
        key: 'FX_GAIN_LOSS',
        accountId: fxGainLossAcc.id,
      },
    });

    // Initial book balance of USD bank account: $1000 booked at 4.800000 = 4800.000 LYD
    await db.accountingEntry.create({
      data: {
        hospitalId,
        entryDate: new Date('2026-11-01T00:00:00.000Z'),
        financialYearId: fy.id,
        financialPeriodId: fp.id,
        sourceModule: 'MANUAL',
        description: 'رصيد افتتاحي $1000 @ 4.800',
        lines: {
          create: [
            { accountId: usdBankGl.id, debit: '4800.000', credit: '0.000' },
            { accountId: equityAcc.id, debit: '0.000', credit: '4800.000' },
          ],
        },
      },
    });

    const lydRes = await request(app.getHttpServer())
      .post('/accounting/treasury/currencies')
      .auth(userA.accessToken, { type: 'bearer' })
      .send({
        code: 'LYD',
        nameAr: 'دينار ليبي',
        nameEn: 'Libyan Dinar',
        symbol: 'د.ل',
        decimalPlaces: 3,
        isBase: true,
      })
      .expect(201);
    const lydId = (lydRes.body as { id: number }).id;

    const usdRes = await request(app.getHttpServer())
      .post('/accounting/treasury/currencies')
      .auth(userA.accessToken, { type: 'bearer' })
      .send({
        code: 'USD',
        nameAr: 'دولار أمريكي',
        nameEn: 'US Dollar',
        symbol: '$',
        decimalPlaces: 2,
        isBase: false,
      })
      .expect(201);
    const usdId = (usdRes.body as { id: number }).id;

    // Record & 4-eyes verify closing FX rate USD->LYD = 4.950000
    const rateRes = await request(app.getHttpServer())
      .post('/accounting/treasury/exchange-rates')
      .auth(userA.accessToken, { type: 'bearer' })
      .send({
        fromCurrencyId: usdId,
        toCurrencyId: lydId,
        rate: '4.950000',
        effectiveDate: '2026-11-25',
        source: 'CBL_OFFICIAL',
      })
      .expect(201);
    const rateId = (rateRes.body as { id: number }).id;

    await request(app.getHttpServer())
      .post(`/accounting/treasury/exchange-rates/${rateId}/verify`)
      .auth(userB.accessToken, { type: 'bearer' })
      .expect(201);

    const bankAccRes = await request(app.getHttpServer())
      .post('/accounting/treasury/bank-accounts')
      .auth(userA.accessToken, { type: 'bearer' })
      .send({
        accountId: usdBankGl.id,
        currencyId: usdId,
        bankName: 'Libyan Foreign Bank',
        accountNumber: 'USD-ACC-2026-01',
      })
      .expect(201);
    const bankAccountId = (bankAccRes.body as { id: number }).id;

    // Create reconciliation session & import CSV + SWIFT MT940 files
    const sessRes = await request(app.getHttpServer())
      .post('/accounting/treasury/reconciliations')
      .auth(userA.accessToken, { type: 'bearer' })
      .send({
        bankAccountId,
        statementNumber: 'STMT-B28-CSV-MT940',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        openingBalanceBank: '4800.000',
        closingBalanceBank: '5000.000',
      })
      .expect(201);
    const sessionId = (sessRes.body as { id: number }).id;

    const csvImport = await request(app.getHttpServer())
      .post(`/accounting/treasury/reconciliations/${sessionId}/import-file`)
      .auth(userA.accessToken, { type: 'bearer' })
      .send({
        format: 'CSV',
        content: [
          'Date,Reference,Description,Debit,Credit',
          '2026-11-12,CSV-REF-01,Patient wire transfer,0,250.000',
        ].join('\n'),
      })
      .expect(201);
    expect(
      (
        csvImport.body as {
          importedCount: number;
          session: { items: unknown[] };
        }
      ).importedCount,
    ).toBe(1);

    const mt940Import = await request(app.getHttpServer())
      .post(`/accounting/treasury/reconciliations/${sessionId}/import-file`)
      .auth(userA.accessToken, { type: 'bearer' })
      .send({
        format: 'MT940',
        content: [
          ':20:STMT20261125',
          ':61:2611141114D50,000NCHGNONREF//MT940-FEE-01',
          ':86:International Correspondent Wire Fee',
        ].join('\n'),
      })
      .expect(201);
    expect(
      (
        mt940Import.body as {
          importedCount: number;
          session: { items: unknown[] };
        }
      ).session.items.length,
    ).toBe(2);

    // Run Period-End FX Revaluation: $1000 * 4.95 = 4950.000 vs book 4800.000 -> +150.000 Unrealized FX Gain
    await request(app.getHttpServer())
      .post('/accounting/treasury/fx-revaluations')
      .auth(foreignUser.accessToken, { type: 'bearer' })
      .send({
        bankAccountId,
        foreignBalance: '1000.000',
        asOfDate: '2026-11-25',
      })
      .expect(404);

    const revalRes = await request(app.getHttpServer())
      .post('/accounting/treasury/fx-revaluations')
      .auth(userB.accessToken, { type: 'bearer' })
      .send({
        bankAccountId,
        foreignBalance: '1000.000',
        asOfDate: '2026-11-25',
        notes: 'Month-end USD closing rate revaluation',
      })
      .expect(201);

    const revalBody = revalRes.body as {
      id: number;
      bookBalanceBase: string;
      revaluedBalanceBase: string;
      unrealizedGainLoss: string;
      accountingEntryId: number;
    };
    expect(Money.toDbString(revalBody.bookBalanceBase)).toBe('4800.000');
    expect(Money.toDbString(revalBody.revaluedBalanceBase)).toBe('4950.000');
    expect(Money.toDbString(revalBody.unrealizedGainLoss)).toBe('150.000');
    expect(revalBody.accountingEntryId).toBeTruthy();

    // Verify duplicate revaluation on same date blocked (409) & immutable trigger
    await request(app.getHttpServer())
      .post('/accounting/treasury/fx-revaluations')
      .auth(userB.accessToken, { type: 'bearer' })
      .send({
        bankAccountId,
        foreignBalance: '1000.000',
        asOfDate: '2026-11-25',
      })
      .expect(409);

    await expect(
      db.$executeRaw`DELETE FROM "FxRevaluationRun" WHERE "id" = ${revalBody.id}`,
    ).rejects.toThrow(/immutable/i);

    // =========================================================================
    // PART B: CAP02 Laboratory Westgard Multi-Rule QC & Levey-Jennings
    // =========================================================================
    const labTest = await db.labTest.create({
      data: {
        hospitalId,
        code: 'GLU-B28',
        name: 'Fasting Blood Glucose',
        unit: 'mg/dL',
        isActive: true,
      },
    });

    const lotRes = await request(app.getHttpServer())
      .post('/lab/qc/lots')
      .auth(userA.accessToken, { type: 'bearer' })
      .send({
        testId: labTest.id,
        analyzerName: 'Cobas c311 #1',
        lotNumber: 'QC-GLU-2026-L2',
        level: 'LEVEL_2_NORMAL',
        targetMean: 100,
        targetSd: 2,
        unit: 'mg/dL',
      })
      .expect(201);
    const lotId = (lotRes.body as { id: number }).id;

    // Run 1: 100.8 (z = +0.4) -> PASS
    const run1 = await request(app.getHttpServer())
      .post('/lab/qc/runs')
      .auth(userA.accessToken, { type: 'bearer' })
      .send({ qcLotId: lotId, measuredValue: 100.8 })
      .expect(201);
    expect((run1.body as { status: string }).status).toBe('PASS');

    // Run 2: 104.4 (z = +2.2) -> WARNING (1-2s)
    const run2 = await request(app.getHttpServer())
      .post('/lab/qc/runs')
      .auth(userA.accessToken, { type: 'bearer' })
      .send({ qcLotId: lotId, measuredValue: 104.4 })
      .expect(201);
    expect(
      run2.body as { status: string; violatedRules: string[] },
    ).toMatchObject({
      status: 'WARNING',
      violatedRules: ['1-2s'],
    });

    // Run 3: 104.6 (z = +2.3) -> REJECT (2-2s consecutive > +2SD!)
    const run3 = await request(app.getHttpServer())
      .post('/lab/qc/runs')
      .auth(userA.accessToken, { type: 'bearer' })
      .send({ qcLotId: lotId, measuredValue: 104.6 })
      .expect(201);
    const run3Body = run3.body as {
      id: number;
      status: string;
      violatedRules: string[];
    };
    expect(run3Body.status).toBe('REJECT');
    expect(run3Body.violatedRules).toContain('2-2s');

    // 4-eyes corrective action review: self-review blocked (409), independent supervisor succeeds
    await request(app.getHttpServer())
      .post(`/lab/qc/runs/${run3Body.id}/review`)
      .auth(userA.accessToken, { type: 'bearer' })
      .send({ correctiveAction: 'Recalibrated Cobas c311 reagent pack' })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/lab/qc/runs/${run3Body.id}/review`)
      .auth(userB.accessToken, { type: 'bearer' })
      .send({
        correctiveAction:
          'Recalibrated Cobas c311 reagent pack & re-ran control',
      })
      .expect(201);

    const ljRes = await request(app.getHttpServer())
      .get(`/lab/qc/lots/${lotId}/levey-jennings`)
      .auth(userA.accessToken, { type: 'bearer' })
      .expect(200);
    expect(ljRes.body).toMatchObject({
      bands: { mean: '100.0000', plus2Sd: '104.0000', plus3Sd: '106.0000' },
      summary: { totalRuns: 3, passCount: 1, warningCount: 1, rejectCount: 1 },
    });

    // PostgreSQL trigger blocks altering analytical measurement
    await expect(
      db.$executeRaw`UPDATE "LabQcRun" SET "status" = 'PASS' WHERE "id" = ${run3Body.id}`,
    ).rejects.toThrow(/immutable/i);

    // =========================================================================
    // PART C: CAP13 Radiology RDSR & 12-Month Cumulative Dose Escalation
    // =========================================================================
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-B28-${Date.now()}`,
        fullName: 'مريض تتبع الجرعة الإشعاعية',
        gender: 'MALE',
      },
    });
    const encounter = await db.encounter.create({
      data: { hospitalId, patientId: patient.id, type: 'OPD', status: 'OPEN' },
    });
    const ctAbdomen = await db.radiologyStudy.create({
      data: {
        hospitalId,
        code: 'CT-ABD-B28',
        name: 'CT Abdomen Pelvis',
        modality: 'CT',
        bodyPart: 'ABDOMEN_PELVIS',
        isActive: true,
      },
    });
    const ctChest = await db.radiologyStudy.create({
      data: {
        hospitalId,
        code: 'CT-CHEST-B28',
        name: 'CT Chest',
        modality: 'CT',
        bodyPart: 'CHEST',
        isActive: true,
      },
    });

    const ord1 = await db.order.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        orderedById: userA.user.id,
        type: 'RADIOLOGY',
        status: 'COMPLETED',
      },
    });
    const radOrd1 = await db.radiologyOrder.create({
      data: { orderId: ord1.id, studyId: ctAbdomen.id, status: 'COMPLETED' },
    });
    const ord2 = await db.order.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        orderedById: userA.user.id,
        type: 'RADIOLOGY',
        status: 'COMPLETED',
      },
    });
    const radOrd2 = await db.radiologyOrder.create({
      data: { orderId: ord2.id, studyId: ctChest.id, status: 'COMPLETED' },
    });

    // Exam 1: DLP 5000 * 0.015 = 75.0000 mSv -> ELEVATED_50MSV warning, exceeds DRL
    const dose1 = await request(app.getHttpServer())
      .post(`/radiology/dose/orders/${radOrd1.id}`)
      .auth(userA.accessToken, { type: 'bearer' })
      .send({
        modality: 'CT',
        bodyRegion: 'ABDOMEN_PELVIS',
        ctdiVolMgy: 35.5,
        dlpMgyCm: 5000,
        kvp: 120,
        mas: 250,
      })
      .expect(201);
    expect(dose1.body).toMatchObject({
      incidentId: null,
      evaluation: {
        effectiveDoseMsv: '75.0000',
        exceedsDrl: true,
        cumulative12mMsv: '75.0000',
        cumulativeWarning: true,
        tier: 'ELEVATED_50MSV',
      },
    });

    // Exam 2: DLP 2000 * 0.014 = 28.0000 mSv -> cumulative 103.0000 mSv >= 100 mSv -> auto ClinicalIncident!
    const dose2 = await request(app.getHttpServer())
      .post(`/radiology/dose/orders/${radOrd2.id}`)
      .auth(userA.accessToken, { type: 'bearer' })
      .send({
        modality: 'CT',
        bodyRegion: 'CHEST',
        ctdiVolMgy: 22.0,
        dlpMgyCm: 2000,
      })
      .expect(201);
    const dose2Body = dose2.body as {
      record: { id: number };
      incidentId: number | null;
      evaluation: { cumulative12mMsv: string; tier: string };
    };
    expect(dose2Body.evaluation.cumulative12mMsv).toBe('103.0000');
    expect(dose2Body.evaluation.tier).toBe('CRITICAL_100MSV');
    expect(dose2Body.incidentId).toBeTruthy();

    // Verify patient summary & tenant isolation
    const summaryRes = await request(app.getHttpServer())
      .get(`/radiology/dose/patients/${patient.id}/summary`)
      .auth(userA.accessToken, { type: 'bearer' })
      .expect(200);
    expect(summaryRes.body).toMatchObject({
      examCount: 2,
      cumulative12mMsv: '103.0000',
      drlExceedances: 2,
      tier: 'CRITICAL_100MSV',
    });

    await request(app.getHttpServer())
      .get(`/radiology/dose/patients/${patient.id}/summary`)
      .auth(foreignUser.accessToken, { type: 'bearer' })
      .expect(404);

    // PostgreSQL immutability trigger blocks deleting dose record
    await expect(
      db.$executeRaw`DELETE FROM "RadiologyDoseRecord" WHERE "id" = ${dose2Body.record.id}`,
    ).rejects.toThrow(/immutable/i);
  });
});
