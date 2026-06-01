const { addTranslations } = require('./add_keys_to_json');

const updates = [
  {
    key: 'accounting.trialBalance.errorLoadingTrialBalance',
    ar: 'حدث خطأ أثناء تحميل ميزان المراجعة.',
    en: 'An error occurred while loading the trial balance.'
  },
  {
    key: 'accounting.trialBalance.desc',
    ar: 'استعراض أرصدة الحسابات حسب الفترة الزمنية، مع إمكانية فتح دفتر الأستاذ لكل حساب.',
    en: 'View account balances by period, with the ability to open the ledger for each account.'
  },
  {
    key: 'accounting.trialBalance.refresh',
    ar: 'تحديث',
    en: 'Refresh'
  },
  {
    key: 'accounting.trialBalance.applyFilter',
    ar: 'تطبيق الفلتر',
    en: 'Apply Filter'
  },
  {
    key: 'accounting.trialBalance.difference',
    ar: 'الفرق (يُفضّل أن يكون 0.000)',
    en: 'Difference (Preferred to be 0.000)'
  },
  {
    key: 'accounting.trialBalance.loading',
    ar: 'جارِ تحميل ميزان المراجعة...',
    en: 'Loading trial balance...'
  },
  {
    key: 'accounting.trialBalance.noTransactions',
    ar: 'لا توجد حركات في الفترة المحددة.',
    en: 'No transactions in the specified period.'
  },
  {
    key: 'accounting.trialBalance.total',
    ar: 'الإجمالي',
    en: 'Total'
  }
];

addTranslations(updates);
