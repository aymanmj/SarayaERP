// prisma/seed-medical-data.ts

import { PrismaClient } from '@prisma/client';
import { getDiagnoses } from '../data/diagnoses'; // تأكد من المسار
import { getProducts } from '../data/products'; // تأكد من المسار

const prisma = new PrismaClient();

async function main() {
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

  // نستخدم createMany إذا كانت قاعدة البيانات تدعمه (Postgres تدعمه) لتسريع العملية
  // لكن upsert أضمن لتجنب التكرار عند إعادة التشغيل.
  // للسرعة والأمان، سنستخدم loop مع upsert

  let diagCount = 0;
  for (const d of diagnoses) {
    await prisma.diagnosisCode.upsert({
      where: { code: d.code },
      update: { nameEn: d.nameEn, nameAr: d.nameAr },
      create: {
        code: d.code,
        nameEn: d.nameEn,
        nameAr: d.nameAr,
        isActive: true,
      },
    });
    diagCount++;
    if (diagCount % 50 === 0) process.stdout.write('.');
  }
  console.log(`\n✅ Finished Diagnoses (${diagCount}).`);

  // 3. زرع الأدوية والمستلزمات (Products)
  const products = getProducts();
  console.log(`💊 Seeding ${products.length} products (Drugs & Supplies)...`);

  let prodCount = 0;
  for (const p of products) {
    await prisma.product.upsert({
      where: { hospitalId_code: { hospitalId, code: p.code } },
      update: {
        stockOnHand: p.stockOnHand, // تحديث الرصيد إذا أعدنا التشغيل
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
      },
    });
    prodCount++;
    if (prodCount % 50 === 0) process.stdout.write('.');
  }
  console.log(`\n✅ Finished Products (${prodCount}).`);

  console.log('🎉 ALL SEEDING COMPLETED SUCCESSFULLY!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
