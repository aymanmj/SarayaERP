const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.controller.spec.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
let changed = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  if (!content.includes('Test.createTestingModule') || !content.includes('.compile()')) {
    continue;
  }
  
  if (content.includes('overrideGuard(PermissionsGuard)')) {
    continue;
  }
  
  // Calculate relative path for import
  const guardPath = path.resolve('./src/auth/permissions.guard.ts');
  const fileDir = path.dirname(path.resolve(file));
  let relativePath = path.relative(fileDir, guardPath).replace(/\\/g, '/').replace('.ts', '');
  if (!relativePath.startsWith('.')) relativePath = './' + relativePath;
  
  const importStatement = `import { PermissionsGuard } from '${relativePath}';\n`;
  
  // Insert import at the top if not already present
  if (!content.includes('PermissionsGuard')) {
    content = importStatement + content;
  }
  
  // Replace .compile()
  content = content.replace(/\.compile\(\)/g, `.overrideGuard(PermissionsGuard).useValue({ canActivate: () => true }).compile()`);
  
  fs.writeFileSync(file, content, 'utf8');
  changed++;
}

console.log(`Updated ${changed} controller test files.`);
