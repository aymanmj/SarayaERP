const fs = require('fs');
const path = require('path');

const clientSrcDir = path.join(__dirname, '../client/src');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      results.push(filePath);
    }
  });
  return results;
}

const files = walk(clientSrcDir);
let modifiedCount = 0;

files.forEach((filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Skip files that don't contain static dir="rtl"
  if (!content.includes('dir="rtl"')) {
    return;
  }

  const relativePath = path.relative(path.join(__dirname, '..'), filePath);
  console.log(`Processing file: ${relativePath}`);

  let modified = false;

  // 1. Check if useTranslation is imported
  const hasUseTranslationImport = content.includes('useTranslation');
  const hasReactI18nextImport = content.includes('react-i18next');

  if (!hasReactI18nextImport) {
    // Add import statement at the beginning
    content = `import { useTranslation } from "react-i18next";\n` + content;
    modified = true;
  } else if (!hasUseTranslationImport) {
    // Modify existing react-i18next import to include useTranslation
    // E.g., import { something } from "react-i18next"
    content = content.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]react-i18next['"]/g,
      (match, imports) => {
        if (!imports.includes('useTranslation')) {
          return `import { ${imports.trim()}, useTranslation } from "react-i18next"`;
        }
        return match;
      }
    );
    modified = true;
  }

  // 2. Check if isRtl or i18n is already defined or used in the component
  const hasIsRtl = content.includes('const isRtl') || content.includes('let isRtl');
  
  if (!hasIsRtl) {
    // Find the main component function block
    // Match export default function / export function
    const functionRegex = /(export\s+default\s+function|export\s+function|function|const)\s+([A-Za-z0-9_]+)/g;
    
    // We want to insert the useTranslation hooks inside the component function
    // Usually right after the opening brace of export default function Name(...) {
    content = content.replace(
      /(export\s+(default\s+)?(function|const)\s+([A-Za-z0-9_]+)[^({]*\([^)]*\)[^{]*\{)/g,
      (match) => {
        // Only inject in components, uppercase first letter
        const matchName = match.match(/(?:function|const)\s+([A-Za-z0-9_]+)/);
        if (matchName && matchName[1] && matchName[1][0] === matchName[1][0].toUpperCase()) {
          console.log(`  -> Injecting useTranslation & isRtl into component: ${matchName[1]}`);
          return match + `\n  const { t, i18n } = useTranslation();\n  const isRtl = i18n.language === "ar";\n`;
        }
        return match;
      }
    );
    modified = true;
  } else {
    // Check if we need to make sure i18n is destructured if we need it
    // But since hasIsRtl is true, isRtl is already defined, so we just use it.
    console.log(`  -> isRtl is already defined in this file.`);
  }

  // 3. Replace dir="rtl" with dir={isRtl ? "rtl" : "ltr"}
  // Make sure we don't match commented-out lines if possible, but standard replace works
  const newContent = content.replace(/dir="rtl"/g, 'dir={isRtl ? "rtl" : "ltr"}');
  if (newContent !== content) {
    content = newContent;
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    modifiedCount++;
    console.log(`  -> Successfully updated!`);
  }
});

console.log(`\n🎉 Processed all files. Modified ${modifiedCount} files.`);
