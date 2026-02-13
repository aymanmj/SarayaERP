import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking recent encounters...');

  const recentEncounters = await prisma.encounter.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
        patient: { select: { fullName: true } },
        doctor: { select: { id: true, fullName: true, username: true } },
        admission: true
    }
  });

  console.log('Found ' + recentEncounters.length + ' encounters.');
  
  for (const enc of recentEncounters) {
      console.log('------------------------------------------------');
      console.log(`ID: ${enc.id}, Patient: ${enc.patient.fullName}`);
      console.log(`Type: ${enc.type}, Status: ${enc.status}`);
      console.log(`Doctor: ${enc.doctorId} (${enc.doctor?.username || 'N/A'})`);
      console.log(`Has Admission: ${!!enc.admission}, Admission Status: ${enc.admission?.admissionStatus}`);
  }

  console.log('\nChecking recent ADMISSIONS...');
  const recentAdmissions = await prisma.admission.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
          encounter: true,
          patient: true
      }
  });

  console.log('Found ' + recentAdmissions.length + ' admissions.');
  for(const adm of recentAdmissions) {
      console.log('------------------------------------------------');
      console.log(`Adm ID: ${adm.id}, Patient: ${adm.patient.fullName}, Status: ${adm.admissionStatus}`);
      console.log(`Linked Encounter ID: ${adm.encounterId}`);
      console.log(`Encounter Type: ${adm.encounter?.type}, Status: ${adm.encounter?.status}`);
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
