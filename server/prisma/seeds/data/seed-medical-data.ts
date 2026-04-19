// prisma/seed-medical-data.ts

import { PrismaClient, TerminologySystem } from '@prisma/client';
import { getDiagnoses } from '../data/diagnoses'; // تأكد من المسار
import { getProducts } from '../data/products'; // تأكد من المسار

const prisma = new PrismaClient();

export async function seedMedicalData() {
  console.log('🚀 Starting Massive Medical Seeding...');

  // 1. التحقق من وجود مستشفى
  const hospital = await prisma.hospital.findFirst();
  if (!hospital) {
    console.error(
      '❌ Error: No hospital found. Please run "npm run prisma:seed" first.',
    );
    return;
  }
  const hospitalId = hospital.id;

  // 2. زرع التشخيصات (Diagnoses)
  const diagnoses = getDiagnoses();
  console.log(`🩺 Seeding ${diagnoses.length} diagnosis codes...`);

  let diagCount = 0;
  for (const d of diagnoses) {
    const diagnosisConcept = await prisma.terminologyConcept.findUnique({
      where: {
        system_code: {
          system: TerminologySystem.ICD10,
          code: d.code,
        },
      },
      select: { id: true },
    });

    await prisma.diagnosisCode.upsert({
      where: { code: d.code },
      update: {
        nameEn: d.nameEn,
        nameAr: d.nameAr,
        icd10Code: d.code, // ✅ Add Standard Code
        terminologyConceptId: diagnosisConcept?.id,
      },
      create: {
        code: d.code,
        nameEn: d.nameEn,
        nameAr: d.nameAr,
        isActive: true,
        icd10Code: d.code, // ✅ Add Standard Code
        terminologyConceptId: diagnosisConcept?.id,
      },
    });
    diagCount++;
    if (diagCount % 100 === 0) process.stdout.write('.');
  }
  console.log(`\n✅ Finished Diagnoses (${diagCount}).`);

  // 3. زرع الأدوية والمستلزمات (Products)
  const products = getProducts();
  console.log(`💊 Seeding ${products.length} products (Drugs & Supplies)...`);

  let prodCount = 0;
  for (const p of products) {
    const productConcept = p.rxNormCode
      ? await prisma.terminologyConcept.findFirst({
          where: {
            isActive: true,
            OR: [
              {
                system: TerminologySystem.RXNORM,
                code: p.rxNormCode,
              },
              {
                system: TerminologySystem.ATC,
                display: {
                  equals: p.genericName,
                  mode: 'insensitive',
                },
              },
            ],
          },
          select: { id: true },
        })
      : await prisma.terminologyConcept.findFirst({
          where: {
            isActive: true,
            system: TerminologySystem.ATC,
            display: {
              equals: p.genericName,
              mode: 'insensitive',
            },
          },
          select: { id: true },
        });

    await prisma.product.upsert({
      where: { hospitalId_code: { hospitalId, code: p.code } },
      update: {
        stockOnHand: p.stockOnHand,
        terminologyConceptId: productConcept?.id,
        // rxNormCode: p.rxNormCode, // Optional update
      },
      create: {
        hospitalId,
        code: p.code,
        name: p.name,
        genericName: p.genericName,
        type: p.type,
        form: p.form,
        strength: p.strength,
        costPrice: p.costPrice,
        sellPrice: p.sellPrice,
        stockOnHand: p.stockOnHand,
        minStock: p.minStock,
        isActive: true,
        rxNormCode: p.rxNormCode, // ✅ Add Standard Code
        terminologyConceptId: productConcept?.id,
      },
    });
    prodCount++;
    if (prodCount % 100 === 0) process.stdout.write('.');
  }
  console.log(`\n✅ Finished Products (${prodCount}).`);
}

// Run if executed directly
if (require.main === module) {
  seedMedicalData()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
