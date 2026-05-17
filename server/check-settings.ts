import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orgSettings = await prisma.orgSetting.findMany({
    where: { key: { contains: 'mpi' } }
  });
  console.log("OrgSettings:", orgSettings);

  const sysSettings = await prisma.systemSetting.findMany({
    where: { key: { contains: 'mpi' } }
  });
  console.log("SystemSettings:", sysSettings);
}

main().catch(console.error).finally(() => prisma.$disconnect());
