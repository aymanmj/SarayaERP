const fs = require('fs');
const path = require('path');

const TARGETS = [
  'client/src/pages/FinancialYearsPage.tsx',
  'client/src/pages/AccountingJournalPage.tsx',
  'client/src/pages/GeneralLedgerPage.tsx',
  'client/src/pages/YearClosingPage.tsx',
  'client/src/pages/OpeningBalancesPage.tsx',
  'client/src/pages/ChartOfAccountsPage.tsx',
  'client/src/pages/IncomeStatementPage.tsx',
  'client/src/pages/ManualEntryPage.tsx',
  'client/src/pages/BalanceSheetPage.tsx',
  'client/src/pages/vouchers/VouchersListPage.tsx',
  'client/src/pages/TrialBalancePage.tsx',
  'client/src/pages/AccountLedgerPage.tsx',
  'client/src/pages/AccountingEntriesPage.tsx',
  'client/src/pages/vouchers/PrintVoucherPage.tsx',
  'client/src/pages/accounting/CostCentersPage.tsx',
  'client/src/pages/QualityAndSafetyPage.tsx',
  'client/src/pages/IntegrationPage.tsx'
];

const arabicRegex = /[\u0600-\u06FF]+/;

let totalUnwrapped = 0;
const reports = {};

TARGETS.forEach(file => {
  const filePath = path.resolve('E:/SarayaERP', file);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const unwrappedLines = [];

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

    if (arabicRegex.test(line)) {
      // We want to detect if there is Arabic that is NOT wrapped.
      // Let's remove all valid wraps: t("key", "arabic") or t('key', 'arabic') or t("key")
      // Simple regex replacement to strip wrapped t() calls on the line
      let testLine = line;
      // Strip double-quoted wraps
      testLine = testLine.replace(/t\(\s*['"][a-zA-Z0-9_\.-]+['"]\s*,\s*"[^"]*"\s*\)/g, '');
      // Strip single-quoted wraps
      testLine = testLine.replace(/t\(\s*['"][a-zA-Z0-9_\.-]+['"]\s*,\s*'[^']*'\s*\)/g, '');
      // Strip key-only wraps
      testLine = testLine.replace(/t\(\s*['"][a-zA-Z0-9_\.-]+['"]\s*\)/g, '');

      // Check if there is still Arabic remaining on the line
      if (arabicRegex.test(testLine)) {
        unwrappedLines.push({
          lineNum,
          original: trimmed,
          remainder: testLine.trim()
        });
      }
    }
  });

  if (unwrappedLines.length > 0) {
    reports[file] = unwrappedLines;
    totalUnwrapped += unwrappedLines.length;
  }
});

fs.writeFileSync('C:/Users/ayman/.gemini/antigravity/brain/05b8b1dd-565a-4248-9cee-1a8b10391218/scratch/unwrapped_arabic.json', JSON.stringify(reports, null, 2), 'utf8');
console.log(`Total lines with unwrapped Arabic: ${totalUnwrapped}`);
Object.keys(reports).forEach(file => {
  console.log(` - ${file}: ${reports[file].length} lines`);
});
