const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupOrphanedBeds() {
  console.log('🔄 Starting Orphaned Bed Assignments Cleanup...');

  // 1. Get all encounters that have more than 1 active bed assignment
  const assignments = await prisma.bedAssignment.findMany({
    where: { to: null },
    orderBy: { from: 'desc' }
  });

  // Group by encounterId
  const encounterMap = new Map();
  for (const asgn of assignments) {
    if (!encounterMap.has(asgn.encounterId)) {
      encounterMap.set(asgn.encounterId, []);
    }
    encounterMap.get(asgn.encounterId).push(asgn);
  }

  let fixedCount = 0;

  for (const [encounterId, records] of encounterMap.entries()) {
    if (records.length > 1) {
      console.log(`\n⚠️ Encounter ${encounterId} has ${records.length} active bed assignments. Keeping the newest, closing others...`);
      
      // Since it's ordered by "from" desc, index 0 is the newest.
      const newestId = records[0].id;

      // Close all except the newest
      const idsToClose = records.slice(1).map(r => r.id);
      
      for (const oldAssignment of records.slice(1)) {
         // Free up the physical bed implicitly if needed
         await prisma.bed.update({
           where: { id: oldAssignment.bedId },
           data: { status: 'CLEANING' } // Mark old beds as needing cleaning
         }).catch(() => {});
      }

      await prisma.bedAssignment.updateMany({
        where: { id: { in: idsToClose } },
        data: { to: new Date() }
      });

      console.log(`✅ Fixed Encounter ${encounterId}. Closed assignments: ${idsToClose.join(', ')}`);
      fixedCount++;
    }
  }

  console.log(`\n🎉 Cleanup complete! Fixed ${fixedCount} encounters.`);
}

cleanupOrphanedBeds()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
