import { PrismaClient } from '@prisma/client';

export const resetDatabase = async (prisma: PrismaClient) => {
  // 1. Get all table names
  // This approach ensures we clean everything even if models change
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations')
    .map((name) => `"public"."${name}"`)
    .join(', ');

  try {
    // 2. Truncate all tables with CASCADE
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
  } catch (error) {
    console.error('Error reseting database:', error);
  }
};
