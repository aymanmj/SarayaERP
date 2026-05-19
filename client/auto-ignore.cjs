const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, 'eslint-report2.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

// Go through each file in the report
for (const fileResult of report) {
  if (fileResult.errorCount === 0 && fileResult.warningCount === 0) continue;

  const filePath = fileResult.filePath;
  const sourceCode = fs.readFileSync(filePath, 'utf8');
  const lines = sourceCode.split('\n');
  
  // Group messages by line
  const messagesByLine = {};
  for (const message of fileResult.messages) {
    if (!message.ruleId) continue;
    const lineIndex = message.line - 1;
    if (!messagesByLine[lineIndex]) {
      messagesByLine[lineIndex] = new Set();
    }
    messagesByLine[lineIndex].add(message.ruleId);
  }

  // Iterate backwards so inserting doesn't shift the line numbers we haven't processed
  const sortedLines = Object.keys(messagesByLine)
    .map(Number)
    .sort((a, b) => b - a);

  let modified = false;
  for (const lineIndex of sortedLines) {
    const rules = Array.from(messagesByLine[lineIndex]).join(', ');
    
    // Check if previous line already has an eslint-disable-next-line
    const previousLine = lineIndex > 0 ? lines[lineIndex - 1] : '';
    const match = previousLine.match(/\/\/\s*eslint-disable-next-line\s+(.*)/);
    
    if (match) {
        // combine rules
        const existingRules = match[1].split(',').map(r => r.trim());
        const newRules = rules.split(',').map(r => r.trim());
        const combined = Array.from(new Set([...existingRules, ...newRules])).join(', ');
        lines[lineIndex - 1] = previousLine.replace(/\/\/\s*eslint-disable-next-line\s+(.*)/, `// eslint-disable-next-line ${combined}`);
    } else {
        // figure out indentation
        const currentLine = lines[lineIndex];
        const indentMatch = currentLine.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';
        const disableComment = `${indent}// eslint-disable-next-line ${rules}`;
        lines.splice(lineIndex, 0, disableComment);
    }
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`Updated ${filePath}`);
  }
}
