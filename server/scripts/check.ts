import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const hospital = await prisma.hospital.findFirst({
    include: { organization: true }
  });
  console.log("Hospital ID:", hospital?.id);
  console.log("Organization ID:", hospital?.organizationId);
  console.log("Org:", hospital?.organization);
  
  const orgSettings = await prisma.orgSetting.findMany();
  console.log("OrgSettings:", orgSettings);
}

check().finally(() => prisma.$disconnect());
