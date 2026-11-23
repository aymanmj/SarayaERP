import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { CurrencyExchangeService } from './currency-exchange.service';

jest.mock('../audit/audit-chain', () => ({
  appendChainedAuditInTransaction: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock('../audit/siem.logger', () => ({
  publishCommittedCriticalAudit: jest.fn(),
}));

describe('CurrencyExchangeService (CAP09)', () => {
  const makeMockPrisma = () => {
    const tx = {
      currency: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      exchangeRate: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
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
    return {
      service: new CurrencyExchangeService(prisma as unknown as PrismaService),
      prisma,
      tx,
    };
  };

  it('rejects recording an exchange rate for identical currencies or non-positive rate', async () => {
    const { service } = makeMockPrisma();

    await expect(
      service.recordExchangeRate(1, 10, {
        fromCurrencyId: 5,
        toCurrencyId: 5,
        rate: '4.825500',
        effectiveDate: '2026-11-24T00:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.recordExchangeRate(1, 10, {
        fromCurrencyId: 5,
        toCurrencyId: 6,
        rate: '0',
        effectiveDate: '2026-11-24T00:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('enforces 4-eyes verification so the rate creator cannot verify their own rate', async () => {
    const { service, tx } = makeMockPrisma();

    tx.exchangeRate.findFirst.mockResolvedValue({
      id: 99,
      hospitalId: 1,
      isVerified: false,
      createdById: 10,
      rate: '4.825500',
      fromCurrency: { code: 'USD' },
      toCurrency: { code: 'LYD' },
    });

    await expect(service.verifyExchangeRate(1, 99, 10)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('triangulates cross-currency conversion through base currency using 6dp FX precision and Money rounding', async () => {
    const { service, prisma } = makeMockPrisma();

    const usd = { id: 2, code: 'USD', decimalPlaces: 2, isBase: false };
    const eur = { id: 3, code: 'EUR', decimalPlaces: 2, isBase: false };
    const lyd = { id: 1, code: 'LYD', decimalPlaces: 3, isBase: true };

    prisma.currency.findFirst
      .mockResolvedValueOnce(usd)
      .mockResolvedValueOnce(eur)
      .mockResolvedValueOnce(lyd);

    prisma.exchangeRate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 11,
        rate: '4.800000',
        inverseRate: '0.208333',
        effectiveDate: new Date('2026-11-24T00:00:00.000Z'),
        source: 'CBL_OFFICIAL',
        isVerified: true,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 12,
        rate: '5.000000',
        inverseRate: '0.200000',
        effectiveDate: new Date('2026-11-24T00:00:00.000Z'),
        source: 'CBL_OFFICIAL',
        isVerified: true,
      });

    const result = await service.convertAmount(1, {
      fromCode: 'USD',
      toCode: 'EUR',
      amount: '100.000',
      asOfDate: '2026-11-24T12:00:00.000Z',
    });

    expect(result.triangulated).toBe(true);
    expect(result.rateUsed).toBe('0.960000');
    expect(result.convertedAmount).toBe('96.00');
    expect(result.convertedAmountStandard3dp).toBe('96.000');
    expect(result.source).toBe('TRIANGULATED_VIA_LYD');
  });

  it('prevents creating a second base currency in the same hospital', async () => {
    const { service, tx } = makeMockPrisma();

    tx.currency.findUnique.mockResolvedValue(null);
    tx.currency.findFirst.mockResolvedValue({
      id: 1,
      code: 'LYD',
      isBase: true,
    });

    await expect(
      service.createCurrency(1, 10, {
        code: 'USD',
        nameAr: 'دولار',
        nameEn: 'US Dollar',
        symbol: '$',
        decimalPlaces: 2,
        isBase: true,
      }),
    ).rejects.toThrow(ConflictException);
  });
});
