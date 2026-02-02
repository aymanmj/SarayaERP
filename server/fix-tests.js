#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Find all .spec.ts files in src directory
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

console.log(`Found ${testFiles.length} test files`);

// Template for fixing test files
const testTemplate = `import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock } from '../test-utils';`;

const serviceTestTemplate = `
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SERVICE_NAME,
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
      ],
    }).compile();

    service = module.get<SERVICE_NAME>(SERVICE_NAME);
  });`;

const controllerTestTemplate = `
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CONTROLLER_NAME],
      providers: [
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
      ],
    }).compile();

    controller = module.get<CONTROLLER_NAME>(CONTROLLER_NAME);
  });`;

// Fix each test file
testFiles.forEach(filePath => {
  console.log(`Processing: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if already fixed
    if (content.includes('createPrismaMock')) {
      console.log(`  ✓ Already fixed`);
      return;
    }
    
    // Add imports
    if (!content.includes('createPrismaMock')) {
      content = content.replace(
        /import { Test, TestingModule } from '@nestjs\/testing';/,
        testTemplate
      );
    }
    
    // Add PrismaService import if needed
    if (content.includes('PrismaService') && !content.includes("import { PrismaService }")) {
      content = content.replace(
        /import { createPrismaMock } from '\.\.\/test-utils';/,
        "import { createPrismaMock } from '../test-utils';\nimport { PrismaService } from '../prisma/prisma.service';"
      );
    }
    
    // Fix basic service tests
    if (content.includes('providers: [SERVICE_NAME],')) {
      const serviceName = content.match(/describe\('(\w+)Service'/);
      if (serviceName) {
        content = content.replace(
          /providers: \[SERVICE_NAME\],/,
          `providers: [\n        ${serviceName[1]}Service,\n        {\n          provide: PrismaService,\n          useValue: createPrismaMock(),\n        },\n      ],`
        );
      }
    }
    
    // Fix basic controller tests
    if (content.includes('controllers: [CONTROLLER_NAME],')) {
      const controllerName = content.match(/describe\('(\w+)Controller'/);
      if (controllerName) {
        content = content.replace(
          /controllers: \[CONTROLLER_NAME\],/,
          `controllers: [${controllerName[1]}Controller],\n      providers: [\n        {\n          provide: PrismaService,\n          useValue: createPrismaMock(),\n        },\n      ],`
        );
      }
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Fixed`);
    
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
  }
});

console.log('Test fixing completed!');
