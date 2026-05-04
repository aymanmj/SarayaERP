import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function repairChain() {
  console.log('Starting Audit Log Hash Chain Repair...');
  
  // Fetch all audit logs ordered by ID ascending to rebuild the chain
  const logs = await prisma.auditLog.findMany({
    orderBy: { id: 'asc' },
  });

  if (logs.length === 0) {
    console.log('No audit logs found.');
    return;
  }

  let previousHash = 'GENESIS';
  let fixedCount = 0;

  for (const log of logs) {
    // Reconstruct the exact string used for hashing
    const dataToHash = `${previousHash}|${log.action}|${log.entity || ''}|${log.entityId || ''}|${log.userId || ''}|${log.createdAt.toISOString()}`;
    const computedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    // If the hash or previousHash doesn't match what's in DB, update it
    if (log.hash !== computedHash || log.previousHash !== previousHash) {
      await prisma.auditLog.update({
        where: { id: log.id },
        data: {
          previousHash,
          hash: computedHash,
        },
      });
      fixedCount++;
      console.log(`Repaired Log ID: ${log.id}`);
    }

    // Move to next log
    previousHash = computedHash;
  }

  console.log(`\nRepair Complete. Fixed ${fixedCount} out of ${logs.length} logs.`);
  await prisma.$disconnect();
}

repairChain().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
