const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const services = await prisma.serviceItem.findMany({
    where: {
      OR: [
        { name: { contains: 'Delivery', mode: 'insensitive' } },
        { name: { contains: 'Cesarean', mode: 'insensitive' } },
        { name: { contains: 'CS', mode: 'insensitive' } },
        { name: { contains: 'Labor', mode: 'insensitive' } },
        { name: { contains: 'Birth', mode: 'insensitive' } }
      ]
    }
  });
  console.log(JSON.stringify(services, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
