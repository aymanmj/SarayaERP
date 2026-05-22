const fs = require('fs');
const path = require('path');

function scanDir(dir, results = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath, results);
    } else if (file.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = scanDir(path.resolve(__dirname, '../client/src'));
const badComments = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  
  let insideReturn = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('return (') || line.trim().startsWith('return <')) {
      insideReturn++;
    }
    
    if (insideReturn > 0) {
      if (/^\s*\/\/\s*eslint-disable/.test(line)) {
        const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0) || '';
        const isJSX = /^\s*[<{]/.test(nextNonEmpty) || /<\w+/.test(nextNonEmpty) || /<\/\w+/.test(lines.slice(Math.max(0, i - 3), i).join('\n'));
        
        if (isJSX) {
          badComments.push({
            file: path.relative(path.resolve(__dirname, '..'), file),
            lineNum: i + 1,
            lineContent: line.trim()
          });
        }
      }
    }
    
    if (line.includes(');')) {
      insideReturn = Math.max(0, insideReturn - 1);
    }
  }
}

fs.writeFileSync(path.resolve(__dirname, 'bad_comments.json'), JSON.stringify(badComments, null, 2));
console.log(`Saved ${badComments.length} bad comments to bad_comments.json`);
