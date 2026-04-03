const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const wards = await prisma.ward.findMany();
  console.log('WARDS:', wards);
}

main().finally(() => prisma.$disconnect());
