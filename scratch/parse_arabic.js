const fs = require('fs');
const content = fs.readFileSync('C:/Users/ayman/.gemini/antigravity/brain/05b8b1dd-565a-4248-9cee-1a8b10391218/scratch/raw_arabic_lines.txt', 'utf8');

const files = {};
let currentFile = null;

content.split('\n').forEach(line => {
  if (line.startsWith('File: ')) {
    currentFile = line.replace('File: ', '').trim();
    files[currentFile] = [];
  } else if (currentFile && line.trim().startsWith('Line ')) {
    const match = line.match(/^\s*Line\s+(\d+):\s*(.*)$/);
    if (match) {
      files[currentFile].push({
        lineNum: parseInt(match[1]),
        text: match[2].trim()
      });
    }
  }
});

fs.writeFileSync('C:/Users/ayman/.gemini/antigravity/brain/05b8b1dd-565a-4248-9cee-1a8b10391218/scratch/grouped_arabic.json', JSON.stringify(files, null, 2), 'utf8');
console.log('Grouped successfully!');
