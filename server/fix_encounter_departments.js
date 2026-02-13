
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDepartmentIds() {
  console.log('Starting data fix for missing departmentIds...');

  // 1. Find all OPEN IPD encounters with missing departmentId
  // 1. Find all OPEN IPD encounters
  const encounters = await prisma.encounter.findMany({
    where: {
      type: 'IPD',
      status: 'OPEN',
      // departmentId: null, // Commenting out to see everything
    },
    include: {
      doctor: {
        select: { id: true, departmentId: true, fullName: true }
      }
    }
  });

  console.log(`Found ${encounters.length} OPEN IPD encounters total.`);
  encounters.forEach(e => {
      console.log(`ID: ${e.id}, Dept: ${e.departmentId}, Dr: ${e.doctorId}, Status: ${e.status}, Type: ${e.type}`);
  });

  console.log(`Found ${encounters.length} encounters to fix.`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const encounter of encounters) {
    if (encounter.doctor && encounter.doctor.departmentId) {
      console.log(`Fixing Encounter #${encounter.id} (Patient: ${encounter.patientId}) -> Assigning Dept #${encounter.doctor.departmentId} (Dr. ${encounter.doctor.fullName})`);
      
      await prisma.encounter.update({
        where: { id: encounter.id },
        data: { departmentId: encounter.doctor.departmentId }
      });
      fixedCount++;
    } else {
      console.warn(`Skipping Encounter #${encounter.id} - Doctor ${encounter.doctorId} has no department assigned.`);
      skippedCount++;
    }
  }

  console.log(`\nFix Complete!`);
  console.log(`✅ Fixed: ${fixedCount}`);
  console.log(`⚠️ Skipped: ${skippedCount}`);
}

fixDepartmentIds()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
