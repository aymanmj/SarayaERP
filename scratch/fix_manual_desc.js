const fs = require('fs');
const file = 'E:/SarayaERP/client/src/pages/ManualEntryPage.tsx';
let c = fs.readFileSync(file, 'utf8');
c = c.replace(/تسجيل العمليات المحاسبية[\s\S]*?التكلفة\./, '{t("accounting.manualEntry.desc", "تسجيل العمليات المحاسبية (تسويات، مصاريف، عهد) مع توجيه مراكز التكلفة.")}');
fs.writeFileSync(file, c, 'utf8');
console.log('Fixed Manual Entry description!');
