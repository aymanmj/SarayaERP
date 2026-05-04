const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orgSettings = await prisma.orgSetting.findMany({
    where: { key: { in: ['mpi.enableFederation', 'mpi.requirePatientOTP'] } }
  });
  console.log('OrgSettings:', orgSettings);

  const sysSettings = await prisma.systemSetting.findMany({
    where: { key: { in: ['mpi.enableFederation', 'mpi.requirePatientOTP'] } }
  });
  console.log('SystemSettings:', sysSettings);

  const hospitals = await prisma.hospital.findMany({
    select: { id: true, name: true, organizationId: true }
  });
  console.log('Hospitals:', hospitals);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
