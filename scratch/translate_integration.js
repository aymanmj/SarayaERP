const fs = require('fs');

const file = 'E:/SarayaERP/client/src/pages/IntegrationPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    `"هل أنت متأكد من حذف هذا الجهاز؟ سيتم حذف جميع الإعدادات المرتبطة.",`,
    `t("integration.confirmDeleteDevice", "هل أنت متأكد من حذف هذا الجهاز؟ سيتم حذف جميع الإعدادات المرتبطة."),`
  ],
  [
    'الربط والتكامل (LIS/PACS Integration)',
    '{t("integration.title", "الربط والتكامل (LIS/PACS Integration)")}'
  ],
  [
    'إدارة أجهزة المختبر والأشعة وربط الأكواد ومراقبة الرسائل (HL7).',
    '{t("integration.desc", "إدارة أجهزة المختبر والأشعة وربط الأكواد ومراقبة الرسائل (HL7).")}'
  ],
  [
    'الأجهزة والإعدادات',
    '{t("integration.devicesAndSettings", "الأجهزة والإعدادات")}'
  ],
  [
    'سجل الرسائل (Logs)',
    '{t("integration.messageLogs", "سجل الرسائل (Logs)")}'
  ],
  [
    '+ جديد',
    '{t("integration.newDeviceButton", "+ جديد")}'
  ],
  [
    'لا توجد أجهزة مضافة.',
    '{t("integration.noDevicesAdded", "لا توجد أجهزة مضافة.")}'
  ],
  [
    'عدد التحاليل المربوطة: {dev._count?.mappings ?? 0}',
    '{t("integration.mappingsCount", "عدد التحاليل المربوطة:")} {dev._count?.mappings ?? 0}'
  ],
  [
    'تعديل',
    '{t("integration.edit", "تعديل")}'
  ],
  [
    'حذف',
    '{t("integration.delete", "حذف")}'
  ],
  [
    'التحليل في النظام',
    '{t("integration.systemAnalysis", "التحليل في النظام")}'
  ],
  [
    'كود الجهاز (Device Code)',
    '{t("integration.deviceTestCodeLabel", "كود الجهاز (Device Code)")}'
  ],
  [
    'ربط',
    '{t("integration.linkButton", "ربط")}'
  ],
  [
    'لا توجد أكواد مربوطة لهذا الجهاز.',
    '{t("integration.noMappingsForDevice", "لا توجد أكواد مربوطة لهذا الجهاز.")}'
  ],
  [
    'اسم الجهاز',
    '{t("integration.deviceName", "اسم الجهاز")}'
  ],
  [
    'النوع',
    '{t("integration.deviceType", "النوع")}'
  ],
  [
    'الجهاز نشط (Active)',
    '{t("integration.deviceIsActive", "الجهاز نشط (Active)")}'
  ],
  [
    'إلغاء',
    '{t("cancel", "إلغاء")}'
  ],
  [
    'حفظ',
    '{t("save", "حفظ")}'
  ]
];

replacements.forEach(([target, replacement]) => {
  if (content.includes(target)) {
    content = content.split(target).join(replacement);
    console.log(`Replaced: ${target} -> ${replacement}`);
  } else {
    console.warn(`Warning: Target not found: ${target}`);
  }
});

fs.writeFileSync(file, content, 'utf8');
console.log('IntegrationPage translation applied!');
