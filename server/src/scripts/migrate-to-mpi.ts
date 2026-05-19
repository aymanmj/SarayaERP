import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration to Master Patient Index (MPI)...');

  // Fetch all existing patients
  const existingPatients = await prisma.patient.findMany();
  console.log(
    `Found ${existingPatients.length} existing local patients to migrate.`,
  );

  for (const patient of existingPatients) {
    try {
      // 1. Check if a GlobalPatient already exists with this national ID hash
      let globalPatient;
      if (patient.nationalIdHash) {
        globalPatient = await prisma.globalPatient.findUnique({
          where: { nationalIdHash: patient.nationalIdHash },
        });
      }

      // If we don't have a national ID hash, we'll try phone hash
      if (!globalPatient && patient.phoneHash) {
        globalPatient = await prisma.globalPatient.findUnique({
          where: { phoneHash: patient.phoneHash },
        });
      }

      // 2. Create GlobalPatient if it doesn't exist
      if (!globalPatient) {
        globalPatient = await prisma.globalPatient.create({
          data: {
            fullName: patient.fullName,
            nationalId: patient.nationalId,
            dateOfBirth: patient.dateOfBirth,
            gender: patient.gender,
            identityType: patient.identityType,
            identityNumber: patient.identityNumber,
            nationalIdHash: patient.nationalIdHash,
            identityNumberHash: patient.identityNumberHash,
            phoneHash: patient.phoneHash,
            emailHash: patient.emailHash,
          },
        });
        console.log(
          `Created GlobalPatient [ID: ${globalPatient.id}] for LocalPatient [ID: ${patient.id}]`,
        );
      } else {
        console.log(
          `Matched existing GlobalPatient [ID: ${globalPatient.id}] for LocalPatient [ID: ${patient.id}]`,
        );
      }

      // 3. Link Local Patient to Global Patient
      await prisma.patient.update({
        where: { id: patient.id },
        data: {
          globalPatientId: globalPatient.id,
        },
      });
    } catch (error) {
      console.error(`Error migrating patient ID ${patient.id}:`, error);
    }
  }

  console.log('MPI Migration Completed Successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
