const { addTranslations } = require('./add_keys_to_json');

const updates = [
  {
    key: 'accounting.manualEntry.errorLoadingData',
    ar: 'حدث خطأ أثناء تحميل البيانات.',
    en: 'An error occurred while loading resource data.'
  },
  {
    key: 'accounting.manualEntry.errorSelectDate',
    ar: 'يرجى اختيار تاريخ القيد.',
    en: 'Please select the entry date.'
  },
  {
    key: 'accounting.manualEntry.errorSelectAccount',
    ar: 'يرجى اختيار الحساب لكل سطر.',
    en: 'Please select an account for each line.'
  },
  {
    key: 'accounting.manualEntry.errorNegativeAmount',
    ar: 'لا يمكن إدخال مبالغ سالبة.',
    en: 'Negative amounts are not allowed.'
  },
  {
    key: 'accounting.manualEntry.errorEmptyLines',
    ar: 'يجب إدخال سطر واحد على الأقل بمبلغ مدين أو دائن.',
    en: 'Please enter at least one line with a debit or credit amount.'
  },
  {
    key: 'accounting.manualEntry.errorUnbalanced',
    ar: 'إجمالي المدين يجب أن يساوي إجمالي الدائن قبل الحفظ.',
    en: 'Total debit must equal total credit before saving.'
  },
  {
    key: 'accounting.manualEntry.entrySavedSuccess',
    ar: 'تم حفظ القيد اليدوي بنجاح (رقم القيد {{id}}).',
    en: 'Manual entry saved successfully (Entry ID: {{id}}).'
  },
  {
    key: 'accounting.manualEntry.errorSavingEntry',
    ar: 'حدث خطأ أثناء حفظ القيد.',
    en: 'An error occurred while saving the entry.'
  },
  {
    key: 'accounting.manualEntry.desc',
    ar: 'تسجيل العمليات المحاسبية (تسويات، مصاريف، عهد) مع توجيه مراكز التكلفة.',
    en: 'Record manual accounting transactions (adjustments, expenses, custodies) with cost center allocation.'
  },
  {
    key: 'accounting.manualEntry.descriptionLabel',
    ar: 'وصف القيد (شرح عام)',
    en: 'Entry Description (General Notes)'
  },
  {
    key: 'accounting.manualEntry.descriptionPlaceholder',
    ar: 'مثال: تسوية عهدة نقدية للموظف...',
    en: 'e.g., Settlement of employee cash custody...'
  },
  {
    key: 'accounting.manualEntry.posting',
    ar: 'جارِ الترحيل...',
    en: 'Posting...'
  },
  {
    key: 'accounting.manualEntry.lineDescriptionPlaceholder',
    ar: 'شرح البند...',
    en: 'Line explanation...'
  },
  {
    key: 'accounting.manualEntry.addLine',
    ar: '+ إضافة سطر جديد',
    en: '+ Add New Line'
  }
];

addTranslations(updates);
