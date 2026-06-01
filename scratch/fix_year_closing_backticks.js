const fs = require('fs');
const path = require('path');
const { addTranslations } = require('./add_keys_to_json');

const pagePath = path.resolve(__dirname, '../client/src/pages/YearClosingPage.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// Normalize line endings to LF
content = content.replace(/\r\n/g, '\n');

const keyUpdates = [
  {
    key: 'accounting.yearClosing.confirmCloseFinancialYear',
    ar: 'هل أنت متأكد من إقفال السنة المالية {{name}}؟\nلن يُسمح بتسجيل قيود جديدة في هذه السنة بعد الإقفال.',
    en: 'Are you sure you want to close the fiscal year {{name}}?\nNo new entries will be allowed in this year after closing.'
  },
  {
    key: 'accounting.yearClosing.closingEntryDescription',
    ar: 'قيد إقفال السنة المالية {{code}}',
    en: 'Closing entry of fiscal year {{code}}'
  },
  {
    key: 'accounting.yearClosing.closeYearSuccessDetail',
    ar: 'تم إقفال السنة المالية بنجاح.\nإجمالي الإيرادات: {{totalRevenue}} LYD\nإجمالي المصروفات: {{totalExpense}} LYD\nصافي الربح/الخسارة: {{netProfit}} LYD',
    en: 'Fiscal year closed successfully.\nTotal Revenue: {{totalRevenue}} LYD\nTotal Expenses: {{totalExpense}} LYD\nNet Profit/Loss: {{netProfit}} LYD'
  },
  {
    key: 'accounting.yearClosing.yearPeriodDetail',
    ar: 'الكود: {{code}} • من {{start}} إلى ',
    en: 'Code: {{code}} • From {{start}} To '
  },
  {
    key: 'accounting.yearClosing.pendingDocumentsAlert',
    ar: 'تنبيه: يوجد {{count}} مستند معلق',
    en: 'Warning: There are {{count}} pending documents'
  }
];

// Perform replacements
// Replace window.confirm block
const targetConfirm = `      const ok = window.confirm(
        t("accounting.yearClosing.areYouSureYouHaveClosedTheFinancialyearY", "هل أنت متأكد من إقفال السنة المالية \${year.name}؟\\n") +
          t("accounting.yearClosing.noNewRegistrationsWillBeAllowedThisYearA", "لن يُسمح بتسجيل قيود جديدة في هذه السنة بعد الإقفال."),
      );`;

const replaceConfirm = `      const ok = window.confirm(
        t("accounting.yearClosing.confirmCloseFinancialYear", "هل أنت متأكد من إقفال السنة المالية {{name}}؟\\nلن يُسمح بتسجيل قيود جديدة في هذه السنة بعد الإقفال.", { name: year.name }),
      );`;

if (content.includes(targetConfirm)) {
  content = content.replace(targetConfirm, replaceConfirm);
  console.log('Replaced confirm close dialog.');
} else {
  // Let's do a more robust find
  const confirmMatch = content.match(/const ok = window\.confirm\([\s\S]*?\);/);
  if (confirmMatch && confirmMatch[0].includes('areYouSureYouHaveClosedTheFinancialyearY')) {
    content = content.replace(confirmMatch[0], replaceConfirm);
    console.log('Replaced confirm close dialog via regex.');
  }
}

// Replace toast.success block
const targetToast = `      toast.success(
        t("accounting.yearClosing.theFinancialyearWasSuccessfullyClosedn", "تم إقفال السنة المالية بنجاح.\\n") +
          t("accounting.yearClosing.totalRevenueDatatotalrevenuetofixed3Lydn", "إجمالي الإيرادات: \${data.totalRevenue.toFixed(3)} LYD\\n") +
          t("accounting.yearClosing.totalExpensesDatatotalexpensetofixed3Lyd", "إجمالي المصروفات: \${data.totalExpense.toFixed(3)} LYD\\n") +
          t("accounting.yearClosing.netProfitlossDatanetprofittofixed3Lyd", "صافي الربح/الخسارة: \${data.netProfit.toFixed(3)} LYD"),
      );`;

const replaceToast = `      toast.success(
        t("accounting.yearClosing.closeYearSuccessDetail", "تم إقفال السنة المالية بنجاح.\\nإجمالي الإيرادات: {{totalRevenue}} LYD\\nإجمالي المصروفات: {{totalExpense}} LYD\\nصافي الربح/الخسارة: {{netProfit}} LYD", {
          totalRevenue: data.totalRevenue.toFixed(3),
          totalExpense: data.totalExpense.toFixed(3),
          netProfit: data.netProfit.toFixed(3)
        })
      );`;

if (content.includes(targetToast)) {
  content = content.replace(targetToast, replaceToast);
  console.log('Replaced success toast.');
} else {
  const toastMatch = content.match(/toast\.success\([\s\S]*?\);/);
  if (toastMatch && toastMatch[0].includes('theFinancialyearWasSuccessfullyClosedn')) {
    content = content.replace(toastMatch[0], replaceToast);
    console.log('Replaced success toast via regex.');
  }
}

// Replace description placeholder and code closing entry
content = content.split('description || `قيد إقفال السنة المالية ${year.code ?? ""}`.trim(),').join('description || t("accounting.yearClosing.closingEntryDescription", "قيد إقفال السنة المالية {{code}}", { code: year.code ?? "" }).trim(),');

content = content.split('placeholder={`قيد إقفال السنة المالية ${year.code ?? ""}`}').join('placeholder={t("accounting.yearClosing.closingEntryDescription", "قيد إقفال السنة المالية {{code}}", { code: year.code ?? "" })}');

// Replace Year period detail inside JSX
content = content.split('الكود: {year.code} • من {formatDate(year.startDate)} إلى{" "}').join('{t("accounting.yearClosing.yearPeriodDetail", "الكود: {{code}} • من {{start}} إلى ", { code: year.code, start: formatDate(year.startDate) })}');

// Replace alert text inside JSX
content = content.split('تنبيه: يوجد {documents.length} مستند معلق').join('{t("accounting.yearClosing.pendingDocumentsAlert", "تنبيه: يوجد {{count}} مستند معلق", { count: documents.length })}');

content = content.replace(/\n/g, '\r\n'); // Convert to CRLF
fs.writeFileSync(pagePath, content, 'utf8');
console.log('Saved changes to YearClosingPage.tsx');

addTranslations(keyUpdates);
