#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Final fix for incorrect service names
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

console.log(`Final fixing ${testFiles.length} test files...`);

// Final service name corrections
const finalCorrections = {
  'AuditPatientsService': 'AuditService',
  'BedsPatientsService': 'BedsService',
  'VisitsPatientsService': 'VisitsService',
  'LabOrdersPatientsService': 'LabOrdersService',
  'CashierPatientsService': 'CashierService',
  'PharmacyPatientsService': 'PharmacyService',
  'RadiologyPatientsService': 'RadiologyService',
  'BillingPatientsService': 'BillingService',
  'PatientsPatientsService': 'PatientsService',
  'EncountersPatientsService': 'EncountersService',
  'AppointmentsPatientsService': 'AppointmentsService',
};

testFiles.forEach(filePath => {
  console.log(`Final fixing: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanges = false;
    
    // Apply final corrections
    Object.entries(finalCorrections).forEach(([wrong, correct]) => {
      if (content.includes(wrong)) {
        content = content.replace(new RegExp(wrong, 'g'), correct);
        hasChanges = true;
      }
    });
    
    // Fix imports
    if (content.includes('InsuranceCalculationService') && !content.includes('import { InsuranceCalculationService }')) {
      content = content.replace(
        /import { PrismaService } from '\.\.\/prisma\/prisma\.service';/,
        "import { PrismaService } from '../prisma/prisma.service';\nimport { InsuranceCalculationService } from '../insurance/insurance-calculation.service';"
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

console.log('Final fixing completed!');
