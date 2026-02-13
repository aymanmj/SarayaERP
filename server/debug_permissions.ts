import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking Permissions...');
  
  // 1. Check if permission exists
  const permissionCode = 'INPATIENT_VIEW_MY_PATIENTS';
  const permission = await prisma.permission.findUnique({
    where: { code: permissionCode }
  });
  
  console.log(`Permission '${permissionCode}': ${permission ? 'EXISTS (ID: ' + permission.id + ')' : 'DOES NOT EXIST'}`);

  // 2. Check Roles with this permission
  if (permission) {
      const rolesWithPermission = await prisma.role.findMany({
          where: {
              rolePermissions: {
                  some: { permissionId: permission.id }
              }
          }
      });
      console.log('Roles with this permission:', rolesWithPermission.map(r => r.name).join(', '));
  }

  // 3. Check user roles
  // Allowing dynamic check or default to dr_sara as requested
  const username = process.argv[2] || 'dr_sara'; 
  const user = await prisma.user.findUnique({
      where: { username },
      include: {
          userRoles: {
              include: { 
                  role: {
                      include: { rolePermissions: { include: { permission: true } } }
                  } 
              }
          }
      }
  });

  if (user) {
      console.log(`User '${username}' (ID: ${user.id}) Roles:`, user.userRoles.map(ur => ur.role.name).join(', '));
      
      // Simulate Logic from AuthService.validateUser
      const permissions = Array.from(
        new Set(
          user.userRoles.flatMap((ur) =>
            ur.role.rolePermissions.map((rp) => rp.permission.code),
          ),
        ),
      );
      
      console.log('------------------------------------------------');
      console.log('FULL Computed Permissions in DB:');
      console.log(JSON.stringify(permissions, null, 2));
      console.log('------------------------------------------------');
      
      const missingInLive = ['INPATIENT_VIEW_MY_PATIENTS'].filter(x => !permissions.includes(x));
      const presentInLiveOnly = ['emr:patient:view'].filter(x => !permissions.includes(x));

      if (presentInLiveOnly.length > 0) {
          console.warn('⚠️ WARNING: The LIVE app sees permissions that this script DOES NOT see.');
          console.warn('This strongly suggests we are connected to DIFFERENT DATABASES.');
          console.warn(`Missing from this DB but present in Live: ${presentInLiveOnly.join(', ')}`);
      } else {
          console.log('This DB contains the permissions seen in Live logs (good match so far).');
      }

      if (permissions.includes('INPATIENT_VIEW_MY_PATIENTS')) {
          console.log('✅ PASS: Permission is present in THIS DB.');
      } else {
          console.log('❌ FAIL: Permission is MISSING from THIS DB.');
      }

  } else {
      console.log(`User '${username}' not found.`);
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
