// prisma/seed-medical-data.ts

import { PrismaClient, ProductType, ServiceType } from '@prisma/client';

const prisma = new PrismaClient();

const diagnoses = [
  { code: 'E11.9', nameEn: 'Type 2 diabetes mellitus without complications', nameAr: 'السكري من النوع 2 (بدون مضاعفات)' },
  { code: 'I10', nameEn: 'Essential (primary) hypertension', nameAr: 'ارتفاع ضغط الدم الأساسي' },
  { code: 'J00', nameEn: 'Acute nasopharyngitis [common cold]', nameAr: 'التهاب البلعوم الأنفي الحاد (زكام)' },
  { code: 'K21.9', nameEn: 'Gastro-esophageal reflux disease without esophagitis', nameAr: 'ارتجاع المريء' },
  { code: 'J45.909', nameEn: 'Unspecified asthma, uncomplicated', nameAr: 'ربو شعبي' },
  { code: 'M54.5', nameEn: 'Low back pain', nameAr: 'ألم أسفل الظهر' },
  { code: 'R51', nameEn: 'Headache', nameAr: 'صداع' },
  { code: 'K35.80', nameEn: 'Unspecified acute appendicitis', nameAr: 'التهاب الزائدة الدودية الحاد' },
  { code: 'A09', nameEn: 'Infectious gastroenteritis and colitis', nameAr: 'نزلات معوية' },
  { code: 'N39.0', nameEn: 'Urinary tract infection, site not specified', nameAr: 'التهاب المسالك البولية' },
  { code: 'H10.1', nameEn: 'Acute atopic conjunctivitis', nameAr: 'التهاب ملتحمة تحسسي' },
  { code: 'L20.9', nameEn: 'Atopic dermatitis, unspecified', nameAr: 'اكزيما' },
  { code: 'R07.9', nameEn: 'Chest pain, unspecified', nameAr: 'ألم في الصدر' },
  { code: 'E78.5', nameEn: 'Hyperlipidemia, unspecified', nameAr: 'ارتفاع دهون الدم' },
  { code: 'D64.9', nameEn: 'Anemia, unspecified', nameAr: 'فقر دم' },
  { code: 'J03.90', nameEn: 'Acute tonsillitis, unspecified', nameAr: 'التهاب اللوزتين الحاد' },
  { code: 'K29.70', nameEn: 'Gastritis, unspecified, without bleeding', nameAr: 'التهاب المعدة' },
  { code: 'R11.2', nameEn: 'Nausea with vomiting', nameAr: 'غثيان وقيء' },
  { code: 'M25.561', nameEn: 'Pain in right knee', nameAr: 'ألم الركبة اليمنى' },
  { code: 'S01.90XA', nameEn: 'Unspecified open wound of head', nameAr: 'جرح مفتوح في الرأس' },
];

const cptCodes = [
  { code: '99203', nameEn: 'Office/outpatient visit new patient level 3', category: 'E&M' },
  { code: '99213', nameEn: 'Office/outpatient visit est patient level 3', category: 'E&M' },
  { code: '90791', nameEn: 'Psychiatric diagnostic evaluation', category: 'Psychiatry' },
  { code: '85025', nameEn: 'Blood count; complete (CBC), automated', category: 'Pathology' },
  { code: '80053', nameEn: 'Comprehensive metabolic panel', category: 'Pathology' },
  { code: '71045', nameEn: 'Radiologic examination, chest; single view', category: 'Radiology' },
  { code: '73721', nameEn: 'MRI joint of lower extremity w/o contrast', category: 'Radiology' },
  { code: '30000', nameEn: 'Drainage abscess of nose, internal approach', category: 'Surgery' },
];

