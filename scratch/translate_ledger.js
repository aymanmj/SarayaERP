const fs = require('fs');
const path = require('path');

const file = 'E:/SarayaERP/client/src/pages/AccountLedgerPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    'setError("لم يتم تحديد حساب بشكل صحيح.");',
    'setError(t("accounting.accountLedger.invalidAccountSelected", "لم يتم تحديد حساب بشكل صحيح."));'
  ],
  [
    '"حدث خطأ أثناء تحميل دفتر الأستاذ.";',
    't("accounting.accountLedger.errorLoadingLedger", "حدث خطأ أثناء تحميل دفتر الأستاذ.");'
  ],
  [
    '← رجوع',
    '{t("back", "← رجوع")}'
  ],
  [
    'استعراض الحركات المحاسبية على حساب محدد مع الرصيد التراكمي.',
    '{t("accounting.accountLedger.viewTransactionsDesc", "استعراض الحركات المحاسبية على حساب محدد مع الرصيد التراكمي.")}'
  ],
  [
    'الكود: {account.code} — النوع: {account.type}',
    '{t("accounting.accountLedger.codeLabel", "الكود")}: {account.code} — {t("accounting.accountLedger.typeLabel", "النوع")}: {account.type}'
  ],
  [
    'تطبيق الفلتر',
    '{t("accounting.accountLedger.applyFilter", "تطبيق الفلتر")}'
  ],
  [
    'مسح الفلاتر',
    '{t("accounting.accountLedger.clearFilters", "مسح الفلاتر")}'
  ],
  [
    'جارِ تحميل البيانات...',
    '{t("accounting.accountLedger.loadingData", "جارِ تحميل البيانات...")}'
  ],
  [
    'لا توجد بيانات متاحة.',
    '{t("accounting.accountLedger.noDataAvailable", "لا توجد بيانات متاحة.")}'
  ],
  [
    'ملخص الحساب',
    '{t("accounting.accountLedger.accountSummary", "ملخص الحساب")}'
  ],
  [
    'حركات الحساب (دفتر الأستاذ)',
    '{t("accounting.accountLedger.accountTransactionsLedger", "حركات الحساب (دفتر الأستاذ)")}'
  ],
  [
    'لا توجد حركات في هذه الفترة لهذا الحساب.',
    '{t("accounting.accountLedger.noTransactionsInPeriod", "لا توجد حركات في هذه الفترة لهذا الحساب.")}'
  ],
  [
    'قيد #{line.entryId}',
    '{t("accounting.accountLedger.entryHash", "قيد #")}{line.entryId}'
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
console.log('AccountLedgerPage translation applied!');
