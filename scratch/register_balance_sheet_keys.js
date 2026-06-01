const { addTranslations } = require('./add_keys_to_json');

const updates = [
  {
    key: 'accounting.balanceSheet.errorLoadingBalanceSheet',
    ar: 'حدث خطأ أثناء جلب بيانات الميزانية العمومية.',
    en: 'An error occurred while fetching the balance sheet data.'
  },
  {
    key: 'accounting.balanceSheet.desc',
    ar: 'استعراض المركز المالي للمنشأة حتى تاريخ معيّن.',
    en: 'View the organization\'s financial position as of a specific date.'
  },
  {
    key: 'accounting.balanceSheet.asOfDateLabel',
    ar: 'حتى تاريخ:',
    en: 'As of date:'
  },
  {
    key: 'accounting.balanceSheet.updating',
    ar: 'جارِ التحديث...',
    en: 'Updating...'
  },
  {
    key: 'accounting.balanceSheet.totalLiabilitiesAndEquity',
    ar: 'إجمالي الالتزامات + حقوق الملكية',
    en: 'Total Liabilities & Equity'
  },
  {
    key: 'accounting.balanceSheet.accountNumber',
    ar: 'رقم الحساب',
    en: 'Account Code'
  },
  {
    key: 'accounting.balanceSheet.accountName',
    ar: 'اسم الحساب',
    en: 'Account Name'
  },
  {
    key: 'accounting.balanceSheet.noAssets',
    ar: 'لا توجد أرصدة أصول مسجلة حتى هذا التاريخ.',
    en: 'No asset balances recorded as of this date.'
  },
  {
    key: 'accounting.balanceSheet.noLiabilities',
    ar: 'لا توجد التزامات مسجلة حتى هذا التاريخ.',
    en: 'No liabilities recorded as of this date.'
  },
  {
    key: 'accounting.balanceSheet.noEquity',
    ar: 'لا توجد أرصدة لحقوق الملكية حتى هذا التاريخ.',
    en: 'No equity balances recorded as of this date.'
  }
];

addTranslations(updates);
