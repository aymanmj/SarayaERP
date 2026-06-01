const fs = require('fs');
const path = require('path');

const arPath = 'E:/SarayaERP/client/src/locales/ar.json';
const enPath = 'E:/SarayaERP/client/src/locales/en.json';

function setNestedValue(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

// Function to add translations
// updates: array of objects { key: 'namespace.sub.key', ar: 'Arabic', en: 'English' }
function addTranslations(updates) {
  if (!fs.existsSync(arPath) || !fs.existsSync(enPath)) {
    console.error('Translation files not found!');
    return;
  }

  const arObj = JSON.parse(fs.readFileSync(arPath, 'utf8'));
  const enObj = JSON.parse(fs.readFileSync(enPath, 'utf8'));

  updates.forEach(u => {
    setNestedValue(arObj, u.key, u.ar);
    setNestedValue(enObj, u.key, u.en);
  });

  // Sort function to keep everything clean and alphabetized if desired
  // Let's write them back
  fs.writeFileSync(arPath, JSON.stringify(arObj, null, 2), 'utf8');
  fs.writeFileSync(enPath, JSON.stringify(enObj, null, 2), 'utf8');
  console.log(`Successfully added/updated ${updates.length} keys.`);
}

module.exports = { addTranslations };
