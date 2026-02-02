#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Fix incorrect service names quickly
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

console.log(`Fixing incorrect service names in ${testFiles.length} files...`);

// Service name corrections
const corrections = {
  'BillingPatientsService': 'BillingService',
  'CashierPatientsService': 'CashierService',
  'PharmacyPatientsService': 'PharmacyService',
  'LabPatientsService': 'LabService',
  'RadiologyPatientsService': 'RadiologyService',
};

testFiles.forEach(filePath => {
  console.log(`Fixing: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanges = false;
    
    // Apply corrections
    Object.entries(corrections).forEach(([wrong, correct]) => {
      if (content.includes(wrong)) {
        content = content.replace(new RegExp(wrong, 'g'), correct);
        hasChanges = true;
      }
    });
    
    // Fix Service placeholder issue
    if (content.includes('PatientsService,\n        {')) {
      content = content.replace('PatientsService,\n        {', 'PatientsService,\n        {');
      hasChanges = true;
    }
    
    // Fix missing imports
    if (content.includes('AccountingService') && !content.includes('import { AccountingService }')) {
      content = content.replace(
        /import { PrismaService } from '\.\.\/prisma\/prisma\.service';/,
        "import { PrismaService } from '../prisma/prisma.service';\nimport { AccountingService } from '../accounting/accounting.service';"
      );
      hasChanges = true;
    }
    
    if (hasChanges) {
      fs.writeFileSync(filePath, content);
      console.log(`  ✓ Fixed`);
    } else {
      console.log(`  ✓ OK`);
    }
    
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
  }
});

console.log('Service name fixing completed!');
