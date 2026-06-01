const fs = require('fs');
const path = require('path');
const https = require('https');

const fileArg = process.argv[2];
const nsArg = process.argv[3];

if (!fileArg || !nsArg) {
  console.log('Usage: node run_auto_wrap.js <file_path> <namespace>');
  process.exit(1);
}

const target = { file: fileArg, ns: nsArg };

// Helper: HTTP request for translation
function translateText(text) {
  return new Promise((resolve) => {
    if (!text.trim() || /^[\d\s\-\.\:\/]+$/.test(text)) {
      resolve(text);
      return;
    }
    
    // Clean emojis
    const cleanedText = text.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '').trim();
    if (!cleanedText) {
      resolve(text);
      return;
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(cleanedText)}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const translation = parsed[0][0][0];
          resolve(translation || text);
        } catch (e) {
          resolve(text);
        }
      });
    }).on('error', () => {
      resolve(text);
    });
  });
}

function toCamelCase(str) {
  if (!str) return 'key';
  let cleaned = str.replace(/[^a-zA-Z0-9\s]/g, '');
  
  if (cleaned.toLowerCase().includes('fiscal year') || cleaned.toLowerCase().includes('financial year')) {
    cleaned = cleaned.replace(/fiscal\s*year/gi, 'financialYear').replace(/financial\s*year/gi, 'financialYear');
  }
  
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'key';
  
  return words
    .map((word, idx) => {
      if (idx === 0) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('')
    .slice(0, 40); // limit key length
}

function setDeepValue(obj, pathStr, value) {
  const parts = pathStr.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

const arLocalesPath = 'E:/SarayaERP/client/src/locales/ar.json';
const enLocalesPath = 'E:/SarayaERP/client/src/locales/en.json';

const arLoc = JSON.parse(fs.readFileSync(arLocalesPath, 'utf8'));
const enLoc = JSON.parse(fs.readFileSync(enLocalesPath, 'utf8'));

function sortObjectKeys(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj;
  }
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = sortObjectKeys(obj[key]);
  }
  return sortedObj;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function processFile({ file, ns }) {
  const absolutePath = path.resolve('E:/SarayaERP', file);
  if (!fs.existsSync(absolutePath)) {
    console.log(`File not found: ${file}`);
    return;
  }
  
  console.log(`\nProcessing: ${file} (namespace: ${ns})`);
  
  let content = fs.readFileSync(absolutePath, 'utf8');
  content = content.replace(/\r\n/g, '\n'); // Normalize line endings
  
  // First, clean up double wrapped keys like t("key", t("key", "default")) in the file
  const doubleWrapRegex = /t\(\s*"([^"]+)"\s*,\s*t\(\s*"\1"\s*,\s*"([^"]+)"\s*\)\s*\)/g;
  content = content.replace(doubleWrapRegex, 't("$1", "$2")');
  const doubleWrapRegexSingle = /t\(\s*'([^']+)'\s*,\s*t\(\s*'\1'\s*,\s*'([^']+)'\s*\)\s*\)/g;
  content = content.replace(doubleWrapRegexSingle, 't("$1", "$2")');

  const lines = content.split('\n');
  const arabicRegex = /[\u0600-\u06FF]/;
  
  const extractedArabic = new Set();
  
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || (trimmed.startsWith('{/*') && trimmed.endsWith('*/}'))) return;
    if (trimmed.includes('import ') || trimmed.includes('console.')) return;
    
    if (arabicRegex.test(line)) {
      // Find strings in single/double quotes or backticks
      const quoteRegex = /(["'`])([^"'`\n]*[\u0600-\u06FF]+[^"'`\n]*)\1/g;
      let qMatch;
      while ((qMatch = quoteRegex.exec(line)) !== null) {
        const str = qMatch[2].trim();
        // Exclude if it's already translated (removed the .includes('.') check because Arabic sentences contain dots)
        if (str && !/t\(\s*['"`]/.test(line.slice(Math.max(0, qMatch.index - 35), qMatch.index))) {
          extractedArabic.add(str);
        }
      }
      
      // Find JSX text nodes on a single line
      const jsxTextRegex = />([^<>]*[\u0600-\u06FF]+[^<>]*)</g;
      let jMatch;
      while ((jMatch = jsxTextRegex.exec(line)) !== null) {
        const text = jMatch[1].trim();
        if (text && !text.includes('{') && !text.includes('}')) {
          extractedArabic.add(text);
        }
      }

      // Find raw multiline JSX text (lines with no brackets, tags, or braces)
      if (!line.includes('<') && !line.includes('>') && !line.includes('{') && !line.includes('}') && !line.includes('"') && !line.includes("'") && !line.includes('`')) {
        const text = line.trim();
        if (text && arabicRegex.test(text)) {
          extractedArabic.add(text);
        }
      }
    }
  });
  
  const arabicStrings = Array.from(extractedArabic).filter(Boolean);
  console.log(`Found ${arabicStrings.length} Arabic strings to wrap.`);
  
  if (arabicStrings.length === 0) {
    fs.writeFileSync(absolutePath, content.replace(/\n/g, '\r\n'), 'utf8');
    console.log(`Saved file after double wrap cleanup.`);
    return;
  }
  
  // Translate and build key mappings
  const mapping = {};
  for (const arText of arabicStrings) {
    const enText = await translateText(arText);
    const camelKey = toCamelCase(enText) || 'textKey';
    const fullKey = `${ns}.${camelKey}`;
    mapping[arText] = { key: fullKey, ar: arText, en: enText };
    console.log(`  "${arText}" -> ${fullKey} ("${enText}")`);
  }
  
  // Perform replacement in code
  const sortedArabic = arabicStrings.sort((a, b) => b.length - a.length);
  
  for (const arText of sortedArabic) {
    const { key, ar } = mapping[arText];
    
    // Replace attribute strings, e.g. placeholder="العربية"
    const attrDoubleRegex = new RegExp(`(\\b[a-zA-Z0-9_-]+)=\\"${escapeRegExp(ar)}\\"`, 'g');
    content = content.replace(attrDoubleRegex, `$1={t("${key}", "${ar}")}`);
    
    const attrSingleRegex = new RegExp(`(\\b[a-zA-Z0-9_-]+)=\\'${escapeRegExp(ar)}\\'`, 'g');
    content = content.replace(attrSingleRegex, `$1={t("${key}", "${ar}")}`);
    
    // Replace JSX text: >العربية<
    const jsxTextRegex = new RegExp(`>(\\s*)${escapeRegExp(ar)}(\\s*)<`, 'g');
    content = content.replace(jsxTextRegex, `>$1{t("${key}", "${ar}")}$2<`);
    
    // Replace raw multiline JSX text (replace exact lines)
    const rawLineRegex = new RegExp(`^(\\s*)${escapeRegExp(ar)}(\\s*)$`, 'gm');
    content = content.replace(rawLineRegex, `$1{t("${key}", "${ar}")}$2`);

    // Replace JS string literals: "العربية"
    const literalDoubleRegex = new RegExp(`\\"${escapeRegExp(ar)}\\"`, 'g');
    content = content.replace(literalDoubleRegex, (match, offset, fullStr) => {
      const slice = fullStr.slice(Math.max(0, offset - 12), offset);
      if (slice.includes('t(') || slice.includes('t ("') || slice.includes('t("')) return match;
      return `t("${key}", "${ar}")`;
    });
    
    const literalSingleRegex = new RegExp(`\\'${escapeRegExp(ar)}\\'`, 'g');
    content = content.replace(literalSingleRegex, (match, offset, fullStr) => {
      const slice = fullStr.slice(Math.max(0, offset - 12), offset);
      if (slice.includes('t(') || slice.includes("t ('") || slice.includes('t(\'')) return match;
      return `t("${key}", "${ar}")`;
    });
    
    // Write key values to locales objects
    setDeepValue(arLoc, key, ar);
    setDeepValue(enLoc, key, mapping[arText].en);
  }
  
  // Ensure useTranslation hook is imported and active
  if (!content.includes('useTranslation')) {
    content = 'import { useTranslation } from "react-i18next";\n' + content;
  }
  
  // Ensure useTranslation hook instantiation exists
  const functionRegex = /(export\s+(?:default\s+)?function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{)/;
  if (functionRegex.test(content) && !content.includes('const { t') && !content.includes('const {t')) {
    content = content.replace(functionRegex, `$1\n  const { t, i18n } = useTranslation();\n  const isRtl = i18n.language === "ar";\n`);
  }
  
  // Convert back to CRLF
  content = content.replace(/\n/g, '\r\n');
  
  // Save updated file
  fs.writeFileSync(absolutePath, content, 'utf8');
  console.log(`Saved wrapped file: ${file}`);
}

async function run() {
  await processFile(target);
  
  // Sort and save translation files
  const parts = nsArg.split('.');
  const topNs = parts[0];
  if (arLoc[topNs]) arLoc[topNs] = sortObjectKeys(arLoc[topNs]);
  if (enLoc[topNs]) enLoc[topNs] = sortObjectKeys(enLoc[topNs]);
  
  fs.writeFileSync(arLocalesPath, JSON.stringify(arLoc, null, 2) + '\n', 'utf8');
  fs.writeFileSync(enLocalesPath, JSON.stringify(enLoc, null, 2) + '\n', 'utf8');
  
  console.log('Locales updated successfully!');
}

run();
