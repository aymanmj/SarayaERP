// prisma/seed-permissions.ts
// Run with: npx ts-node prisma/seed-permissions.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultPermissions = [
  // ============ CLINICAL ============
  { code: 'PATIENT_VIEW', description: 'عرض بيانات المرضى' },
  { code: 'PATIENT_CREATE', description: 'إضافة مريض جديد' },
  { code: 'PATIENT_EDIT', description: 'تعديل بيانات المريض' },

  { code: 'ENCOUNTER_VIEW', description: 'عرض الزيارات' },
  { code: 'ENCOUNTER_CREATE', description: 'إنشاء زيارة جديدة' },
  { code: 'ENCOUNTER_CLOSE', description: 'إغلاق الزيارة' },

  // ============ INPATIENT / ROUNDS ============
  { code: 'INPATIENT_VIEW_MY_PATIENTS', description: 'عرض مرضاي المنومين' },
  { code: 'INPATIENT_VIEW_ALL_PATIENTS', description: 'عرض جميع المنومين' },
  { code: 'INPATIENT_VIEW_NOTES', description: 'عرض ملاحظات التنويم' },
  { code: 'INPATIENT_ADD_NOTE', description: 'إضافة ملاحظة مرور' },
  { code: 'INPATIENT_VIEW_CARE_PLAN', description: 'عرض الخطة العلاجية' },
  { code: 'INPATIENT_ADD_ORDER', description: 'إضافة أمر طبي' },
  { code: 'INPATIENT_COMPLETE_ORDER', description: 'إكمال أمر طبي' },
  { code: 'INPATIENT_EXECUTE_ORDER', description: 'تنفيذ أمر طبي (تمريض)' },
  { code: 'INPATIENT_VIEW_EXECUTIONS', description: 'عرض سجل التنفيذ' },
  { code: 'INPATIENT_ADMIT', description: 'تنويم مريض' },
  { code: 'INPATIENT_DISCHARGE', description: 'تخريج مريض' },

  // ============ NURSING ============
  { code: 'NURSING_VIEW_STATION', description: 'عرض محطة التمريض' },
  { code: 'NURSING_ADD_VITALS', description: 'إضافة علامات حيوية' },
  { code: 'NURSING_ADD_NOTE', description: 'إضافة ملاحظة تمريض' },
  { code: 'NURSING_ADMINISTER_MED', description: 'إعطاء دواء' },

  // ============ APPOINTMENTS ============
  { code: 'APPOINTMENT_VIEW', description: 'عرض المواعيد' },
  { code: 'APPOINTMENT_CREATE', description: 'حجز موعد' },
  { code: 'APPOINTMENT_CANCEL', description: 'إلغاء موعد' },
  { code: 'APPOINTMENT_CHECKIN', description: 'تسجيل حضور' },

  // ============ USERS ============
  { code: 'USER_VIEW', description: 'عرض المستخدمين' },
  { code: 'USER_CREATE', description: 'إضافة مستخدم' },
  { code: 'USER_EDIT', description: 'تعديل مستخدم' },
  { code: 'USER_DELETE', description: 'حذف مستخدم' },
  { code: 'ROLE_VIEW', description: 'عرض الأدوار' },
  { code: 'ROLE_MANAGE', description: 'إدارة أدوار وصلاحيات' },
  { code: 'VIEW_DOCTORS_LIST', description: 'عرض قائمة الأطباء' },

  // ============ BILLING ============
  { code: 'BILLING_VIEW', description: 'عرض الفواتير' },
  { code: 'BILLING_CREATE', description: 'إنشاء فاتورة' },
  { code: 'BILLING_DISCOUNT', description: 'منح خصم' },
  { code: 'PAYMENT_RECEIVE', description: 'استلام دفعة' },

  // ============ PHARMACY ============
  { code: 'PHARMACY_VIEW', description: 'عرض الصيدلية' },
  { code: 'PHARMACY_DISPENSE', description: 'صرف وصفة' },
  { code: 'PHARMACY_STOCK', description: 'إدارة المخزون' },

  // ============ LAB ============
  { code: 'LAB_VIEW', description: 'عرض التحاليل' },
  { code: 'LAB_RESULT_ENTRY', description: 'إدخال نتائج' },

  // ============ RADIOLOGY ============
  { code: 'RADIOLOGY_VIEW', description: 'عرض الأشعة' },
  { code: 'RADIOLOGY_REPORT', description: 'كتابة تقرير' },

  // ============ ADMIN ============
  { code: 'ADMIN_FULL_ACCESS', description: 'صلاحيات كاملة' },
  { code: 'ADMIN_VIEW_AUDIT', description: 'عرض سجل المراجعة' },
  { code: 'ADMIN_SETTINGS', description: 'إعدادات النظام' },

  // ============ NEW ABAC MODULES ============
  { code: 'quality:view', description: 'عرض بيانات الجودة والسلامة' },
  { code: 'quality:manage', description: 'إدارة الجودة والسلامة' },
  { code: 'cdss:view', description: 'استعراض التنبيهات السريرية (CDSS)' },
  { code: 'cdss:manage', description: 'إدارة وتجاوز التنبيهات السريرية' },
  { code: 'icu:view', description: 'عرض العناية المركزة' },
  { code: 'icu:manage', description: 'إدارة العناية المركزة' },
  { code: 'transfers:view', description: 'عرض التحويلات الطبية' },
  { code: 'transfers:manage', description: 'إدارة التحويلات الطبية' },
  { code: 'clinical-profile:view', description: 'عرض السجل السريري' },
  { code: 'clinical-profile:manage', description: 'إدارة السجل السريري' },
  { code: 'discharge:view', description: 'عرض ملخص الخروج' },
  { code: 'discharge:manage', description: 'إدارة ملخص الخروج' },
  { code: 'patients:manage', description: 'إدارة المرضى والسجل الوطني (MPI)' },
  { code: 'note-templates:view', description: 'عرض قوالب الملاحظات' },
  { code: 'note-templates:manage', description: 'إدارة قوالب الملاحظات' },
  { code: 'order-sets:view', description: 'عرض مجموعات الأوامر الطبية' },
  { code: 'order-sets:manage', description: 'إدارة مجموعات الأوامر الطبية' },
  { code: 'clinical-pathways:view', description: 'عرض المسارات السريرية' },
  { code: 'clinical-pathways:manage', description: 'إدارة المسارات السريرية' },
  { code: 'terminology:view', description: 'عرض التصنيفات الطبية' },
  { code: 'claims:read', description: 'عرض المطالبات المالية (RCM)' },
  { code: 'claims:create', description: 'إنشاء المطالبات المالية' },
  { code: 'claims:update', description: 'تعديل المطالبات المالية' },
];

