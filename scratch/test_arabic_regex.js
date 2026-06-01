const fs = require('fs');
const content = fs.readFileSync('E:/SarayaERP/client/src/pages/FinancialYearsPage.tsx', 'utf8').replace(/\r\n/g, '\n');
const lines = content.split('\n');
const arabicRegex = /[\u0600-\u06FF]/;

lines.forEach((line, idx) => {
  if (arabicRegex.test(line)) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
    const quoteRegex = /(["'`])([^"'`\n]*[\u0600-\u06FF]+[^"'`\n]*)\1/g;
    let match;
    while ((match = quoteRegex.exec(line)) !== null) {
      console.log(`  Match: ${match[2]}`);
    }
  }
});
