const fs = require('fs');
const grouped = JSON.parse(fs.readFileSync('C:/Users/ayman/.gemini/antigravity/brain/05b8b1dd-565a-4248-9cee-1a8b10391218/scratch/grouped_arabic.json', 'utf8'));

Object.keys(grouped).forEach(file => {
  console.log(`${file}: ${grouped[file].length} lines`);
});
