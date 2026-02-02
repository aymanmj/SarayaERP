#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Fix missing imports in test files
const srcDir = path.join(__dirname, 'src');
const testFiles = [];

function findTestFiles(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findTestFiles(filePath);
    } else if (file.endsWith('.spec.ts')) {
      testFiles.push(filePath);
    }
  }
}

findTestFiles(srcDir);

console.log(`Fixing imports in ${testFiles.length} test files`);

// Required imports for all test files
const requiredImports = `import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountingService } from '../accounting/accounting.service';
import { InsuranceCalculationService } from '../insurance/insurance-calculation.service';
import { FinancialYearsService } from '../financial-years/financial-years.service';
import { CDSSService } from '../cdss/cdss.service';
import { SoftDeleteService } from '../common/soft-delete.service';`;

testFiles.forEach(filePath => {
  console.log(`Fixing imports: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if imports are missing
    if (!content.includes('InsuranceCalculationService') && 
        content.includes('InsuranceCalculationService')) {
      
      // Add required imports after existing imports
      const importRegex = /import.*from.*;$/gm;
      const lastImport = [...content.matchAll(importRegex)].pop();
      
      if (lastImport) {
        const insertPosition = lastImport.index + lastImport[0].length;
        content = content.slice(0, insertPosition) + 
                  '\n' + requiredImports + 
                  content.slice(insertPosition);
      }
      
      fs.writeFileSync(filePath, content);
      console.log(`  ✓ Fixed imports`);
    } else {
      console.log(`  ✓ Imports OK`);
    }
    
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
  }
});

console.log('Import fixing completed!');