const drugs = [
  { code: 'DRG-001', name: 'Panadol 500mg', generic: 'Paracetamol', form: 'Tablet', price: 5.0 },
  { code: 'DRG-002', name: 'Augmentin 1g', generic: 'Amoxicillin/Clavulanate', form: 'Tablet', price: 25.0 },
  { code: 'DRG-003', name: 'Profen 400mg', generic: 'Ibuprofen', form: 'Tablet', price: 8.0 },
  { code: 'DRG-004', name: 'Nexium 40mg', generic: 'Esomeprazole', form: 'Capsule', price: 45.0 },
  { code: 'DRG-005', name: 'Concor 5mg', generic: 'Bisoprolol', form: 'Tablet', price: 15.0 },
  { code: 'DRG-006', name: 'Glucophage 500mg', generic: 'Metformin', form: 'Tablet', price: 10.0 },
  { code: 'DRG-007', name: 'Zithromax 500mg', generic: 'Azithromycin', form: 'Capsule', price: 35.0 },
  { code: 'DRG-008', name: 'Voltaren 75mg', generic: 'Diclofenac', form: 'Injection', price: 6.0 },
  { code: 'DRG-009', name: 'Cipro 500mg', generic: 'Ciprofloxacin', form: 'Tablet', price: 20.0 },
  { code: 'DRG-010', name: 'Flagyl 500mg', generic: 'Metronidazole', form: 'Tablet', price: 12.0 },
  { code: 'DRG-011', name: 'Aspirin 81mg', generic: 'Acetylsalicylic Acid', form: 'Tablet', price: 5.0 },
  { code: 'DRG-012', name: 'Lipitor 20mg', generic: 'Atorvastatin', form: 'Tablet', price: 55.0 },
  { code: 'DRG-013', name: 'Ventolin Inhaler', generic: 'Salbutamol', form: 'Inhaler', price: 18.0 },
  { code: 'DRG-014', name: 'Rocephin 1g', generic: 'Ceftriaxone', form: 'Injection', price: 25.0 },
  { code: 'DRG-015', name: 'Lasix 40mg', generic: 'Furosemide', form: 'Tablet', price: 7.0 },
];

async function main() {
  console.log('🌱 Seeding Medical Data...');

  // 1. Get Hospital
  const hospital = await prisma.hospital.findFirst();
  if (!hospital) {
    console.error('No hospital found! Run basic seed first.');
    return;
  }

  // 2. Seed Diagnoses (ICD-10)
  console.log(`Seeding ${diagnoses.length} ICD-10 codes...`);
  for (const d of diagnoses) {
    await prisma.diagnosisCode.upsert({
      where: { code: d.code },
      update: {},
      create: {
        code: d.code,
        nameEn: d.nameEn,
        nameAr: d.nameAr,
        isActive: true,
      },
    });
  }
  console.log('✅ Diagnoses seeded.');

  // 3. Seed CPT Codes
  console.log(`Seeding ${cptCodes.length} CPT codes...`);
  for (const c of cptCodes) {
    await prisma.cPTCode.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        nameEn: c.nameEn,
        nameAr: c.nameEn, // Default to English if no Arabic
        category: c.category,
        isActive: true,
      },
    });
    
    // Also create ServiceItem if doesn't exist
    const serviceItem = await prisma.serviceItem.upsert({
      where: { code: c.code }, // Assuming CPT code is used as service code
      update: {},
      create: {
        hospitalId: hospital.id,
        code: c.code,
        name: c.nameEn,
        type: c.category === 'Pathology' ? ServiceType.LAB : c.category === 'Radiology' ? ServiceType.RADIOLOGY : ServiceType.CONSULTATION,
        defaultPrice: 100.0,
        isActive: true,
        isBillable: true,
      }
    });

    // 4. Populate Lab/Radiology catalogs based on CPT
    if (c.category === 'Pathology') {
      await prisma.labTest.upsert({
        where: { hospitalId_code: { hospitalId: hospital.id, code: c.code } },
        update: { serviceItemId: serviceItem.id },
        create: {
          hospitalId: hospital.id,
          code: c.code,
          name: c.nameEn,
          category: 'Chemistry', // Default category
          isActive: true,
          serviceItemId: serviceItem.id
        }
      });
    } else if (c.category === 'Radiology') {
      await prisma.radiologyStudy.upsert({
        where: { hospitalId_code: { hospitalId: hospital.id, code: c.code } },
        update: { serviceItemId: serviceItem.id },
        create: {
          hospitalId: hospital.id,
          code: c.code,
          name: c.nameEn,
          modality: 'X-RAY', // Default
          isActive: true,
          serviceItemId: serviceItem.id
        }
      });
    }
  }
  console.log('✅ CPT Codes seeded.');

  // 4. Seed Drugs
  console.log(`Seeding ${drugs.length} Drugs...`);
  for (const d of drugs) {
    await prisma.product.upsert({
      where: { hospitalId_code: { hospitalId: hospital.id, code: d.code } },
      update: {},
      create: {
        hospitalId: hospital.id,
        code: d.code,
        name: d.name,
        genericName: d.generic,
        type: ProductType.DRUG,
        form: d.form,
        sellPrice: d.price,
        costPrice: d.price * 0.7, // Assume 30% margin
        stockOnHand: 1000,
        isActive: true,
      },
    });
  }
  console.log('✅ Drugs seeded.');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
