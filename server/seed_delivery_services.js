const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SERVICES = [
  { code: 'NVD_PKG', name: 'Normal Vaginal Delivery (NVD)', price: 3000 },
  { code: 'NVD_ASSIST_PKG', name: 'Assisted NVD (Vacuum/Forceps)', price: 3500 },
  { code: 'CS_FIRST_PKG', name: 'Cesarean Section (First Time)', price: 6000 },
  { code: 'CS_REPEAT_PKG', name: 'Cesarean Section (Repeat)', price: 7000 },
  { code: 'CS_EMERG_PKG', name: 'Cesarean Section (Emergency)', price: 8000 },
  { code: 'VBAC_PKG', name: 'VBAC Delivery', price: 4000 },
  { code: 'EPIDURAL_ADDON', name: 'Epidural Analgesia', price: 1000 },
];

async function main() {
  console.log('Seeding Delivery Service Items...');
  
  for (const service of SERVICES) {
    const existing = await prisma.serviceItem.findFirst({
        where: { OR: [{ code: service.code }, { name: service.name }] }
    });

    if (!existing) {
        await prisma.serviceItem.create({
            data: {
                code: service.code,
                name: service.name,
                basePrice: service.price,
                type: 'PROCEDURE',
                isActive: true,
                departmentId: 1 // Assuming 1 is default/OBGYN department for now
            }
        });
        console.log(`Created: ${service.name}`);
    } else {
        console.log(`Skipped (Exists): ${service.name}`);
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
