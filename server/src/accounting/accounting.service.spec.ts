import { AccountType, FinancialYearStatus, Prisma } from '@prisma/client';
import { AccountingService } from './accounting.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('AccountingService FIN02 & FLOW04 Money precision & year closing', () => {
  it('computes getTrialBalance and getLedger with Money precision and costCenterId isolation', async () => {
    const aggregateMock = jest.fn().mockResolvedValue({
      _sum: {
        debit: new Prisma.Decimal('100.105'),
        credit: new Prisma.Decimal('20.005'),
      },
    });
    const findManyLinesMock = jest.fn().mockResolvedValue([
      {
        id: 11,
        debit: new Prisma.Decimal('50.205'),
        credit: new Prisma.Decimal('0.000'),
        entry: {
          entryDate: new Date('2026-03-10T00:00:00.000Z'),
          description: 'فاتورة عيادة',
          sourceModule: 'BILLING',
          sourceId: 501,
        },
      },
      {
        id: 12,
        debit: new Prisma.Decimal('0.000'),
        credit: new Prisma.Decimal('30.105'),
        entry: {
          entryDate: new Date('2026-03-15T00:00:00.000Z'),
          description: 'تحصيل نقدي',
          sourceModule: 'CASHIER',
          sourceId: 502,
        },
      },
    ]);

    const prismaMock = {
      account: {
        findFirst: jest.fn().mockResolvedValue({
          id: 101,
          code: '120100',
          name: 'ذمم المرضى',
          type: AccountType.ASSET,
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 101,
            code: '120100',
            name: 'ذمم المرضى',
            type: AccountType.ASSET,
          },
          {
            id: 201,
            code: '400100',
            name: 'إيرادات خدمات طبية',
            type: AccountType.REVENUE,
          },
        ]),
      },
      accountingEntryLine: {
        aggregate: aggregateMock,
        findMany: findManyLinesMock,
        groupBy: jest.fn().mockResolvedValue([
          {
            accountId: 101,
            _sum: {
              debit: new Prisma.Decimal('150.310'),
              credit: new Prisma.Decimal('50.110'),
            },
          },
          {
            accountId: 201,
            _sum: {
              debit: new Prisma.Decimal('0.000'),
              credit: new Prisma.Decimal('100.200'),
            },
          },
        ]),
      },
    };

    const service = new AccountingService(
      prismaMock as unknown as PrismaService,
    );
    jest
      .spyOn(
        service as unknown as { ensureDefaultAccounts: () => Promise<void> },
        'ensureDefaultAccounts',
      )
      .mockResolvedValue(undefined);

    const tb = await service.getTrialBalance({
      hospitalId: 1,
      costCenterId: 7,
    });
    expect(tb.totals).toEqual({
      totalDebit: 150.31,
      totalCredit: 150.31,
    });
    expect(tb.rows).toMatchObject([
      {
        accountId: 101,
        debit: 150.31,
        credit: 50.11,
        balance: 100.2,
      },
      {
        accountId: 201,
        debit: 0,
        credit: 100.2,
        balance: -100.2,
      },
    ]);

    const ledger = await service.getLedger(1, 101, {
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-31T23:59:59.999Z'),
      costCenterId: 7,
    });
    expect(aggregateMock.mock.calls).toMatchObject([
      [{ where: { costCenterId: 7 } }],
    ]);
    expect(ledger.openingBalance).toBe(80.1);
    expect(ledger.totalDebit).toBe(50.205);
    expect(ledger.totalCredit).toBe(30.105);
    expect(ledger.closingBalance).toBe(100.2);
  });

  it('excludes CLOSING entries in getIncomeStatement, nets CONTRA_REVENUE properly in closeFinancialYear, and scopes getBalanceSheet P&L to the target financial year', async () => {
    const createEntryMock = jest.fn().mockResolvedValue({ id: 9001 });
    const updateYearMock = jest.fn().mockResolvedValue({ id: 2026 });

    const prismaMock = {
      $transaction: jest.fn(
        async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
          cb(prismaMock),
      ),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 2026 }]),
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      financialYear: {
        findFirst: jest.fn().mockResolvedValue({
          id: 2026,
          hospitalId: 1,
          name: 'FY 2026',
          code: 'FY-2026',
          status: FinancialYearStatus.OPEN,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
        }),
        update: updateYearMock,
      },
      financialPeriod: {
        count: jest.fn().mockResolvedValue(0),
      },
      account: {
        findFirst: jest.fn().mockResolvedValue({
          id: 302,
          code: '300200',
          name: 'أرباح/خسائر مرحّلة',
          type: AccountType.EQUITY,
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 401,
            code: '400100',
            name: 'إيرادات خدمات طبية',
            type: AccountType.REVENUE,
          },
          {
            id: 408,
            code: '400800',
            name: 'خصم / شطب تعاقدي لمطالبات التأمين',
            type: AccountType.CONTRA_REVENUE,
          },
          {
            id: 501,
            code: '500100',
            name: 'رواتب وأجور',
            type: AccountType.EXPENSE,
          },
        ]),
      },
      accountingEntryLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            accountId: 401,
            debit: new Prisma.Decimal('0.000'),
            credit: new Prisma.Decimal('1000.000'),
            account: {
              id: 401,
              code: '400100',
              name: 'إيرادات خدمات طبية',
              type: AccountType.REVENUE,
            },
          },
          {
            accountId: 408,
            debit: new Prisma.Decimal('150.000'),
            credit: new Prisma.Decimal('0.000'),
            account: {
              id: 408,
              code: '400800',
              name: 'خصم / شطب تعاقدي لمطالبات التأمين',
              type: AccountType.CONTRA_REVENUE,
            },
          },
          {
            accountId: 501,
            debit: new Prisma.Decimal('350.000'),
            credit: new Prisma.Decimal('0.000'),
            account: {
              id: 501,
              code: '500100',
              name: 'رواتب وأجور',
              type: AccountType.EXPENSE,
            },
          },
        ]),
        groupBy: jest.fn().mockResolvedValue([
          {
            accountId: 401,
            costCenterId: 5,
            _sum: {
              debit: new Prisma.Decimal('0.000'),
              credit: new Prisma.Decimal('1000.000'),
            },
          },
          {
            accountId: 408,
            costCenterId: 5,
            _sum: {
              debit: new Prisma.Decimal('150.000'),
              credit: new Prisma.Decimal('0.000'),
            },
          },
          {
            accountId: 501,
            costCenterId: 5,
            _sum: {
              debit: new Prisma.Decimal('350.000'),
              credit: new Prisma.Decimal('0.000'),
            },
          },
        ]),
      },
      accountingEntry: {
        create: createEntryMock,
      },
    };

    const service = new AccountingService(
      prismaMock as unknown as PrismaService,
    );
    jest
      .spyOn(
        service as unknown as { ensureDefaultAccounts: () => Promise<void> },
        'ensureDefaultAccounts',
      )
      .mockResolvedValue(undefined);

    const income = await service.getIncomeStatement({
      hospitalId: 1,
      financialYearId: 2026,
      costCenterId: 5,
    });
    // Gross Revenue 1000.000 - Contra Revenue 150.000 = 850.000 Net Revenue; Expenses = 350.000; Net Profit = 500.000
    expect(income.totalRevenue).toBe(850);
    expect(income.totalExpense).toBe(350);
    expect(income.netProfit).toBe(500);

    const closed = await service.closeFinancialYear(1, 9, 2026, {
      retainedEarningsAccountId: 302,
    });
    expect(closed.totalRevenue).toBe(850);
    expect(closed.totalExpense).toBe(350);
    expect(closed.netProfit).toBe(500);
    expect(createEntryMock.mock.calls).toMatchObject([
      [
        {
          data: {
            postingKey: 'year-close:1:2026',
            sourceModule: 'CLOSING',
          },
        },
      ],
    ]);
  });

  it('scopes getBalanceSheet P&L to the target financialYearId, preserves costCenterId on generateOpeningBalancesFromLastClosedYear, and computes getPatientsReceivablesAging with Money', async () => {
    const findManyLinesMock = jest
      .fn()
      // 1st call: getBalanceSheet all lines for fy.id = 2026
      .mockResolvedValueOnce([
        {
          debit: new Prisma.Decimal('850.000'),
          credit: new Prisma.Decimal('350.000'),
          account: {
            id: 101,
            code: '110100',
            name: 'الصندوق الرئيسي',
            type: AccountType.ASSET,
          },
        },
      ])
      // 2nd call: calculateNetIncome scoped to fy.id = 2026
      .mockResolvedValueOnce([
        {
          debit: new Prisma.Decimal('0.000'),
          credit: new Prisma.Decimal('1000.000'),
          account: { type: AccountType.REVENUE },
        },
        {
          debit: new Prisma.Decimal('150.000'),
          credit: new Prisma.Decimal('0.000'),
          account: { type: AccountType.CONTRA_REVENUE },
        },
        {
          debit: new Prisma.Decimal('350.000'),
          credit: new Prisma.Decimal('0.000'),
          account: { type: AccountType.EXPENSE },
        },
      ]);

    const groupByLinesMock = jest.fn().mockResolvedValue([
      {
        accountId: 101,
        costCenterId: 12,
        _sum: {
          debit: new Prisma.Decimal('500.000'),
          credit: new Prisma.Decimal('0.000'),
        },
      },
      {
        accountId: 302,
        costCenterId: 12,
        _sum: {
          debit: new Prisma.Decimal('0.000'),
          credit: new Prisma.Decimal('500.000'),
        },
      },
    ]);

    const createOpeningEntryMock = jest.fn().mockResolvedValue({
      id: 9500,
      entryDate: new Date('2026-01-01T00:00:00.000Z'),
      lines: [{ id: 1 }, { id: 2 }],
    });

    const prismaMock = {
      $transaction: jest.fn(
        async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
          cb(prismaMock),
      ),
      financialYear: {
        findFirst: jest
          .fn()
          // 1st call: getBalanceSheet fy lookup
          .mockResolvedValueOnce({
            id: 2026,
            hospitalId: 1,
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T00:00:00.000Z'),
            status: FinancialYearStatus.OPEN,
          })
          // 2nd call: generateOpeningBalancesFromLastClosedYear targetYear
          .mockResolvedValueOnce({
            id: 2026,
            hospitalId: 1,
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T00:00:00.000Z'),
            status: FinancialYearStatus.OPEN,
          })
          // 3rd call: generateOpeningBalancesFromLastClosedYear lastClosedYear
          .mockResolvedValueOnce({
            id: 2025,
            hospitalId: 1,
            startDate: new Date('2025-01-01T00:00:00.000Z'),
            endDate: new Date('2025-12-31T00:00:00.000Z'),
            status: FinancialYearStatus.CLOSED,
          })
          // 4th call: saveOpeningBalances year lookup
          .mockResolvedValue({
            id: 2026,
            hospitalId: 1,
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T00:00:00.000Z'),
            status: FinancialYearStatus.OPEN,
          }),
      },
      account: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 101,
            code: '110100',
            name: 'الصندوق الرئيسي',
            type: AccountType.ASSET,
            isActive: true,
          },
          {
            id: 302,
            code: '300200',
            name: 'أرباح/خسائر مرحّلة',
            type: AccountType.EQUITY,
            isActive: true,
          },
        ]),
      },
      accountingEntryLine: {
        findMany: findManyLinesMock,
        groupBy: groupByLinesMock,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      accountingEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: createOpeningEntryMock,
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            patientId: 77,
            totalAmount: new Prisma.Decimal('100.105'),
            discountAmount: new Prisma.Decimal('10.005'),
            vatAmount: new Prisma.Decimal('0.000'),
            paidAmount: new Prisma.Decimal('20.050'),
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
          },
          {
            id: 2,
            patientId: 77,
            netAmount: new Prisma.Decimal('40.250'),
            paidAmount: new Prisma.Decimal('10.100'),
            createdAt: new Date('2026-03-15T00:00:00.000Z'),
          },
        ]),
      },
      patient: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 77, fullName: 'مريض اختبار أعمار الذمم', mrn: 'MRN-77' },
          ]),
      },
    };

    const service = new AccountingService(
      prismaMock as unknown as PrismaService,
    );
    jest
      .spyOn(
        service as unknown as {
          validateDateInOpenPeriod: () => Promise<{
            financialYear: { id: number };
            period: { id: number };
          }>;
        },
        'validateDateInOpenPeriod',
      )
      .mockResolvedValue({
        financialYear: { id: 2026 },
        period: { id: 202601 },
      });

    const bs = await service.getBalanceSheet(
      1,
      new Date('2026-06-30T00:00:00.000Z'),
    );
    expect(findManyLinesMock.mock.calls).toMatchObject([
      [{}],
      [
        {
          where: {
            entry: {
              hospitalId: 1,
              financialYearId: 2026,
            },
          },
        },
      ],
    ]);
    expect(bs.totals).toEqual({
      assets: 500,
      liabilitiesAndEquity: 500,
      difference: 0,
    });

    await service.generateOpeningBalancesFromLastClosedYear({
      hospitalId: 1,
      userId: 9,
      targetFinancialYearId: 2026,
    });
    expect(createOpeningEntryMock.mock.calls).toMatchObject([
      [
        {
          data: {
            lines: {
              create: [
                {
                  accountId: 101,
                  costCenterId: 12,
                  debit: '500.000',
                  credit: '0.000',
                },
                {
                  accountId: 302,
                  costCenterId: 12,
                  debit: '0.000',
                  credit: '500.000',
                },
              ],
            },
          },
        },
      ],
    ]);

    const aging = await service.getPatientsReceivablesAging(
      1,
      new Date('2026-05-15T00:00:00.000Z'),
    );
    // Inv 1 (14 days old -> b0_30): 100.105 - 10.005 - 20.050 = 70.05
    // Inv 2 (61 days old -> b61_90): 40.250 - 10.100 = 30.15
    expect(aging.grandTotals).toEqual({
      b0_30: 70.05,
      b31_60: 0,
      b61_90: 30.15,
      b91_120: 0,
      b121_plus: 0,
      total: 100.2,
    });
  });
});
