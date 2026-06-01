const fs = require('fs');

const file = 'E:/SarayaERP/client/src/pages/BalanceSheetPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    ': "حدث خطأ أثناء جلب بيانات الميزانية العمومية."',
    ': t("accounting.balanceSheet.errorLoadingBalanceSheet", "حدث خطأ أثناء جلب بيانات الميزانية العمومية.")'
  ],
  [
    'استعراض المركز المالي للمنشأة حتى تاريخ معيّن.',
    '{t("accounting.balanceSheet.desc", "استعراض المركز المالي للمنشأة حتى تاريخ معيّن.")}'
  ],
  [
    'حتى تاريخ:{" "}',
    '{t("accounting.balanceSheet.asOfDateLabel", "حتى تاريخ:")}{" "}'
  ],
  [
    '{loading ? "جارِ التحديث..." : t("accounting.balanceSheet.toUpdate", "تحديث")}',
    '{loading ? t("accounting.balanceSheet.updating", "جارِ التحديث...") : t("accounting.balanceSheet.toUpdate", "تحديث")}'
  ],
  [
    'إجمالي الالتزامات + حقوق الملكية',
    't("accounting.balanceSheet.totalLiabilitiesAndEquity", "إجمالي الالتزامات + حقوق الملكية")'
  ],
  [
    'رقم الحساب',
    't("accounting.balanceSheet.accountNumber", "رقم الحساب")'
  ],
  [
    'اسم الحساب',
    't("accounting.balanceSheet.accountName", "اسم الحساب")'
  ],
  [
    'لا توجد أرصدة أصول مسجلة حتى هذا التاريخ.',
    't("accounting.balanceSheet.noAssets", "لا توجد أرصدة أصول مسجلة حتى هذا التاريخ.")'
  ],
  [
    'لا توجد التزامات مسجلة حتى هذا التاريخ.',
    't("accounting.balanceSheet.noLiabilities", "لا توجد التزامات مسجلة حتى هذا التاريخ.")'
  ],
  [
    'لا توجد أرصدة لحقوق الملكية حتى هذا التاريخ.',
    't("accounting.balanceSheet.noEquity", "لا توجد أرصدة لحقوق الملكية حتى هذا التاريخ.")'
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
console.log('BalanceSheetPage translation applied!');
