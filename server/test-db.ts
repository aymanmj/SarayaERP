import { PrismaClient } from '@prisma/client';
process.env.DATABASE_URL = 'postgresql://prisma:prisma@localhost:5433/saraya_dev?schema=public';
const prisma = new PrismaClient();
async function main() {
  const patient = await prisma.patient.findFirst({ where: { mrn: 'MRN-0001' } });
  console.log(patient);
}
main().finally(() => prisma.$disconnect());
