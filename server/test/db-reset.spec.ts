import { PrismaClient } from '@prisma/client';
import { resetDatabase } from './db-reset';

describe('E2E database reset safety', () => {
  let query: jest.Mock;
  let execute: jest.Mock;
  let prisma: PrismaClient;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://test:test@localhost:5432/saraya_test';
    query = jest.fn().mockResolvedValueOnce([{ name: 'saraya_test' }]);
    execute = jest.fn().mockResolvedValue(0);
    prisma = {
      $queryRaw: query,
      $executeRawUnsafe: execute,
    } as unknown as PrismaClient;
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('refuses a reset outside test mode before making a query', async () => {
    process.env.NODE_ENV = 'production';
    await expect(resetDatabase(prisma)).rejects.toThrow('NODE_ENV=test');
    expect(query).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses a production database name even in test mode', async () => {
    process.env.DATABASE_URL =
      'postgresql://test:test@localhost:5432/saraya_erp';
    await expect(resetDatabase(prisma)).rejects.toThrow('dedicated');
    expect(query).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses a connection to a different database', async () => {
    query.mockReset().mockResolvedValueOnce([{ name: 'saraya_erp' }]);
    await expect(resetDatabase(prisma)).rejects.toThrow('does not match');
    expect(execute).not.toHaveBeenCalled();
  });

  it('preserves migration history and escapes table identifiers', async () => {
    query.mockResolvedValueOnce([
      { tablename: '_prisma_migrations' },
      { tablename: 'Patient' },
      { tablename: 'odd"name' },
    ]);
    await resetDatabase(prisma);
    expect(execute).toHaveBeenCalledWith(
      'TRUNCATE TABLE "public"."Patient", "public"."odd""name" CASCADE;',
    );
  });

  it('does not issue invalid TRUNCATE for an empty schema', async () => {
    query.mockResolvedValueOnce([]);
    await resetDatabase(prisma);
    expect(execute).not.toHaveBeenCalled();
  });

  it('propagates reset failures to the test runner', async () => {
    query.mockResolvedValueOnce([{ tablename: 'Patient' }]);
    execute.mockRejectedValueOnce(new Error('permission denied'));
    await expect(resetDatabase(prisma)).rejects.toThrow('permission denied');
  });
});
