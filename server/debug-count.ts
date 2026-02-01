import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking InventoryCount ID 7...');
  try {
    const count = await prisma.inventoryCount.findUnique({
      where: { id: 7 },
    });
    console.log('Result:', count);
    
    if (count) {
       console.log(`HospitalId Match? Record: ${count.hospitalId} vs Requested: 1`);
    } else {
        const all = await prisma.inventoryCount.findMany({ take: 5 });
        console.log('Recent Counts:', all);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
