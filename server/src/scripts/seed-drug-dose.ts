import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultDoseRanges = [
  {
    drugName: 'Paracetamol IV',
    form: 'IV',
    route: 'IV',
    minDoseValue: 500,
    maxDoseValue: 1000,
    doseUnit: 'mg',
    frequencyMax: 4
  },
  {
    drugName: 'Paracetamol Oral',
    form: 'Tablet',
    route: 'PO',
    minDoseValue: 500,
    maxDoseValue: 1000,
    doseUnit: 'mg',
    frequencyMax: 4
  },
  {
    drugName: 'Amoxicillin',
    form: 'Capsule',
    route: 'PO',
    minDoseValue: 250,
    maxDoseValue: 875,
    doseUnit: 'mg',
    frequencyMax: 3
  },
  {
    drugName: 'Ibuprofen',
    form: 'Tablet',
    route: 'PO',
    minDoseValue: 200,
    maxDoseValue: 800,
    doseUnit: 'mg',
    frequencyMax: 4
  },
  {
    drugName: 'Vancomycin hydrochloride',
    form: 'Injection',
    route: 'IV',
    minDoseValue: 500,
    maxDoseValue: 2000,
    doseUnit: 'mg',
    frequencyMax: 4
  },
  {
    drugName: 'Gentamicin 80mg',
    form: 'Injection',
    route: 'IV',
    minDoseValue: 80,
    maxDoseValue: 120,
    doseUnit: 'mg',
    frequencyMax: 3
  }
];

async function seedDrugDoseRanges() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Drug Dose Range Seeding Script                         ║');
  console.log('║   Injects foundational CDSS dose bounds                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let imported = 0;
  for (const range of defaultDoseRanges) {
    try {
      const existing = await prisma.drugDoseRange.findFirst({
        where: { drugName: { equals: range.drugName, mode: 'insensitive' } }
      });

      if (!existing) {
        await prisma.drugDoseRange.create({
          data: range
        });
        imported++;
      } else {
        await prisma.drugDoseRange.update({
          where: { id: existing.id },
          data: range
        });
        imported++;
      }
    } catch (e) {
      console.error(`❌ Failed to seed ${range.drugName}`, e);
    }
  }

  console.log(`\n✅ Seeding Completed. Updated/Inserted ${imported} records.`);
}

seedDrugDoseRanges()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
