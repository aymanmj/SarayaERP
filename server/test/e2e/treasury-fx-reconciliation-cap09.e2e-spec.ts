import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { AccountType, SystemAccountKey } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

interface CurrencyRow {
  id: number;
  code: string;
  isBase: boolean;
  decimalPlaces: number;
}

interface ExchangeRateRow {
  id: number;
  rate: string;
  inverseRate: string;
  isVerified: boolean;
}

interface ConversionRes {
  fromCode: string;
  toCode: string;
  rateUsed: string;
  convertedAmount: string;
  convertedAmountStandard3dp: string;
  triangulated: boolean;
  source: string;
}

interface ReconSessionRes {
  id: number;
  status: string;
  closingBalanceBank: string;
  bookBalanceAsOfEnd: string;
  reconciledBalance: string;
  differenceAmount: string;
  items: Array<{
    id: number;
    reference: string;
    direction: string;
    amount: string;
    foreignAmount: string | null;
    exchangeRateUsed: string | null;
    matchStatus: string;
    matchedEntryLineId: number | null;
    adjustmentEntryId: number | null;
  }>;
  summary: {
    unmatchedItemsCount: number;
    matchedItemsCount: number;
    adjustedItemsCount: number;
    depositsInTransit: string;
    outstandingChecks: string;
    isBalanced: boolean;
  };
}

