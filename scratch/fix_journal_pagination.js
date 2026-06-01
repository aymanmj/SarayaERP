const fs = require('fs');
const path = require('path');
const { addTranslations } = require('./add_keys_to_json');

const pagePath = path.resolve(__dirname, '../client/src/pages/AccountingJournalPage.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

content = content.replace(/\r\n/g, '\n');

const target = '          الصفحة {page} من {totalPages} (إجمالي {total} قيد)';
const replace = '          {t("accounting.journal.pageOfTotal", "الصفحة {{page}} من {{totalPages}} (إجمالي {{total}} قيد)", { page, totalPages, total })}';

if (content.includes(target)) {
  content = content.split(target).join(replace);
  fs.writeFileSync(pagePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Successfully replaced pagination in AccountingJournalPage.tsx');
  
  addTranslations([
    {
      key: 'accounting.journal.pageOfTotal',
      ar: 'الصفحة {{page}} من {{totalPages}} (إجمالي {{total}} قيد)',
      en: 'Page {{page}} of {{totalPages}} (Total {{total}} entries)'
    }
  ]);
} else {
  console.log('Target not found in AccountingJournalPage.tsx');
}
