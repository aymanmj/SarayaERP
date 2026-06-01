const fs = require('fs');

const file = 'E:/SarayaERP/client/src/pages/ManualEntryPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    'err?.response?.data?.message || "حدث خطأ أثناء تحميل البيانات.";',
    'err?.response?.data?.message || t("accounting.manualEntry.errorLoadingData", "حدث خطأ أثناء تحميل البيانات.");'
  ],
  [
    'setError("يرجى اختيار تاريخ القيد.");',
    'setError(t("accounting.manualEntry.errorSelectDate", "يرجى اختيار تاريخ القيد."));'
  ],
  [
    'setError("يرجى اختيار الحساب لكل سطر.");',
    'setError(t("accounting.manualEntry.errorSelectAccount", "يرجى اختيار الحساب لكل سطر."));'
  ],
  [
    'setError("لا يمكن إدخال مبالغ سالبة.");',
    'setError(t("accounting.manualEntry.errorNegativeAmount", "لا يمكن إدخال مبالغ سالبة."));'
  ],
  [
    'setError("يجب إدخال سطر واحد على الأقل بمبلغ مدين أو دائن.");',
    'setError(t("accounting.manualEntry.errorEmptyLines", "يجب إدخال سطر واحد على الأقل بمبلغ مدين أو دائن."));'
  ],
  [
    'setError("إجمالي المدين يجب أن يساوي إجمالي الدائن قبل الحفظ.");',
    'setError(t("accounting.manualEntry.errorUnbalanced", "إجمالي المدين يجب أن يساوي إجمالي الدائن قبل الحفظ."));'
  ],
  [
    '`تم حفظ القيد اليدوي بنجاح (رقم القيد ${res.data.entryId}).`',
    't("accounting.manualEntry.entrySavedSuccess", "تم حفظ القيد اليدوي بنجاح (رقم القيد {{id}}).", { id: res.data.entryId })'
  ],
  [
    'err?.response?.data?.message || "حدث خطأ أثناء حفظ القيد.";',
    'err?.response?.data?.message || t("accounting.manualEntry.errorSavingEntry", "حدث خطأ أثناء حفظ القيد.");'
  ],
  [
    '← رجوع',
    '{t("back", "← رجوع")}'
  ],
  [
    'تسجيل العمليات المحاسبية (تسويات، مصاريف، عهد) مع توجيه مراكز\n              التكلفة.',
    '{t("accounting.manualEntry.desc", "تسجيل العمليات المحاسبية (تسويات، مصاريف، عهد) مع توجيه مراكز التكلفة.")}'
  ],
  [
    'وصف القيد (شرح عام)',
    '{t("accounting.manualEntry.descriptionLabel", "وصف القيد (شرح عام)")}'
  ],
  [
    'placeholder="مثال: تسوية عهدة نقدية للموظف..."',
    'placeholder={t("accounting.manualEntry.descriptionPlaceholder", "مثال: تسوية عهدة نقدية للموظف...")}'
  ],
  [
    '{saving ? "جارِ الترحيل..." : t("accounting.manualEntry.saveAndTransferTheRegistration", "حفظ وترحيل القيد")}',
    '{saving ? t("accounting.manualEntry.posting", "جارِ الترحيل...") : t("accounting.manualEntry.saveAndTransferTheRegistration", "حفظ وترحيل القيد")}'
  ],
  [
    'placeholder="شرح البند..."',
    'placeholder={t("accounting.manualEntry.lineDescriptionPlaceholder", "شرح البند...")}'
  ],
  [
    '+ إضافة سطر جديد',
    '{t("accounting.manualEntry.addLine", "+ إضافة سطر جديد")}'
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
console.log('ManualEntryPage translation applied!');
