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

TARGETS.forEach(file => {
  const filePath = path.resolve('E:/SarayaERP', file);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping missing file: ${file}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace t("key", t("key", "default")) with t("key", "default")
  // Using both double quotes and single quotes
  const doubleWrapRegexDouble = /t\(\s*"([^"]+)"\s*,\s*t\(\s*"\1"\s*,\s*"([^"]+)"\s*\)\s*\)/g;
  const doubleWrapRegexSingle = /t\(\s*'([^']+)'\s*,\s*t\(\s*'\1'\s*,\s*'([^']+)'\s*\)\s*\)/g;
  const doubleWrapRegexMixed1 = /t\(\s*"([^"]+)"\s*,\s*t\(\s*"\1"\s*,\s*'([^']+)'\s*\)\s*\)/g;
  const doubleWrapRegexMixed2 = /t\(\s*'([^']+)'\s*,\s*t\(\s*'\1'\s*,\s*"([^"]+)"\s*\)\s*\)/g;

  let original = content;
  content = content.replace(doubleWrapRegexDouble, 't("$1", "$2")');
  content = content.replace(doubleWrapRegexSingle, "t('$1', '$2')");
  content = content.replace(doubleWrapRegexMixed1, 't("$1", "$2")');
  content = content.replace(doubleWrapRegexMixed2, "t('$1', '$2')");

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Cleaned up double wrapping in ${file}`);
  }
});

console.log('Cleanup finished!');
