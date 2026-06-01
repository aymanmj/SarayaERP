const fs = require('fs');
const path = require('path');
const { addTranslations } = require('./add_keys_to_json');

const pagePath = path.resolve(__dirname, '../client/src/pages/GeneralLedgerPage.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

content = content.replace(/\r\n/g, '\n');

const target = '                الفترة: من {formatDate(ledger.from)} إلى {formatDate(ledger.to)}';
const replace = '                {t("accounting.ledger.periodFromTo", "الفترة: من {{from}} إلى {{to}}", { from: formatDate(ledger.from), to: formatDate(ledger.to) })}';

if (content.includes(target)) {
  content = content.split(target).join(replace);
  fs.writeFileSync(pagePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Successfully replaced periodFromTo in GeneralLedgerPage.tsx');
  
  addTranslations([
    {
      key: 'accounting.ledger.periodFromTo',
      ar: 'الفترة: من {{from}} إلى {{to}}',
      en: 'Period: From {{from}} To {{to}}'
    }
  ]);
} else {
  console.log('Target not found in GeneralLedgerPage.tsx');
}
