import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { CurrencyExchangeService } from './currency-exchange.service';
import { BankReconciliationService } from './bank-reconciliation.service';

jest.mock('../audit/audit-chain', () => ({
  appendChainedAuditInTransaction: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock('../audit/siem.logger', () => ({
  publishCommittedCriticalAudit: jest.fn(),
}));

describe('BankReconciliationService (CAP09)', () => {
  const makeMockPrisma = () => {
    const tx = {
      account: { findFirst: jest.fn() },
      currency: { findFirst: jest.fn() },
      bankAccount: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      bankReconciliationSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      treasuryBankStatementItem: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      accountingEntryLine: { findMany: jest.fn(), findFirst: jest.fn() },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
    };
    const currencyExchange = {
      resolveEffectiveRate: jest.fn(),
    };
    return {
      service: new BankReconciliationService(
        prisma as unknown as PrismaService,
        currencyExchange as unknown as CurrencyExchangeService,
      ),
      prisma,
      tx,
      currencyExchange,
    };
  };

  it('rejects linking a BankAccount to a non-ASSET GL account', async () => {
    const { service, tx } = makeMockPrisma();

    tx.account.findFirst.mockResolvedValue({
      id: 10,
      hospitalId: 1,
      code: '500100',
      type: 'EXPENSE',
      isActive: true,
    });
    tx.currency.findFirst.mockResolvedValue({
      id: 1,
      hospitalId: 1,
      code: 'LYD',
      isActive: true,
    });

    await expect(
      service.createBankAccount(1, 5, {
        accountId: 10,
        currencyId: 1,
        bankName: 'مصرف الجمهورية',
        accountNumber: '010-998877',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks self-approval when closing a reconciliation session (4-eyes enforcement)', async () => {
    const { service, tx } = makeMockPrisma();

    tx.bankReconciliationSession.findFirst.mockResolvedValue({
      id: 20,
      hospitalId: 1,
      status: 'PENDING_APPROVAL',
      preparedById: 7,
      statementNumber: 'STMT-2026-11',
    });

    await expect(
      service.approveAndCloseReconciliationSession(1, 20, 7),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects submitting a reconciliation session when differenceAmount is non-zero', async () => {
    const { service, tx } = makeMockPrisma();

    const sessionRow = {
      id: 21,
      hospitalId: 1,
      bankAccountId: 3,
      statementNumber: 'STMT-2026-11-B',
      periodStart: new Date('2026-11-01T00:00:00.000Z'),
      periodEnd: new Date('2026-11-30T00:00:00.000Z'),
      openingBalanceBank: '0.000',
      closingBalanceBank: '985.000',
      bookBalanceAsOfEnd: '1000.000',
      reconciledBalance: '985.000',
      differenceAmount: '-15.000',
      status: 'IN_PROGRESS',
      preparedById: 7,
      bankAccount: { id: 3, accountId: 101, currency: { code: 'LYD' } },
      items: [],
    };

    tx.bankReconciliationSession.findFirst.mockResolvedValue(sessionRow);
    tx.bankReconciliationSession.findFirstOrThrow.mockResolvedValue(sessionRow);
    tx.accountingEntryLine.findMany
      .mockResolvedValueOnce([
        {
          id: 500,
          debit: '1000.000',
          credit: '0.000',
          treasuryStatementMatch: { id: 1 },
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(service.submitReconciliationSession(1, 21, 7)).rejects.toThrow(
      BadRequestException,
    );
  });
});
