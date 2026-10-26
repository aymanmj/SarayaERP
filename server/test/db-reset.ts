import { PrismaClient } from '@prisma/client';

export const resetDatabase = async (prisma: PrismaClient) => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Database reset requires NODE_ENV=test');
  }
  const url = new URL(process.env.DATABASE_URL || '');
  const configuredName = decodeURIComponent(url.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !/_(test|testing)$/.test(configuredName)
  ) {
    throw new Error(
      'Database reset requires a dedicated _test or _testing database',
    );
  }
  const [database] = await prisma.$queryRaw<
    { name: string }[]
  >`SELECT current_database() AS name`;
  if (database?.name !== configuredName) {
    throw new Error('Connected database does not match the test database URL');
  }
  // 1. Get all table names
  // This approach ensures we clean everything even if models change
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations')
    .map((name) => `"public"."${name.replace(/"/g, '""')}"`)
    .join(', ');

  if (tables) {
    // Setup failures must fail the test rather than leave contaminated fixtures.
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
  }
};
