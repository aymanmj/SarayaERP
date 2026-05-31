const fs = require('fs');
const path = require('path');

const clientPagesDir = path.join(__dirname, '../client/src/pages');
const arabicRegex = /[\u0600-\u06FF]/;
const results = [];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const matches = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (trimmed.includes('import') || trimmed.includes('console.')) return;
    
    // Check if line contains Arabic text
    if (arabicRegex.test(line)) {
      // Ignore if it's already wrapped in t("...") or t('...')
      // Simple check: does it contain t(" or t(' and then contains the Arabic string?
      const isWrapped = /t\(\s*['"`]/.test(line);
      if (!isWrapped) {
        matches.push({ lineNum: idx + 1, content: trimmed });
      }
    }
  });

  if (matches.length > 0) {
    results.push({
      relativePath: path.relative(clientPagesDir, filePath),
      matchCount: matches.length,
      preview: matches.slice(0, 5)
    });
  }
}

function scanDir(dirPath) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      checkFile(fullPath);
    }
  });
}

console.log('🔍 Scanning client/src/pages for strictly hardcoded Arabic text...');
scanDir(clientPagesDir);

results.sort((a, b) => b.matchCount - a.matchCount);

console.log(`\nFound ${results.length} files requiring TSX translation code modifications:`);
results.forEach(res => {
  console.log(`- ${res.relativePath} (${res.matchCount} lines of hardcoded Arabic)`);
});
