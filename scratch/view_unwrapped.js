const fs = require('fs');
const reports = JSON.parse(fs.readFileSync('C:/Users/ayman/.gemini/antigravity/brain/05b8b1dd-565a-4248-9cee-1a8b10391218/scratch/unwrapped_arabic.json', 'utf8'));

const fileKey = process.argv[2];
if (!fileKey) {
  console.log('Please provide a file key, e.g. client/src/pages/accounting/CostCentersPage.tsx');
  process.exit(1);
}

const data = reports[fileKey];
if (!data) {
  console.log(`No unwrapped lines found for ${fileKey}`);
} else {
  console.log(`=== Unwrapped lines in ${fileKey} ===`);
  data.forEach(item => {
    console.log(`Line ${item.lineNum}: ${item.original}`);
  });
}