const defaultRoles = [
  { name: 'ADMIN', description: 'مدير النظام', isSystem: true },
  { name: 'DOCTOR', description: 'طبيب', isSystem: true },
  { name: 'NURSE', description: 'ممرض/ة', isSystem: true },
  { name: 'RECEPTION', description: 'موظف استقبال', isSystem: true },
  { name: 'CASHIER', description: 'أمين صندوق', isSystem: true },
  { name: 'PHARMACIST', description: 'صيدلي', isSystem: true },
  { name: 'LAB_TECH', description: 'فني مختبر', isSystem: true },
  { name: 'RADIOLOGY_TECH', description: 'فني أشعة', isSystem: true },
  { name: 'QUALITY_OFFICER', description: 'مسؤول الجودة والسلامة', isSystem: true },
  { name: 'RCM_MANAGER', description: 'مدير دورة الإيرادات والمطالبات', isSystem: true },
];

// Role -> Permissions mapping
const rolePermissionsMap: Record<string, string[]> = {
  ADMIN: [
    'ADMIN_FULL_ACCESS', 'ADMIN_VIEW_AUDIT', 'ADMIN_SETTINGS', 'USER_VIEW', 'USER_CREATE', 'USER_EDIT', 'USER_DELETE', 'ROLE_VIEW', 'ROLE_MANAGE', 'VIEW_DOCTORS_LIST',
    'quality:manage', 'cdss:manage', 'icu:manage', 'transfers:manage', 'clinical-profile:manage', 'discharge:manage', 'patients:manage', 'note-templates:manage', 'order-sets:manage', 'clinical-pathways:manage', 'claims:update'
  ],
  DOCTOR: [
    'PATIENT_VIEW', 'PATIENT_EDIT', 'ENCOUNTER_VIEW', 'ENCOUNTER_CREATE', 'ENCOUNTER_CLOSE',
    'INPATIENT_VIEW_MY_PATIENTS', 'INPATIENT_VIEW_NOTES', 'INPATIENT_ADD_NOTE', 'INPATIENT_VIEW_CARE_PLAN',
    'INPATIENT_ADD_ORDER', 'INPATIENT_COMPLETE_ORDER', 'INPATIENT_VIEW_EXECUTIONS', 'INPATIENT_ADMIT', 'INPATIENT_DISCHARGE',
    'APPOINTMENT_VIEW', 'VIEW_DOCTORS_LIST', 'cdss:view', 'cdss:manage', 'icu:view', 'icu:manage', 'transfers:view', 'transfers:manage', 'clinical-profile:view', 'clinical-profile:manage', 'discharge:view', 'discharge:manage', 'order-sets:view', 'clinical-pathways:view', 'terminology:view'
  ],
  NURSE: [
    'PATIENT_VIEW', 'INPATIENT_VIEW_ALL_PATIENTS', 'INPATIENT_VIEW_NOTES', 'INPATIENT_VIEW_CARE_PLAN',
    'INPATIENT_EXECUTE_ORDER', 'INPATIENT_VIEW_EXECUTIONS',
    'NURSING_VIEW_STATION', 'NURSING_ADD_VITALS', 'NURSING_ADD_NOTE', 'NURSING_ADMINISTER_MED', 'icu:view', 'icu:manage', 'clinical-profile:view', 'transfers:view'
  ],
  RECEPTION: ['PATIENT_VIEW', 'PATIENT_CREATE', 'PATIENT_EDIT', 'ENCOUNTER_CREATE', 'APPOINTMENT_VIEW', 'APPOINTMENT_CREATE', 'APPOINTMENT_CANCEL', 'APPOINTMENT_CHECKIN', 'VIEW_DOCTORS_LIST', 'patients:manage'],
  CASHIER: ['PATIENT_VIEW', 'BILLING_VIEW', 'BILLING_CREATE', 'BILLING_DISCOUNT', 'PAYMENT_RECEIVE', 'VIEW_DOCTORS_LIST', 'claims:read', 'claims:create', 'claims:update'],
  PHARMACIST: ['PATIENT_VIEW', 'PHARMACY_VIEW', 'PHARMACY_DISPENSE', 'PHARMACY_STOCK', 'cdss:view'],
  LAB_TECH: ['PATIENT_VIEW', 'LAB_VIEW', 'LAB_RESULT_ENTRY'],
  RADIOLOGY_TECH: ['PATIENT_VIEW', 'RADIOLOGY_VIEW', 'RADIOLOGY_REPORT'],
  QUALITY_OFFICER: ['quality:view', 'quality:manage', 'cdss:view', 'clinical-pathways:view', 'order-sets:view', 'terminology:view'],
  RCM_MANAGER: ['claims:read', 'claims:create', 'claims:update', 'BILLING_VIEW', 'PATIENT_VIEW'],
};

async function main() {
  console.log('🔐 Seeding Permissions...');

  // Upsert Permissions
  for (const perm of defaultPermissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log(`✅ ${defaultPermissions.length} permissions seeded.`);

  // Upsert Roles
  for (const role of defaultRoles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
  console.log(`✅ ${defaultRoles.length} roles seeded.`);

  // Link Permissions to Roles
  for (const [roleName, permCodes] of Object.entries(rolePermissionsMap)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) continue;

    for (const code of permCodes) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
  console.log('✅ Role-Permission mappings created.');

  console.log('🎉 Permissions seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
