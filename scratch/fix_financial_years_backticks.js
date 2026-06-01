const fs = require('fs');
const path = require('path');

const pagePath = path.resolve(__dirname, '../client/src/pages/FinancialYearsPage.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// Normalize line endings to LF
content = content.replace(/\r\n/g, '\n');

// 1. Replace the multiline toast
const targetToast = '`تم توليد الأرصدة الافتتاحية بنجاح من ${fromLabel} إلى ${toLabel}.\nرقم القيد الافتتاحي: ${r.openingEntryId}\nإجمالي مدين: ${r.totalDebit.toFixed(3)}\nإجمالي دائن: ${r.totalCredit.toFixed(3)}`';

const replaceToast = 't("accounting.financialYears.generateOpeningBalancesSuccessDetail", "تم توليد الأرصدة الافتتاحية بنجاح من {{fromLabel}} إلى {{toLabel}}.\\nرقم القيد الافتتاحي: {{openingEntryId}}\\nإجمالي مدين: {{debit}}\\nإجمالي دائن: {{credit}}", { fromLabel, toLabel, openingEntryId: r.openingEntryId, debit: r.totalDebit.toFixed(3), credit: r.totalCredit.toFixed(3) })';

if (content.includes(targetToast)) {
  content = content.split(targetToast).join(replaceToast);
  console.log('Successfully replaced multiline success toast.');
} else {
  // Let's try matching with different indentations
  const matches = content.match(/`تم توليد الأرصدة الافتتاحية بنجاح من \$\{fromLabel\} إلى \$\{toLabel\}\.[\s\S]*?\`/);
  if (matches) {
    content = content.replace(matches[0], replaceToast);
    console.log('Replaced multiline success toast via regex.');
  } else {
    console.log('Could not find multiline success toast.');
  }
}

// 2. Replace the selected year text (with en-dash –)
const targetSelected = '`السنة المختارة: ${selectedYear.name} (${formatDate(\n                    selectedYear.startDate,\n                  )} – ${formatDate(selectedYear.endDate)})`';

const replaceSelected = 't("accounting.financialYears.selectedYearDetail", "السنة المختارة: {{name}} ({{start}} - {{end}})", { name: selectedYear.name, start: formatDate(selectedYear.startDate), end: formatDate(selectedYear.endDate) })';

if (content.includes(targetSelected)) {
  content = content.split(targetSelected).join(replaceSelected);
  console.log('Successfully replaced selected year detail.');
} else {
  // Try regex replacement
  const matches = content.match(/`السنة المختارة: \$\{selectedYear\.name\} \([\s\S]*?\)`/);
  if (matches) {
    content = content.replace(matches[0], replaceSelected);
    console.log('Replaced selected year detail via regex.');
  } else {
    console.log('Could not find selected year detail.');
  }
}

content = content.replace(/\n/g, '\r\n'); // Convert back to CRLF
fs.writeFileSync(pagePath, content, 'utf8');
console.log('Saved changes to FinancialYearsPage.tsx');
