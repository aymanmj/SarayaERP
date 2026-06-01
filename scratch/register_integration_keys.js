const { addTranslations } = require('./add_keys_to_json');

const updates = [
  {
    key: 'integration.confirmDeleteDevice',
    ar: 'هل أنت متأكد من حذف هذا الجهاز؟ سيتم حذف جميع الإعدادات المرتبطة.',
    en: 'Are you sure you want to delete this device? All associated settings will be deleted.'
  },
  {
    key: 'integration.title',
    ar: 'الربط والتكامل (LIS/PACS Integration)',
    en: 'LIS/PACS Integration'
  },
  {
    key: 'integration.desc',
    ar: 'إدارة أجهزة المختبر والأشعة وربط الأكواد ومراقبة الرسائل (HL7).',
    en: 'Manage lab and radiology devices, map codes, and monitor messages (HL7).'
  },
  {
    key: 'integration.devicesAndSettings',
    ar: 'الأجهزة والإعدادات',
    en: 'Devices & Settings'
  },
  {
    key: 'integration.messageLogs',
    ar: 'سجل الرسائل (Logs)',
    en: 'Message Logs'
  },
  {
    key: 'integration.newDeviceButton',
    ar: '+ جديد',
    en: '+ New'
  },
  {
    key: 'integration.noDevicesAdded',
    ar: 'لا توجد أجهزة مضافة.',
    en: 'No devices added yet.'
  },
  {
    key: 'integration.mappingsCount',
    ar: 'عدد التحاليل المربوطة:',
    en: 'Mapped tests count:'
  },
  {
    key: 'integration.edit',
    ar: 'تعديل',
    en: 'Edit'
  },
  {
    key: 'integration.delete',
    ar: 'حذف',
    en: 'Delete'
  },
  {
    key: 'integration.systemAnalysis',
    ar: 'التحليل في النظام',
    en: 'System Analysis'
  },
  {
    key: 'integration.deviceTestCodeLabel',
    ar: 'كود الجهاز (Device Code)',
    en: 'Device Code'
  },
  {
    key: 'integration.linkButton',
    ar: 'ربط',
    en: 'Link'
  },
  {
    key: 'integration.noMappingsForDevice',
    ar: 'لا توجد أكواد مربوطة لهذا الجهاز.',
    en: 'No mapped codes for this device.'
  },
  {
    key: 'integration.deviceName',
    ar: 'اسم الجهاز',
    en: 'Device Name'
  },
  {
    key: 'integration.deviceType',
    ar: 'النوع',
    en: 'Device Type'
  },
  {
    key: 'integration.deviceIsActive',
    ar: 'الجهاز نشط (Active)',
    en: 'Device is Active'
  }
];

addTranslations(updates);
