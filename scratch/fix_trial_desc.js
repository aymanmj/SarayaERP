const fs = require('fs');
const file = 'E:/SarayaERP/client/src/pages/TrialBalancePage.tsx';
let c = fs.readFileSync(file, 'utf8');
c = c.replace(/استعراض أرصدة الحسابات[\s\S]*?لكل حساب\./, '{t("accounting.trialBalance.desc", "استعراض أرصدة الحسابات حسب الفترة الزمنية، مع إمكانية فتح دفتر الأستاذ لكل حساب.")}');
fs.writeFileSync(file, c, 'utf8');
console.log('Fixed Trial Balance description!');
