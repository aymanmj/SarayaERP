const fs = require('fs');

const file = 'E:/SarayaERP/client/src/pages/TrialBalancePage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    '"حدث خطأ أثناء تحميل ميزان المراجعة.";',
    't("accounting.trialBalance.errorLoadingTrialBalance", "حدث خطأ أثناء تحميل ميزان المراجعة.");'
  ],
  [
    'استعراض أرصدة الحسابات حسب الفترة الزمنية، مع إمكانية فتح دفتر\n            الأستاذ لكل حساب.',
    '{t("accounting.trialBalance.desc", "استعراض أرصدة الحسابات حسب الفترة الزمنية، مع إمكانية فتح دفتر الأستاذ لكل حساب.")}'
  ],
  [
    'تحديث',
    '{t("accounting.trialBalance.refresh", "تحديث")}'
  ],
  [
    'تطبيق الفلتر',
    '{t("accounting.trialBalance.applyFilter", "تطبيق الفلتر")}'
  ],
  [
    'الفرق (يُفضّل أن يكون 0.000)',
    '{t("accounting.trialBalance.difference", "الفرق (يُفضّل أن يكون 0.000)")}'
  ],
  [
    'جارِ تحميل ميزان المراجعة...',
    '{t("accounting.trialBalance.loading", "جارِ تحميل ميزان المراجعة...")}'
  ],
  [
    'لا توجد حركات في الفترة المحددة.',
    '{t("accounting.trialBalance.noTransactions", "لا توجد حركات في الفترة المحددة.")}'
  ],
  [
    'الإجمالي',
    '{t("accounting.trialBalance.total", "الإجمالي")}'
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
console.log('TrialBalancePage translation applied!');
