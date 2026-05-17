import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const hospital = await prisma.hospital.findFirst();
  if (!hospital) return;
  console.log("Hospital ID:", hospital.id);
  console.log("Hospital Organization ID:", hospital.organizationId);

  const mpiEnableFederation = true;
  
  if (hospital.organizationId) {
    await prisma.orgSetting.upsert({
      where: { organizationId_key: { organizationId: hospital.organizationId, key: 'mpi.enableFederation' } },
      update: { value: mpiEnableFederation ? 'true' : 'false' },
      create: { organizationId: hospital.organizationId, key: 'mpi.enableFederation', value: mpiEnableFederation ? 'true' : 'false', description: 'Enable MPI Federation' },
    });
    console.log("Upserted OrgSetting");
  } else {
    await prisma.systemSetting.upsert({
      where: { hospitalId_key: { hospitalId: hospital.id, key: 'mpi.enableFederation' } },
      update: { value: mpiEnableFederation ? 'true' : 'false' },
      create: { hospitalId: hospital.id, key: 'mpi.enableFederation', value: mpiEnableFederation ? 'true' : 'false', description: 'Enable MPI Federation' },
    });
    console.log("Upserted SystemSetting");
  }

  // Get
  let check = false;
  if (hospital.organizationId) {
    const settings = await prisma.orgSetting.findMany({
      where: { organizationId: hospital.organizationId, key: 'mpi.enableFederation' }
    });
    if (settings.length > 0) check = settings[0].value === 'true';
  } else {
    const settings = await prisma.systemSetting.findMany({
      where: { hospitalId: hospital.id, key: 'mpi.enableFederation' }
    });
    if (settings.length > 0) check = settings[0].value === 'true';
  }
  
  console.log("Retrieved mpiEnableFederation:", check);
}

main().catch(console.error).finally(() => prisma.$disconnect());
