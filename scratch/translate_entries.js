const fs = require('fs');

const file = 'E:/SarayaERP/client/src/pages/AccountingEntriesPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    'سجل القيود المحاسبية (دفتر اليومية)',
    '{t("accounting.entries.title", "سجل القيود المحاسبية (دفتر اليومية)")}'
  ],
  [
    'مراجعة وتدقيق القيود المحاسبية من جميع الأقسام.',
    '{t("accounting.entries.subtitle", "مراجعة وتدقيق القيود المحاسبية من جميع الأقسام.")}'
  ],
  [
    '+ قيد يدوي جديد',
    '{t("accounting.entries.newManualEntry", "+ قيد يدوي جديد")}'
  ],
  [
    'من تاريخ',
    '{t("accounting.entries.fromDate", "من تاريخ")}'
  ],
  [
    'إلى تاريخ',
    '{t("accounting.entries.toDate", "إلى تاريخ")}'
  ],
  [
    'مصدر العملية',
    '{t("accounting.entries.processSource", "مصدر العملية")}'
  ],
  [
    'تحديث النتائج',
    '{t("accounting.entries.refreshResults", "تحديث النتائج")}'
  ],
  [
    'جارِ جلب البيانات المالية...',
    '{t("accounting.entries.fetchingFinancialData", "جارِ جلب البيانات المالية...")}'
  ],
  [
    'لا توجد قيود مطابقة.',
    '{t("accounting.entries.noMatchingEntries", "لا توجد قيود مطابقة.")}'
  ],
  [
    'إجمالي القيود:{" "}',
    '{t("accounting.entries.totalEntries", "إجمالي القيود:")}{" "}'
  ],
  [
    'السابق',
    '{t("accounting.entries.previous", "السابق")}'
  ],
  [
    'صفحة <span className="text-sky-400 font-bold mx-2">{page}</span>{" "}',
    '{t("accounting.entries.pageLabel", "صفحة")} <span className="text-sky-400 font-bold mx-2">{page}</span>{" "}'
  ],
  [
    'من{" "}',
    '{t("accounting.entries.ofLabel", "من")}{" "}'
  ],
  [
    'التالي',
    '{t("accounting.entries.next", "التالي")}'
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
console.log('AccountingEntriesPage translation applied!');
