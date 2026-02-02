#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Super fast script to fix remaining tests quickly
const srcDir = path.join(__dirname, 'src');
const failingTests = [];

function findTestFiles(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findTestFiles(filePath);
    } else if (file.endsWith('.spec.ts')) {
      failingTests.push(filePath);
    }
  }
}

findTestFiles(srcDir);

console.log(`Quick fixing ${failingTests.length} test files...`);

// Quick fix patterns for common issues
const quickFixes = {
  // Fix missing imports
  addMissingImports: (content) => {
    const neededImports = [
      'PriceListsService',
      'NotificationsService',
      'LicensingService',
      'DashboardService',
      'ReportsService',
      'AnalyticsService',
      'IntegrationService',
      'PatientPortalService',
    ];
    
    let hasChanges = false;
    neededImports.forEach(service => {
      if (content.includes(service) && !content.includes(`import { ${service} }`)) {
        const importPath = service.toLowerCase().replace('service', '');
        content = content.replace(
          /import { CDSSService } from '\.\.\/cdss\/cdss\.service';/,
          `import { CDSSService } from '../cdss/cdss.service';\nimport { ${service} } from '../${importPath}/${importPath}.service';`
        );
        hasChanges = true;
      }
    });
    
    return hasChanges ? content : null;
  },
  
  // Fix missing providers
  addMissingProviders: (content) => {
    const services = [
      'PriceListsService',
      'NotificationsService', 
      'LicensingService',
      'DashboardService',
      'ReportsService',
      'AnalyticsService',
      'IntegrationService',
      'PatientPortalService',
    ];
    
    let hasChanges = false;
    services.forEach(service => {
      if (content.includes(service) && !content.includes(`{ provide: ${service}`)) {
        const mockService = `{
          getPriceForService: jest.fn(),
          getPriceForProduct: jest.fn(),
          createPriceList: jest.fn(),
        }`;
        
        content = content.replace(
          /{ provide: CDSSService, useValue: mockCDSSService },/,
          `{ provide: CDSSService, useValue: mockCDSSService },\n        { provide: ${service}, useValue: ${mockService} },`
        );
        hasChanges = true;
      }
    });
    
    return hasChanges ? content : null;
  },
  
  // Fix Service placeholder
  fixServicePlaceholder: (content) => {
    if (content.includes('Service,\n        {')) {
      content = content.replace(
        /Service,\n        {/,
        'PatientsService,\n        {'
      );
      return content;
    }
    return null;
  },
  
  // Fix missing Prisma models
  addMissingPrismaModels: (content) => {
    const missingModels = [
      'priceList',
      'notification',
      'license',
      'report',
      'analytics',
      'integration',
      'patientPortal',
      'labOrder',
      'labSpecimen', 
      'labResult',
      'radiologyStudy',
      'radiologyReport',
      'dispenseRecord',
      'stockTransaction',
    ];
    
    let hasChanges = false;
    const prismaMockMatch = content.match(/const mockPrismaService = ({[\s\S]*?});/);
    
    if (prismaMockMatch) {
      let mockContent = prismaMockMatch[1];
      
      missingModels.forEach(model => {
        if (!mockContent.includes(`${model}:`)) {
          mockContent = mockContent.replace(
            /};$/,
            `  ${model}: {\n    findUnique: jest.fn(),\n    findMany: jest.fn(),\n    create: jest.fn(),\n    update: jest.fn(),\n  },\n};`
          );
          hasChanges = true;
        }
      });
      
      if (hasChanges) {
        content = content.replace(
          prismaMockMatch[0],
          `const mockPrismaService = (${mockContent});`
        );
      }
    }
    
    return hasChanges ? content : null;
  }
};

// Apply quick fixes
failingTests.forEach(filePath => {
  console.log(`Quick fixing: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanges = false;
    
    // Apply each quick fix
    Object.values(quickFixes).forEach(fix => {
      const result = fix(content);
      if (result) {
        content = result;
        hasChanges = true;
      }
    });
    
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

console.log('Quick fixing completed!');
