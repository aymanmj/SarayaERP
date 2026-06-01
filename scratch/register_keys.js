const { addTranslations } = require('./add_keys_to_json');

const updates = [
  {
    key: 'accounting.accountLedger.invalidAccountSelected',
    ar: 'لم يتم تحديد حساب بشكل صحيح.',
    en: 'Invalid account selected.'
  },
  {
    key: 'accounting.accountLedger.errorLoadingLedger',
    ar: 'حدث خطأ أثناء تحميل دفتر الأستاذ.',
    en: 'An error occurred while loading the ledger.'
  },
  {
    key: 'accounting.accountLedger.viewTransactionsDesc',
    ar: 'استعراض الحركات المحاسبية على حساب محدد مع الرصيد التراكمي.',
    en: 'View accounting transactions for a specific account with cumulative balance.'
  },
  {
    key: 'accounting.accountLedger.codeLabel',
    ar: 'الكود',
    en: 'Code'
  },
  {
    key: 'accounting.accountLedger.typeLabel',
    ar: 'النوع',
    en: 'Type'
  },
  {
    key: 'accounting.accountLedger.applyFilter',
    ar: 'تطبيق الفلتر',
    en: 'Apply Filter'
  },
  {
    key: 'accounting.accountLedger.clearFilters',
    ar: 'مسح الفلاتر',
    en: 'Clear Filters'
  },
  {
    key: 'accounting.accountLedger.loadingData',
    ar: 'جارِ تحميل البيانات...',
    en: 'Loading data...'
  },
  {
    key: 'accounting.accountLedger.noDataAvailable',
    ar: 'لا توجد بيانات متاحة.',
    en: 'No data available.'
  },
  {
    key: 'accounting.accountLedger.accountSummary',
    ar: 'ملخص الحساب',
    en: 'Account Summary'
  },
  {
    key: 'accounting.accountLedger.accountTransactionsLedger',
    ar: 'حركات الحساب (دفتر الأستاذ)',
    en: 'Account Transactions (Ledger)'
  },
  {
    key: 'accounting.accountLedger.noTransactionsInPeriod',
    ar: 'لا توجد حركات في هذه الفترة لهذا الحساب.',
    en: 'There are no transactions for this account in the specified period.'
  },
  {
    key: 'accounting.accountLedger.entryHash',
    ar: 'قيد #',
    en: 'Entry #'
  }
];

addTranslations(updates);
