import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixPermissions() {
  console.log('Fetching CASHIER role...');
  const cashierRole = await prisma.role.findUnique({ where: { name: 'CASHIER' } });
  
  if (!cashierRole) {
    console.error('CASHIER role not found!');
    return;
  }

  const permissionsToEnsure = [
    { code: 'cashier:view', description: 'عرض لوحة الخزينة وقائمة العمل للكاشير' },
    { code: 'cashier:manage', description: 'إجراءات الخزينة واستلام المدفوعات وتفاصيل الفواتير' }
  ];

  for (const perm of permissionsToEnsure) {
    let permission = await prisma.permission.findUnique({ where: { code: perm.code } });
    if (!permission) {
      console.log(`Creating permission ${perm.code}...`);
      permission = await prisma.permission.create({
        data: { code: perm.code, description: perm.description }
      });
    }

    console.log(`Linking ${perm.code} to CASHIER role...`);
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: cashierRole.id, permissionId: permission.id }
      },
      update: {},
      create: {
        roleId: cashierRole.id,
        permissionId: permission.id
      }
    });
  }

  console.log('Permissions fixed successfully!');
  await prisma.$disconnect();
}

fixPermissions().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
