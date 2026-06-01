const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../client/src/pages/IntegrationPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
  {
    target: 't("integration.saveFailed", "فشل ال{t(\"save\", \"حفظ\")}")',
    replace: 't("integration.saveFailed", "فشل الحفظ")'
  },
  {
    target: 't("integration.confirmDeleteDevice", "هل أنت متأكد من {t(\"integration.delete\", \"حذف\")} هذا الجهاز؟ سيتم {t(\"integration.delete\", \"حذف\")} جميع الإعدادات المرتبطة.")',
    replace: 't("integration.confirmDeleteDevice", "هل أنت متأكد من حذف هذا الجهاز؟ سيتم حذف جميع الإعدادات المرتبطة.")'
  },
  {
    target: 't("integration.theDeviceHasBeenDeleted", "تم {t(\"integration.delete\", \"حذف\")} الجهاز")',
    replace: 't("integration.theDeviceHasBeenDeleted", "تم حذف الجهاز")'
  },
  {
    target: 't("integration.deletionFailed", "فشل ال{t(\"integration.delete\", \"حذف\")}")',
    replace: 't("integration.deletionFailed", "فشل الحذف")'
  },
  {
    target: 't("integration.linked", "تم ال{t(\"integration.linkButton\", \"ربط\")}")',
    replace: 't("integration.linked", "تم الربط")'
  },
  {
    target: 't("integration.bindingFailurePossiblyAlreadyExists", "فشل ال{t(\"integration.linkButton\", \"ربط\")} (ربما موجود مسبقاً)")',
    replace: 't("integration.bindingFailurePossiblyAlreadyExists", "فشل الربط (ربما موجود مسبقاً)")'
  },
  {
    target: 't("integration.areYouSureYouCanCancelThisLink", "هل أنت متأكد من {t(\"cancel\", \"إلغاء\")} هذا ال{t(\"integration.linkButton\", \"ربط\")}؟")',
    replace: 't("integration.areYouSureYouCanCancelThisLink", "هل أنت متأكد من إلغاء هذا الربط؟")'
  },
  {
    target: 't("integration.deletedSuccessfully", "تم ال{t(\"integration.delete\", \"حذف\")} بنجاح")',
    replace: 't("integration.deletedSuccessfully", "تم الحذف بنجاح")'
  },
  {
    target: 't("integration.deletionOperationFailed", "فشل عملية ال{t(\"integration.delete\", \"حذف\")}")',
    replace: 't("integration.deletionOperationFailed", "فشل عملية الحذف")'
  },
  {
    target: 't("integration.title", "ال{t(\"integration.linkButton\", \"ربط\")} والتكامل (LIS/PACS Integration)")',
    replace: 't("integration.title", "الربط والتكامل (LIS/PACS Integration)")'
  },
  {
    target: 't("integration.desc", "إدارة أجهزة المختبر والأشعة و{t(\"integration.linkButton\", \"ربط\")} الأكواد ومراقبة الرسائل (HL7).")',
    replace: 't("integration.desc", "إدارة أجهزة المختبر والأشعة وربط الأكواد ومراقبة الرسائل (HL7).")'
  },
  {
    target: 't("integration.codeMapping", "{t(\"integration.linkButton\", \"ربط\")} الأكواد (Code Mapping)")',
    replace: 't("integration.codeMapping", "ربط الأكواد (Code Mapping)")'
  },
  {
    target: 't("integration.modifyDeviceData", "{t(\"integration.edit\", \"تعديل\")} بيانات الجهاز")',
    replace: 't("integration.modifyDeviceData", "تعديل بيانات الجهاز")'
  },
  {
    target: '/* Modal إضافة/{t("integration.edit", "تعديل")} جهاز */',
    replace: '/* Modal إضافة/تعديل جهاز */'
  }
];

let modified = false;
replacements.forEach(({ target, replace }) => {
  if (content.includes(target)) {
    content = content.split(target).join(replace);
    console.log(`Successfully replaced: ${target} -> ${replace}`);
    modified = true;
  } else {
    console.log(`Target NOT found: ${target}`);
  }
});

if (modified) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Saved changes to IntegrationPage.tsx');
} else {
  console.log('No changes made to IntegrationPage.tsx');
}
