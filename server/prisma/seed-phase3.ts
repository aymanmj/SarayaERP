import { PrismaClient, OrderSetItemType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Phase 3: Order Sets and Clinical Pathways...');

  // 1. Ensure hospital exists
  let hospital = await prisma.hospital.findFirst();
  if (!hospital) {
    hospital = await prisma.hospital.create({
      data: {
        name: 'Saraya Medical Center',
        code: 'SMC-01',
      },
    });
  }

  // 2. Ensure admin user exists
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        hospitalId: hospital.id,
        fullName: 'System Admin',
        username: 'admin',
        passwordHash: 'hashed', // mock
        email: 'admin@sarayamedical.com',
      },
    });
  }

  // 3. Create mock lab test, radiology study, and product
  const labTest = await prisma.labTest.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'CBC-01' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'CBC-01',
      name: 'Complete Blood Count',
      arabicName: 'صورة دم كاملة',
    },
  });

  const troponinLab = await prisma.labTest.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'TROP-01' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'TROP-01',
      name: 'Troponin I',
      arabicName: 'تحليل تروبونين',
    },
  });

  const radiologyStudy = await prisma.radiologyStudy.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'CXR-01' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'CXR-01',
      name: 'Chest X-Ray',
      arabicName: 'أشعة سينية على الصدر',
      modality: 'XR',
    },
  });

  const medication = await prisma.product.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'MED-ASP-01' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      code: 'MED-ASP-01',
      name: 'Aspirin 81mg',
      type: 'DRUG',
    },
  });

  // 4. Create Order Set: Chest Pain Workup
  console.log('Creating Order Set: Chest Pain Workup...');
  const existingOrderSet = await prisma.orderSet.findFirst({
    where: {
      hospitalId: hospital.id,
      name: 'Chest Pain Workup',
      version: 1,
    },
  });

  let orderSetId;
  if (!existingOrderSet) {
    const newOs = await prisma.orderSet.create({
      data: {
        hospitalId: hospital.id,
        createdById: user.id,
        name: 'Chest Pain Workup',
        nameAr: 'بروتوكول ألم الصدر',
        description: 'Standard workup for adult patients presenting with acute chest pain',
        category: 'ER',
        specialty: 'Cardiology',
        items: {
          create: [
            { itemType: OrderSetItemType.LAB, labTestId: labTest.id, priority: 'STAT', isRequired: true, sortOrder: 0 },
            { itemType: OrderSetItemType.LAB, labTestId: troponinLab.id, priority: 'STAT', isRequired: true, sortOrder: 1 },
            { itemType: OrderSetItemType.RADIOLOGY, radiologyStudyId: radiologyStudy.id, priority: 'URGENT', isRequired: true, sortOrder: 2 },
            { itemType: OrderSetItemType.MEDICATION, productId: medication.id, route: 'PO', frequency: 'STAT', dose: '1 tablet', priority: 'STAT', sortOrder: 3 },
            { itemType: OrderSetItemType.NURSING, nursingAction: 'ECG 12-lead', priority: 'STAT', isRequired: true, sortOrder: 4 },
            { itemType: OrderSetItemType.NURSING, nursingAction: 'Start IV Line', priority: 'STAT', isRequired: true, sortOrder: 5 },
          ]
        }
      }
    });
    orderSetId = newOs.id;
  } else {
    orderSetId = existingOrderSet.id;
  }

  // 5. Create Clinical Pathway: Pneumonia
  console.log('Creating Clinical Pathway: Pneumonia...');
  const existingPathway = await prisma.clinicalPathway.findFirst({
    where: {
      hospitalId: hospital.id,
      name: 'Community Acquired Pneumonia',
      version: 1,
    },
  });

  if (!existingPathway) {
    await prisma.clinicalPathway.create({
      data: {
        hospitalId: hospital.id,
        createdById: user.id,
        name: 'Community Acquired Pneumonia',
        nameAr: 'المسار السريري لالتهاب الرئة',
        description: 'Standard management pathway for uncomplciated CAP',
        targetDiagnosis: 'Pneumonia (J18.9)',
        expectedLOS: 4,
        steps: {
          create: [
            {
              dayNumber: 0,
              phase: 'Assessment',
              title: 'Initial Assessment & Orders',
              titleAr: 'التقييم الأولي والطلبات',
              orderSetId: orderSetId, // using the chest pain one just as a demo, in reality we'd have a pneumonia order set
              expectedOutcome: 'Oxygen saturation > 92%',
              sortOrder: 0,
            },
            {
              dayNumber: 1,
              phase: 'Treatment',
              title: 'Continue IV Antibiotics',
              titleAr: 'استمرار المضادات الحيوية',
              expectedOutcome: 'Patient afebrile for 24h',
              sortOrder: 1,
            },
            {
              dayNumber: 2,
              phase: 'Monitoring',
              title: 'Review Labs and Switch to PO',
              titleAr: 'مراجعة التحاليل والانتقال لأدوية الفم',
              expectedOutcome: 'WBC decreasing, tolerating PO',
              sortOrder: 2,
            },
            {
              dayNumber: 3,
              phase: 'Discharge',
              title: 'Discharge Planning',
              titleAr: 'تخطيط الخروج',
              expectedOutcome: 'Ready for discharge with PO meds',
              sortOrder: 3,
            }
          ]
        }
      }
    });
  }

  console.log('Done.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
