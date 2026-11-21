import { PrismaClient } from '@prisma/client';
import { appendChainedAudit } from '../src/audit/audit-chain';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './db-reset';

describe('PostgreSQL audit chain concurrency (e2e)', () => {
  const prisma = new PrismaClient();
  const verifier = new AuditService(prisma as PrismaService);
  beforeAll(async () => {
    await prisma.$connect();
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('serializes simultaneous writes, redacts secrets and detects amount tampering', async () => {
    const hospital = await prisma.hospital.create({
      data: { code: 'AUDIT-TEST', name: 'Audit Test Hospital' },
    });
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        appendChainedAudit(prisma, {
          hospitalId: hospital.id,
          action: 'TEST_POSTING',
          entity: 'Invoice',
          entityId: index + 1,
          newValues: {
            amount: String(index + 1),
            nested: { token: 'must-not-be-persisted' },
          },
        }),
      ),
    );
    const records = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
    expect(records).toHaveLength(10);
    expect(JSON.stringify(records)).not.toContain('must-not-be-persisted');
    expect((await verifier.verifyChain()).valid).toBe(true);
    await prisma.auditLog.update({
      where: { id: records[3].id },
      data: { newValues: { amount: '999999.999' } },
    });
    expect(await verifier.verifyChain()).toMatchObject({
      valid: false,
      brokenAtId: records[3].id,
    });
  });
});
