const fs = require('fs');
const path = require('path');

function getKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        keys = keys.concat(getKeys(obj[key], fullKey));
      } else {
        keys.push(fullKey);
      }
    }
  }
  return keys;
}

function compareFiles(file1, file2, name) {
  if (!fs.existsSync(file1) || !fs.existsSync(file2)) {
    console.error(`⚠️ Error: Translation files not found for ${name}`);
    console.error(`Paths checked:\n  - ${file1}\n  - ${file2}`);
    return false;
  }
  
  let obj1, obj2;
  try {
    obj1 = JSON.parse(fs.readFileSync(file1, 'utf8'));
    obj2 = JSON.parse(fs.readFileSync(file2, 'utf8'));
  } catch (parseError) {
    console.error(`❌ Parse Error in JSON files for ${name}:`, parseError.message);
    return false;
  }
  
  const keys1 = getKeys(obj1);
  const keys2 = getKeys(obj2);
  
  const set1 = new Set(keys1);
  const set2 = new Set(keys2);
  
  const missingIn2 = keys1.filter(k => !set2.has(k));
  const missingIn1 = keys2.filter(k => !set1.has(k));
  
  let success = true;
  if (missingIn2.length > 0) {
    console.error(`\n❌ ${name}: Keys in ${path.basename(file1)} but missing in ${path.basename(file2)}:`);
    missingIn2.forEach(k => console.error(`  - ${k}`));
    success = false;
  }
  
  if (missingIn1.length > 0) {
    console.error(`\n❌ ${name}: Keys in ${path.basename(file2)} but missing in ${path.basename(file1)}:`);
    missingIn1.forEach(k => console.error(`  - ${k}`));
    success = false;
  }
  
  if (success) {
    console.log(`\n✅ ${name}: All keys are balanced! (Count: ${keys1.length})`);
  }
  return success;
}

const clientAr = path.join(__dirname, '../client/src/locales/ar.json');
const clientEn = path.join(__dirname, '../client/src/locales/en.json');
const mobileAr = path.join(__dirname, '../mobile/i18n/locales/ar.json');
const mobileEn = path.join(__dirname, '../mobile/i18n/locales/en.json');

console.log('🔍 Starting i18n key validation check...');

const clientSuccess = compareFiles(clientAr, clientEn, 'Client');
const mobileSuccess = compareFiles(mobileAr, mobileEn, 'Mobile');

if (!clientSuccess || !mobileSuccess) {
  console.error('\n❌ i18n validation check failed! Some keys are mismatched.');
  process.exit(1);
} else {
  console.log('\n🎉 i18n key validation check passed successfully!');
  process.exit(0);
}
