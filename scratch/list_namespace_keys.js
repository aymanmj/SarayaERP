const fs = require('fs');
const ar = JSON.parse(fs.readFileSync('E:/SarayaERP/client/src/locales/ar.json', 'utf8'));

const printKeys = (obj, prefix = '') => {
  for (const k in obj) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object') {
      printKeys(obj[k], full);
    } else {
      if (full.startsWith('accounting') || full.startsWith('quality') || full.startsWith('integration')) {
        console.log(`${full}: ${obj[k]}`);
      }
    }
  }
};

printKeys(ar);