describe('E2E Tests - Multi-Currency FX Ledger (DECIMAL 19,6) & General Bank Reconciliation (CAP09)', () => {
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

  it('enforces multi-currency DECIMAL(19,6) FX ledger with 4-eyes & triangulation, full bank reconciliation with auto-match, GL adjustments, zero-difference 4-eyes close, cross-tenant isolation, and PostgreSQL immutability guards', async () => {
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const server = app.getHttpServer();

    const hospA = await prisma.hospital.create({
      data: {
        name: 'Saraya Main Hospital',
        code: `HOSP-CAP09-A-${Date.now()}`,
      },
    });
    const hospB = await prisma.hospital.create({
      data: { name: 'Other Hospital', code: `HOSP-CAP09-B-${Date.now()}` },
    });

    const accountant1 = await auth.createTestUser('acc-preparer', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'acc:treasury:view',
        'acc:treasury:manage',
        'acc:treasury:approve',
      ],
    });
    const accountant2 = await auth.createTestUser('acc-approver', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'acc:treasury:view',
        'acc:treasury:manage',
        'acc:treasury:approve',
      ],
    });
    const otherHospUser = await auth.createTestUser('acc-other', 'password', {
      hospitalId: hospB.id,
      permissions: [
        'acc:treasury:view',
        'acc:treasury:manage',
        'acc:treasury:approve',
      ],
    });

    const tokenPrep = accountant1.accessToken;
    const tokenApp = accountant2.accessToken;
    const tokenOther = otherHospUser.accessToken;

    // Setup open financial year & period for November 2026
    const fy = await prisma.financialYear.create({
      data: {
        hospitalId: hospA.id,
        name: 'FY 2026',
        code: 'FY-2026',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        status: 'OPEN',
        isCurrent: true,
      },
    });
    const fp = await prisma.financialPeriod.create({
      data: {
        financialYearId: fy.id,
        periodIndex: 11,
        periodCode: '2026-11',
        monthStartDate: new Date('2026-11-01T00:00:00.000Z'),
        monthEndDate: new Date('2026-11-30T00:00:00.000Z'),
        numberOfDays: 30,
        isOpen: true,
      },
    });

    // Setup GL accounts
    const bankGl = await prisma.account.create({
      data: {
        hospitalId: hospA.id,
        code: '101100',
        name: 'البنك الرئيسي (دينار ليبي)',
        type: AccountType.ASSET,
      },
    });
    const revGl = await prisma.account.create({
      data: {
        hospitalId: hospA.id,
        code: '400100',
        name: 'إيرادات العيادات',
        type: AccountType.REVENUE,
      },
    });
    const bankChargesGl = await prisma.account.create({
      data: {
        hospitalId: hospA.id,
        code: '500950',
        name: 'عمولات ومصاريف بنكية',
        type: AccountType.EXPENSE,
      },
    });
    const fxGl = await prisma.account.create({
      data: {
        hospitalId: hospA.id,
        code: '400950',
        name: 'فروق عملة',
        type: AccountType.REVENUE,
      },
    });

    await prisma.systemAccountMapping.createMany({
      data: [
        {
          hospitalId: hospA.id,
          key: SystemAccountKey.BANK_MAIN,
          accountId: bankGl.id,
        },
        {
          hospitalId: hospA.id,
          key: SystemAccountKey.BANK_CHARGES_EXPENSE,
          accountId: bankChargesGl.id,
        },
        {
          hospitalId: hospA.id,
          key: SystemAccountKey.FX_GAIN_LOSS,
          accountId: fxGl.id,
        },
      ],
    });

    // =====================================================================
    // PART 1: Multi-Currency & DECIMAL(19,6) Exchange Rates
    // =====================================================================
    const lydRes = await request(server)
      .post('/accounting/treasury/currencies')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        code: 'LYD',
        nameAr: 'دينار ليبي',
        nameEn: 'Libyan Dinar',
        symbol: 'د.ل',
        decimalPlaces: 3,
        isBase: true,
      })
      .expect(201);
    const lyd = lydRes.body as CurrencyRow;
    expect(lyd.code).toBe('LYD');
    expect(lyd.isBase).toBe(true);

    // Reject second base currency (409)
    await request(server)
      .post('/accounting/treasury/currencies')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        code: 'USD',
        nameAr: 'دولار أمريكي',
        nameEn: 'US Dollar',
        symbol: '$',
        decimalPlaces: 2,
        isBase: true,
      })
      .expect(409);

    const usdRes = await request(server)
      .post('/accounting/treasury/currencies')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        code: 'USD',
        nameAr: 'دولار أمريكي',
        nameEn: 'US Dollar',
        symbol: '$',
        decimalPlaces: 2,
        isBase: false,
      })
      .expect(201);
    const usd = usdRes.body as CurrencyRow;

    const eurRes = await request(server)
      .post('/accounting/treasury/currencies')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        code: 'EUR',
        nameAr: 'يورو',
        nameEn: 'Euro',
        symbol: '€',
        decimalPlaces: 2,
        isBase: false,
      })
      .expect(201);
    const eur = eurRes.body as CurrencyRow;

    // Record USD -> LYD rate at 6dp (4.825500)
    const rateUsdLydRes = await request(server)
      .post('/accounting/treasury/exchange-rates')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        fromCurrencyId: usd.id,
        toCurrencyId: lyd.id,
        rate: '4.825500',
        effectiveDate: '2026-11-10T00:00:00.000Z',
        source: 'CBL_OFFICIAL',
        referenceNote: 'نشرة مصرف ليبيا المركزي',
      })
      .expect(201);
    const rateUsdLyd = rateUsdLydRes.body as ExchangeRateRow;
    expect(rateUsdLyd.rate).toBe('4.825500');
    expect(rateUsdLyd.inverseRate).toBe('0.207232');
    expect(rateUsdLyd.isVerified).toBe(false);

    // 4-eyes: preparer cannot self-verify their own exchange rate
    await request(server)
      .post(`/accounting/treasury/exchange-rates/${rateUsdLyd.id}/verify`)
      .set('Authorization', `Bearer ${tokenPrep}`)
      .expect(403);

    // Cross-tenant isolation: Hospital B cannot verify Hospital A's rate
    await request(server)
      .post(`/accounting/treasury/exchange-rates/${rateUsdLyd.id}/verify`)
      .set('Authorization', `Bearer ${tokenOther}`)
      .expect(404);

    // Second accountant verifies USD -> LYD
    const verifiedUsdRes = await request(server)
      .post(`/accounting/treasury/exchange-rates/${rateUsdLyd.id}/verify`)
      .set('Authorization', `Bearer ${tokenApp}`)
      .expect(201);
    expect((verifiedUsdRes.body as ExchangeRateRow).isVerified).toBe(true);

    // Record EUR -> LYD at 5.200000 and verify
    const rateEurLydRes = await request(server)
      .post('/accounting/treasury/exchange-rates')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        fromCurrencyId: eur.id,
        toCurrencyId: lyd.id,
        rate: '5.200000',
        effectiveDate: '2026-11-10T00:00:00.000Z',
        source: 'CBL_OFFICIAL',
      })
      .expect(201);
    await request(server)
      .post(
        `/accounting/treasury/exchange-rates/${(rateEurLydRes.body as ExchangeRateRow).id}/verify`,
      )
      .set('Authorization', `Bearer ${tokenApp}`)
      .expect(201);

    // Direct conversion USD -> LYD: 250.00 * 4.825500 = 1206.375 LYD
    const directConv = await request(server)
      .post('/accounting/treasury/convert')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        fromCode: 'USD',
        toCode: 'LYD',
        amount: '250.000',
        asOfDate: '2026-11-15T00:00:00.000Z',
      })
      .expect(201);
    expect((directConv.body as ConversionRes).convertedAmount).toBe('1206.375');
    expect((directConv.body as ConversionRes).rateUsed).toBe('4.825500');
    expect((directConv.body as ConversionRes).triangulated).toBe(false);

    // Triangulated cross-conversion USD -> EUR via base currency LYD
    const crossConv = await request(server)
      .post('/accounting/treasury/convert')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        fromCode: 'USD',
        toCode: 'EUR',
        amount: '100.000',
        asOfDate: '2026-11-15T00:00:00.000Z',
      })
      .expect(201);
    const cross = crossConv.body as ConversionRes;
    expect(cross.triangulated).toBe(true);
    expect(cross.source).toBe('TRIANGULATED_VIA_LYD');

    // PostgreSQL immutability trigger: cannot DELETE or mutate ExchangeRate
    await expect(
      prisma.$executeRaw`DELETE FROM "ExchangeRate" WHERE "id" = ${rateUsdLyd.id}`,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE "ExchangeRate" SET "rate" = 9.999999 WHERE "id" = ${rateUsdLyd.id}`,
    ).rejects.toThrow();

    // =====================================================================
    // PART 2: Bank Account & Full Bank Reconciliation Lifecycle
    // =====================================================================
    // Reject non-ASSET GL account
    await request(server)
      .post('/accounting/treasury/bank-accounts')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        accountId: bankChargesGl.id,
        currencyId: lyd.id,
        bankName: 'مصرف الجمهورية',
        accountNumber: 'BAD-001',
      })
      .expect(400);

    // Create valid BankAccount linked to ASSET GL 101100
    const bankAccRes = await request(server)
      .post('/accounting/treasury/bank-accounts')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        accountId: bankGl.id,
        currencyId: lyd.id,
        bankName: 'مصرف الجمهورية',
        branchName: 'فرع طرابلس الرئيسي',
        accountNumber: '011-00445566',
        iban: 'LY38021000021000012345678',
      })
      .expect(201);
    const bankAccountId = (bankAccRes.body as { id: number }).id;

    // Seed GL entries on bankGl (101100):
    // 1) Deposit of 1000.000 LYD on 2026-11-12 (will match bank statement CREDIT)
    await prisma.accountingEntry.create({
      data: {
        hospitalId: hospA.id,
        postingKey: `test-dep-1:${hospA.id}`,
        sourceModule: 'MANUAL',
        entryDate: new Date('2026-11-12T00:00:00.000Z'),
        financialYearId: fy.id,
        financialPeriodId: fp.id,
        createdById: accountant1.user.id,
        description: 'إيداع حوالة عيادات REF-DEP-100',
        lines: {
          create: [
            { accountId: bankGl.id, debit: '1000.000', credit: '0.000' },
            { accountId: revGl.id, debit: '0.000', credit: '1000.000' },
          ],
        },
      },
    });
    // 2) Foreign wire deposit of 1206.375 LYD (250 USD @ 4.825500) on 2026-11-14
    await prisma.accountingEntry.create({
      data: {
        hospitalId: hospA.id,
        postingKey: `test-dep-usd:${hospA.id}`,
        sourceModule: 'MANUAL',
        entryDate: new Date('2026-11-14T00:00:00.000Z'),
        financialYearId: fy.id,
        financialPeriodId: fp.id,
        createdById: accountant1.user.id,
        description: 'حوالة دولارية مقوّمة بالدينار REF-WIRE-USD',
        lines: {
          create: [
            { accountId: bankGl.id, debit: '1206.375', credit: '0.000' },
            { accountId: revGl.id, debit: '0.000', credit: '1206.375' },
          ],
        },
      },
    });
    // 3) Check issued for 200.000 LYD on 2026-11-28 (NOT yet cleared at bank -> outstanding check)
    await prisma.accountingEntry.create({
      data: {
        hospitalId: hospA.id,
        postingKey: `test-chk-out:${hospA.id}`,
        sourceModule: 'MANUAL',
        entryDate: new Date('2026-11-28T00:00:00.000Z'),
        financialYearId: fy.id,
        financialPeriodId: fp.id,
        createdById: accountant1.user.id,
        description: 'صك صادر لم يُصرف بعد CHK-901',
        lines: {
          create: [
            { accountId: bankChargesGl.id, debit: '200.000', credit: '0.000' },
            { accountId: bankGl.id, debit: '0.000', credit: '200.000' },
          ],
        },
      },
    });

    // Book balance = 1000.000 + 1206.375 - 200.000 = 2006.375
    // Bank statement shows: +1000.000 + 1206.375 - 15.000 (unrecorded bank charge) = 2191.375 closing bank balance
    const sessionRes = await request(server)
      .post('/accounting/treasury/reconciliations')
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        bankAccountId,
        statementNumber: 'STMT-2026-11-MAIN',
        periodStart: '2026-11-01T00:00:00.000Z',
        periodEnd: '2026-11-30T00:00:00.000Z',
        openingBalanceBank: '0.000',
        closingBalanceBank: '2191.375',
        notes: 'تسوية شهر نوفمبر 2026',
      })
      .expect(201);
    const createdSession = sessionRes.body as ReconSessionRes;
    expect(createdSession.bookBalanceAsOfEnd).toBe('2006.375');

    // Import 3 bank statement lines (including FX wire converted automatically at 4.825500 + bank fee 15.000)
    const importRes = await request(server)
      .post(`/accounting/treasury/reconciliations/${createdSession.id}/items`)
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        items: [
          {
            transactionDate: '2026-11-12T00:00:00.000Z',
            reference: 'REF-DEP-100',
            description: 'إيداع عيادات',
            direction: 'CREDIT',
            amount: '1000.000',
          },
          {
            transactionDate: '2026-11-14T00:00:00.000Z',
            reference: 'REF-WIRE-USD',
            description: 'حوالة واردة بالدولار',
            direction: 'CREDIT',
            foreignCurrencyId: usd.id,
            foreignAmount: '250.000',
          },
          {
            transactionDate: '2026-11-29T00:00:00.000Z',
            reference: 'BANK-FEE-NOV',
            description: 'عمولة كشف حساب ومصاريف تحويل',
            direction: 'DEBIT',
            amount: '15.000',
          },
        ],
      })
      .expect(201);
    const importedSession = (importRes.body as { session: ReconSessionRes })
      .session;
    const fxItem = importedSession.items.find(
      (i) => i.reference === 'REF-WIRE-USD',
    );
    expect(fxItem?.amount).toBe('1206.375');
    expect(fxItem?.exchangeRateUsed).toBe('4.825500');

    // Run Auto-Match -> matches 2 deposit items, leaves 15.000 bank fee UNMATCHED
    const autoRes = await request(server)
      .post(
        `/accounting/treasury/reconciliations/${createdSession.id}/auto-match`,
      )
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({ dateToleranceDays: 3 })
      .expect(201);
    const autoBody = autoRes.body as {
      matchedCount: number;
      session: ReconSessionRes;
    };
    expect(autoBody.matchedCount).toBe(2);
    expect(autoBody.session.summary.matchedItemsCount).toBe(2);
    expect(autoBody.session.summary.unmatchedItemsCount).toBe(1);
    expect(autoBody.session.summary.outstandingChecks).toBe('200.000');
    // Reconciled bank = 2191.375 - 200.000 = 1991.375; Book = 2006.375 -> diff = -15.000
    expect(autoBody.session.reconciledBalance).toBe('1991.375');
    expect(autoBody.session.differenceAmount).toBe('-15.000');

    // Submitting with non-zero difference & unmatched item must fail (400)
    await request(server)
      .post(`/accounting/treasury/reconciliations/${createdSession.id}/submit`)
      .set('Authorization', `Bearer ${tokenPrep}`)
      .expect(400);

    // Post atomic GL adjustment for the 15.000 bank fee
    const feeItem = autoBody.session.items.find(
      (i) => i.reference === 'BANK-FEE-NOV',
    )!;
    const adjRes = await request(server)
      .post(`/accounting/treasury/reconciliations/items/${feeItem.id}/adjust`)
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        adjustmentType: 'BANK_CHARGES',
        description: 'إثبات عمولة مصرف الجمهورية لشهر نوفمبر',
      })
      .expect(201);
    const adjBody = adjRes.body as {
      accountingEntryId: number;
      session: ReconSessionRes;
    };
    expect(adjBody.accountingEntryId).toBeGreaterThan(0);
    // Now book = 1991.375, reconciled bank = 1991.375 -> difference = 0.000!
    expect(adjBody.session.bookBalanceAsOfEnd).toBe('1991.375');
    expect(adjBody.session.reconciledBalance).toBe('1991.375');
    expect(adjBody.session.differenceAmount).toBe('0.000');
    expect(adjBody.session.summary.unmatchedItemsCount).toBe(0);
    expect(adjBody.session.summary.isBalanced).toBe(true);

    // Submit for 4-eyes approval -> PENDING_APPROVAL
    const submitRes = await request(server)
      .post(`/accounting/treasury/reconciliations/${createdSession.id}/submit`)
      .set('Authorization', `Bearer ${tokenPrep}`)
      .expect(201);
    expect((submitRes.body as ReconSessionRes).status).toBe('PENDING_APPROVAL');

    // 4-eyes: preparer cannot self-approve & close
    await request(server)
      .post(
        `/accounting/treasury/reconciliations/${createdSession.id}/approve-close`,
      )
      .set('Authorization', `Bearer ${tokenPrep}`)
      .expect(403);

    // Cross-tenant isolation: Hospital B cannot read or close Hospital A's session
    await request(server)
      .get(`/accounting/treasury/reconciliations/${createdSession.id}`)
      .set('Authorization', `Bearer ${tokenOther}`)
      .expect(404);

    // Second accountant approves & closes -> CLOSED
    const closeRes = await request(server)
      .post(
        `/accounting/treasury/reconciliations/${createdSession.id}/approve-close`,
      )
      .set('Authorization', `Bearer ${tokenApp}`)
      .expect(201);
    expect((closeRes.body as ReconSessionRes).status).toBe('CLOSED');

    // Importing items into CLOSED session must fail (400)
    await request(server)
      .post(`/accounting/treasury/reconciliations/${createdSession.id}/items`)
      .set('Authorization', `Bearer ${tokenPrep}`)
      .send({
        items: [
          {
            transactionDate: '2026-11-30T00:00:00.000Z',
            reference: 'LATE-ITEM',
            direction: 'DEBIT',
            amount: '1.000',
          },
        ],
      })
      .expect(400);

    // PostgreSQL immutability guard: cannot modify or delete CLOSED session
    await expect(
      prisma.$executeRaw`UPDATE "BankReconciliationSession" SET "notes" = 'tampered' WHERE "id" = ${createdSession.id}`,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`DELETE FROM "BankReconciliationSession" WHERE "id" = ${createdSession.id}`,
    ).rejects.toThrow();

    // Verify chained AuditLog entries were written atomically
    const audits = await prisma.auditLog.findMany({
      where: {
        hospitalId: hospA.id,
        action: {
          in: [
            'TREASURY_CURRENCY_CREATED',
            'TREASURY_FX_RATE_RECORDED',
            'TREASURY_FX_RATE_VERIFIED',
            'TREASURY_BANK_ACCOUNT_CREATED',
            'TREASURY_BANK_RECON_SESSION_CREATED',
            'TREASURY_BANK_STATEMENT_IMPORTED',
            'TREASURY_BANK_RECON_AUTO_MATCHED',
            'TREASURY_BANK_ADJUSTMENT_POSTED',
            'TREASURY_BANK_RECON_SUBMITTED',
            'TREASURY_BANK_RECON_CLOSED',
          ],
        },
      },
    });
    expect(audits.length).toBeGreaterThanOrEqual(10);
  });
});
