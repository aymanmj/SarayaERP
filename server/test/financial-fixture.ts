import { PrismaService } from '../src/prisma/prisma.service';
import { SystemAccountKey } from '@prisma/client';

/** Explicit synthetic chart, never auto-configures a production installation. */
export async function seedFinancialAccounts(
  prisma: PrismaService,
  hospitalId: number,
) {
  const keys: SystemAccountKey[] = [
    'CASH_MAIN',
    'BANK_MAIN',
    'RECEIVABLE_PATIENTS',
    'RECEIVABLE_INSURANCE',
    'REVENUE_INPATIENT',
    'REVENUE_OUTPATIENT',
    'REVENUE_LAB',
    'REVENUE_RADIOLOGY',
    'REVENUE_PHARMACY',
    'CASH_SHORT_OVER',
  ];
  for (const key of keys) {
    const account = await prisma.account.create({
      data: {
        hospitalId,
        code: 'TEST-' + key,
        name: 'Synthetic ' + key,
        type:
          key === 'CASH_SHORT_OVER'
            ? 'EXPENSE'
            : key.startsWith('REVENUE')
              ? 'REVENUE'
              : 'ASSET',
      },
    });
    await prisma.systemAccountMapping.create({
      data: { hospitalId, key, accountId: account.id },
    });
  }
}
