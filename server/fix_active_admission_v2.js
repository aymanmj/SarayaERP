
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Searching for active admissions...');

  const activeAdmissions = await prisma.admission.findMany({
    where: {
      admissionStatus: {
        in: ['ADMITTED', 'IN_PROGRESS']
      }
    }
  });

  console.log(`Found ${activeAdmissions.length} active admissions.`);

  for (const admission of activeAdmissions) {
    console.log(`Processing Admission ID: ${admission.id}, Patient ID: ${admission.patientId}, Status: ${admission.admissionStatus}`);
    
    // You can filter by patient ID if needed, e.g., if (admission.patientId === 1)
    if (admission.id === 1 || admission.patientId === 1) {
        console.log('Force discharging this admission...');
        await prisma.admission.update({
            where: { id: admission.id },
            data: {
                admissionStatus: 'DISCHARGED',
                dischargeDate: new Date(),
                dischargeDisposition: 'HOME',
                updatedAt: new Date(),
            },
        });
        
        // Close encounter if exists
        if (admission.encounterId) {
             await prisma.encounter.update({
                where: { id: admission.encounterId },
                data: { status: 'CLOSED' }
            });
            console.log(`Encounter #${admission.encounterId} closed.`);
        }
        console.log('Done.');
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
