#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Find all .spec.ts files that still need fixing
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
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check if test needs fixing (missing service dependencies)
      if (content.includes('providers: [') && !content.includes('PrismaService')) {
        failingTests.push(filePath);
      }
    }
  }
}

findTestFiles(srcDir);

console.log(`Found ${failingTests.length} tests that need fixing`);

// Enhanced mock providers for complex services
const enhancedMocks = {
  // Service mocks
  PatientsService: `{
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    search: jest.fn(),
    getPatientStats: jest.fn(),
  }`,
  
  AppointmentsService: `{
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
    reschedule: jest.fn(),
  }`,
  
  EncountersService: `{
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    discharge: jest.fn(),
    admit: jest.fn(),
  }`,
  
  LabOrdersService: `{
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    addResult: jest.fn(),
  }`,
  
  BillingService: `{
    createInvoice: jest.fn(),
    calculateTotal: jest.fn(),
    addCharge: jest.fn(),
    processPayment: jest.fn(),
  }`,
  
  PharmacyService: `{
    dispense: jest.fn(),
    checkStock: jest.fn(),
    updateStock: jest.fn(),
    getMedications: jest.fn(),
  }`,
  
  // Supporting services
  PriceListsService: `{
    getPriceForService: jest.fn(),
    getPriceForProduct: jest.fn(),
    createPriceList: jest.fn(),
  }`,
  
  AccountingService: `{
    createJournalEntry: jest.fn(),
    reverseJournalEntry: jest.fn(),
    getAccountBalance: jest.fn(),
  }`,
  
  SoftDeleteService: `{
    softDelete: jest.fn(),
    restore: jest.fn(),
    isDeleted: jest.fn(),
  }`,
  
  NotificationsService: `{
    send: jest.fn(),
    create: jest.fn(),
    markAsRead: jest.fn(),
  }`,
};

// Fix each test file
failingTests.forEach(filePath => {
  console.log(`Processing: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Extract service name from describe block
    const serviceNameMatch = content.match(/describe\('(\w+)Service'/);
    const controllerNameMatch = content.match(/describe\('(\w+)Controller'/);
    
    let serviceName = serviceNameMatch ? serviceNameMatch[1] : null;
    let controllerName = controllerNameMatch ? controllerName[1] : null;
    
    // Add imports
    if (!content.includes('import { PrismaService }')) {
      content = content.replace(
        /import { createPrismaMock } from '\.\.\/test-utils';/,
        "import { createPrismaMock } from '../test-utils';\nimport { PrismaService } from '../prisma/prisma.service';"
      );
    }
    
    if (serviceName && !content.includes(`import { ${serviceName}Service }`)) {
      const servicePath = `./${serviceName.toLowerCase().replace('service', '')}.service`;
      content = content.replace(
        "import { PrismaService } from '../prisma/prisma.service';",
        `import { PrismaService } from '../prisma/prisma.service';\nimport { ${serviceName}Service } from '${servicePath}';`
      );
    }
    
    if (controllerName && !content.includes(`import { ${controllerName}Service }`)) {
      const servicePath = `./${controllerName.toLowerCase().replace('controller', '')}.service`;
      content = content.replace(
        "import { PrismaService } from '../prisma/prisma.service';",
        `import { PrismaService } from '../prisma/prisma.service';\nimport { ${controllerName}Service } from '${servicePath}';`
      );
    }
    
    // Fix service tests
    if (serviceName) {
      const mockService = enhancedMocks[serviceName] || '{}';
      
      content = content.replace(
        /providers: \[\w+Service\],/,
        `providers: [\n        ${serviceName}Service,\n        {\n          provide: PrismaService,\n          useValue: createPrismaMock(),\n        },\n      ],`
      );
      
      // Also add the service mock if it's a complex service
      if (Object.keys(enhancedMocks).includes(serviceName)) {
        content = content.replace(
          `providers: [\n        ${serviceName}Service,`,
          `providers: [\n        {\n          provide: ${serviceName}Service,\n          useValue: ${mockService},\n        },`
        );
      }
    }
    
    // Fix controller tests
    if (controllerName) {
      const mockService = enhancedMocks[controllerName.replace('Controller', 'Service')] || '{}';
      
      content = content.replace(
        /controllers: \[\w+Controller\],/,
        `controllers: [${controllerName}Controller],\n      providers: [\n        {\n          provide: ${controllerName.replace('Controller', 'Service')},\n          useValue: ${mockService},\n        },\n        {\n          provide: PrismaService,\n          useValue: createPrismaMock(),\n        },\n      ],`
      );
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Fixed`);
    
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
  }
});

console.log('Enhanced test fixing completed!');
