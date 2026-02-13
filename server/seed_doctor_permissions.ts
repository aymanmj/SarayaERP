
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DOCTOR_PERMISSIONS = [
  { code: 'INPATIENT_VIEW_MY_PATIENTS', description: 'View assigned inpatients for rounds' },
  { code: 'INPATIENT_VIEW_NOTES', description: 'View clinical notes for inpatients' },
  { code: 'INPATIENT_ADD_NOTE', description: 'Add clinical notes (rounds) for inpatients' },
  { code: 'INPATIENT_VIEW_CARE_PLAN', description: 'View care plan items' },
  { code: 'INPATIENT_ADD_ORDER', description: 'Add care plan orders/instructions' },
  { code: 'INPATIENT_COMPLETE_ORDER', description: 'Mark care plan items as completed' },
  { code: 'INPATIENT_VIEW_EXECUTIONS', description: 'View execution history of care plan' },
];

async function main() {
  console.log('Seeding Doctor Permissions...');

  const doctorRole = await prisma.role.findUnique({
      where: { name: 'DOCTOR' }
  });

  if (!doctorRole) {
      console.error('Role DOCTOR not found!');
      return;
  }

  for (const perm of DOCTOR_PERMISSIONS) {
      // 1. Create Permission if not exists
      const p = await prisma.permission.upsert({
          where: { code: perm.code },
          update: {},
          create: {
              code: perm.code,
              description: perm.description
          }
      });
      console.log(`Permission ensured: ${p.code}`);

      // 2. Assign to DOCTOR Role
      try {
          await prisma.rolePermission.create({
              data: {
                  roleId: doctorRole.id,
                  permissionId: p.id
              }
          });
          console.log(`Assigned ${p.code} to DOCTOR`);
      } catch (e: any) {
          if (e.code === 'P2002') {
              console.log(`Permission ${p.code} already assigned to DOCTOR`);
          } else {
              console.error(e);
          }
      }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
