const { addTranslations } = require('./add_keys_to_json');

const updates = [
  {
    key: 'accounting.entries.title',
    ar: 'سجل القيود المحاسبية (دفتر اليومية)',
    en: 'Accounting Entries Log (General Journal)'
  },
  {
    key: 'accounting.entries.subtitle',
    ar: 'مراجعة وتدقيق القيود المحاسبية من جميع الأقسام.',
    en: 'Review and audit accounting entries from all departments.'
  },
  {
    key: 'accounting.entries.newManualEntry',
    ar: '+ قيد يدوي جديد',
    en: '+ New Manual Entry'
  },
  {
    key: 'accounting.entries.fromDate',
    ar: 'من تاريخ',
    en: 'From Date'
  },
  {
    key: 'accounting.entries.toDate',
    ar: 'إلى تاريخ',
    en: 'To Date'
  },
  {
    key: 'accounting.entries.processSource',
    ar: 'مصدر العملية',
    en: 'Process Source'
  },
  {
    key: 'accounting.entries.refreshResults',
    ar: 'تحديث النتائج',
    en: 'Refresh Results'
  },
  {
    key: 'accounting.entries.fetchingFinancialData',
    ar: 'جارِ جلب البيانات المالية...',
    en: 'Fetching financial data...'
  },
  {
    key: 'accounting.entries.noMatchingEntries',
    ar: 'لا توجد قيود مطابقة.',
    en: 'No matching entries found.'
  },
  {
    key: 'accounting.entries.totalEntries',
    ar: 'إجمالي القيود:',
    en: 'Total Entries:'
  },
  {
    key: 'accounting.entries.previous',
    ar: 'السابق',
    en: 'Previous'
  },
  {
    key: 'accounting.entries.pageLabel',
    ar: 'صفحة',
    en: 'Page'
  },
  {
    key: 'accounting.entries.ofLabel',
    ar: 'من',
    en: 'of'
  },
  {
    key: 'accounting.entries.next',
    ar: 'التالي',
    en: 'Next'
  }
];

addTranslations(updates);
