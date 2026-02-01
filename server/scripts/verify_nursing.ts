
import { PrismaClient, CarePlanType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🏥 Starting Nursing Verification...');

  // 1. Setup Data (Hospital, Patient, Doctor, Nurse, Encounter)
  const hospital = await prisma.hospital.findFirst();
  if (!hospital) throw new Error('No hospital found');

  const doctor = await prisma.user.findFirst({ where: { isDoctor: true } });
  const nurse = await prisma.user.findFirst({ where: { userRoles: { some: { role: { name: 'NURSE' } } } } }) || doctor; // Fallback to doctor if no nurse
  
  if (!doctor || !nurse) throw new Error('Missing users');

  const patient = await prisma.patient.create({
    data: {
      hospitalId: hospital.id,
      fullName: 'Test Patient Nursing',
      mrn: 'TEST-NURSING-001',
    }
  });

  const encounter = await prisma.encounter.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      type: 'IPD',
      status: 'OPEN',
      doctorId: doctor.id
    }
  });

  console.log('✅ Encounter created:', encounter.id);

  // 2. Create Care Plan Item
  const item = await prisma.carePlanItem.create({
    data: {
      encounterId: encounter.id,
      createdById: doctor.id,
      instruction: 'Check Vitals',
      type: CarePlanType.VITALS,
      status: 'ACTIVE'
    }
  });

  console.log('✅ Care Plan Item created:', item.id);

  // 3. Execute Item (Simulate Nursing Action)
  const execution = await prisma.carePlanExecution.create({
    data: {
      carePlanItemId: item.id,
      executedById: nurse.id,
      resultValue: '120/80',
      note: 'Normal'
    }
  });

  console.log('✅ Execution recorded:', execution.id);

  // 4. Verification: Fetch Care Plan items and check executions
  const fetchedItems = await prisma.carePlanItem.findMany({
    where: { encounterId: encounter.id },
    include: {
      executions: {
        orderBy: { executedAt: 'desc' }
      }
    }
  });

  const fetchedItem = fetchedItems.find(i => i.id === item.id);
  
  if (fetchedItem && fetchedItem.executions.length > 0) {
     console.log('🎉 SUCCESS: Execution found via fetch.');
     console.log('Execution:', fetchedItem.executions[0]);
  } else {
     console.error('❌ FAILURE: Execution NOT found in fetch result.');
  }

  // Cleanup
  await prisma.carePlanExecution.deleteMany({ where: { carePlanItemId: item.id }});
  await prisma.carePlanItem.delete({ where: { id: item.id } });
  await prisma.encounter.delete({ where: { id: encounter.id } });
  await prisma.patient.delete({ where: { id: patient.id } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
