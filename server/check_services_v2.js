const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const services = await prisma.serviceItem.findMany({
      where: {
        OR: [
          { name: { contains: 'Delivery', mode: 'insensitive' } },
          { name: { contains: 'Cesarean', mode: 'insensitive' } },
          { name: { contains: 'CS', mode: 'insensitive' } }
        ]
      }
    });
    console.log(JSON.stringify(services, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
