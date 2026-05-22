const fs = require('fs');
const path = require('path');

const badCommentsFile = path.resolve(__dirname, 'bad_comments.json');
if (!fs.existsSync(badCommentsFile)) {
  console.error("bad_comments.json not found!");
  process.exit(1);
}

const badComments = JSON.parse(fs.readFileSync(badCommentsFile, 'utf8'));

// Group by file path
const grouped = {};
for (const entry of badComments) {
  const filePath = path.resolve(__dirname, '..', entry.file);
  if (!grouped[filePath]) {
    grouped[filePath] = [];
  }
  grouped[filePath].push(entry);
}

let totalFixed = 0;

for (const [filePath, entries] of Object.entries(grouped)) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    continue;
  }
  
  console.log(`Processing file: ${filePath}`);
  let content = fs.readFileSync(filePath, 'utf8');
  // Detect line ending format
  const isCrlf = content.includes('\r\n');
  const separator = isCrlf ? '\r\n' : '\n';
  
  // Split using regex to handle mixed line endings
  const lines = content.split(/\r?\n/);
  
  let fileFixed = 0;
  for (const entry of entries) {
    const idx = entry.lineNum - 1;
    if (idx < 0 || idx >= lines.length) {
      console.warn(`Line number ${entry.lineNum} out of range for ${entry.file}`);
      continue;
    }
    
    const line = lines[idx];
    if (line.includes('// eslint-disable-next-line')) {
      // Find leading whitespace
      const matchWs = line.match(/^(\s*)/);
      const ws = matchWs ? matchWs[1] : '';
      
      // Extract the comment content
      const commentContent = line.trim().substring(2).trim(); // Remove '//'
      
      // Replace with JSX comment syntax
      lines[idx] = `${ws}{/* ${commentContent} */}`;
      fileFixed++;
      totalFixed++;
    } else if (line.includes('{/* eslint-disable-next-line')) {
      // Already fixed in a previous run
      console.log(`Line ${entry.lineNum} in ${entry.file} is already wrapped in JSX braces.`);
    } else {
      console.warn(`Line ${entry.lineNum} in ${entry.file} does not contain '// eslint-disable-next-line'. Actual content: "${line}"`);
    }
  }
  
  if (fileFixed > 0) {
    fs.writeFileSync(filePath, lines.join(separator), 'utf8');
    console.log(`Successfully fixed ${fileFixed} comments in ${path.basename(filePath)}`);
  }
}

console.log(`\n🎉 Total eslint-disable comments wrapped in JSX: ${totalFixed}`);
