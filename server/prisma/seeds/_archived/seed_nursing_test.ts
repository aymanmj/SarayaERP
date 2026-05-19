
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Nursing Station Test Data...');

  // 1. Get Hospital and Department
  const hospital = await prisma.hospital.findFirst();
  if (!hospital) throw new Error('No hospital found');

  const department = await prisma.department.findFirst({
    where: { hospitalId: hospital.id }
  });

  // 2. Find or Create Patient
  let patient = await prisma.patient.findFirst({
    where: { mrn: 'TEST-NURSE-001' },
    select: { id: true, mrn: true, fullName: true }
  });

  if (!patient) {
    patient = await prisma.patient.create({
      data: {
        hospitalId: hospital.id,
        mrn: 'TEST-NURSE-001',
        fullName: 'Test Patient (High Fever)',
        gender: 'MALE',
        dateOfBirth: new Date('1980-01-01'),
      },
      select: { id: true, mrn: true, fullName: true }
    });
  }

  // 3. Create Open IPD Encounter
  const encounter = await prisma.encounter.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      status: 'OPEN',
      type: 'IPD',
      departmentId: department?.id,
      admissionDate: new Date(),
    }
  });

  // 4. Add Critical Vitals (Fever & High BP) - Created just now
  await prisma.vitalSign.create({
    data: {
      encounterId: encounter.id,
      temperature: 39.5, // Critical High
      bpSystolic: 185,   // Critical High
      bpDiastolic: 110,
      pulse: 130,        // Tachycardia
      o2Sat: 96,
      respRate: 22,
      createdAt: new Date(), // Now
    }
  });

  console.log('✅ Created critical vitals for patient:', patient.fullName);

  // 5. Add Due Medication (QID, No administrations)
  const product = await prisma.product.findFirst({
    where: { hospitalId: hospital.id, type: 'DRUG' }
  });

  if (product) {
    await prisma.prescription.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        encounterId: encounter.id,
        doctorId: 1, // Assumptions
        status: 'ACTIVE',
        items: {
          create: {
            productId: product.id,
            dose: '500mg',
            route: 'ORAL',
            frequency: 'QID', // 4 times a day
            durationDays: 5,
            quantity: 20,
            notes: 'Give immediately',
          }
        }
      }
    });
    console.log('✅ Created due medication (QID) for product:', product.name);
  }

  console.log('🚀 Nursing Test Data Seeded Successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
