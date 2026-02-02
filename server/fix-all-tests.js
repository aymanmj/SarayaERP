#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Enhanced script to fix all remaining tests
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

console.log(`Found ${failingTests.length} test files to enhance`);

// Enhanced comprehensive mock templates
const comprehensiveMocks = {
  // Core services
  PrismaService: `{
    $transaction: jest.fn((fn) => fn(mockPrismaService)),
    user: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    patient: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    encounter: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    hospital: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    invoice: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    payment: { findMany: jest.fn(), create: jest.fn() },
    prescription: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    product: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    // Add all other models as needed
  }`,
  
  // Event emitter
  EventEmitter2: `{
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  }`,
  
  // Accounting
  AccountingService: `{
    postBillingEntry: jest.fn(),
    postPharmacyDispenseEntry: jest.fn(),
    createJournalEntry: jest.fn(),
    reverseJournalEntry: jest.fn(),
    getAccountBalance: jest.fn(),
  }`,
  
  // Insurance
  InsuranceCalculationService: `{
    calculateCoverage: jest.fn().mockResolvedValue({
      patientShare: { toNumber: () => 100 },
      insuranceShare: { toNumber: () => 0 },
      details: [],
    }),
    calculateInsuranceSplit: jest.fn().mockResolvedValue({
      patientShare: { toNumber: () => 100 },
      insuranceShare: { toNumber: () => 0 },
      details: [],
    }),
  }`,
  
  // Financial Years
  FinancialYearsService: `{
    getCurrentPeriod: jest.fn().mockResolvedValue({
      id: 1,
      financialYearId: 1,
      isOpen: true,
    }),
  }`,
  
  // CDSS
  CDSSService: `{
    checkDrugInteractions: jest.fn().mockResolvedValue([]),
    checkDrugAllergy: jest.fn().mockResolvedValue([]),
    createAlerts: jest.fn().mockResolvedValue([]),
  }`,
  
  // Soft Delete
  SoftDeleteService: `{
    softDelete: jest.fn(),
    restore: jest.fn(),
    isDeleted: jest.fn(),
  }`,
};

// Fix each test file
failingTests.forEach(filePath => {
  console.log(`Enhancing: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Skip if already enhanced
    if (content.includes('mockPrismaService')) {
      console.log(`  ✓ Already enhanced`);
      return;
    }
    
    // Add comprehensive imports
    if (!content.includes('EventEmitter2')) {
      content = content.replace(
        /import { PrismaService } from '\.\.\/prisma\/prisma\.service';/,
        "import { PrismaService } from '../prisma/prisma.service';\nimport { EventEmitter2 } from '@nestjs/event-emitter';"
      );
    }
    
    // Add comprehensive mock setup
    const mockSetup = `
  // Comprehensive mock setup
  const mockPrismaService = ${comprehensiveMocks.PrismaService};
  const mockEventEmitter = ${comprehensiveMocks.EventEmitter2};
  const mockAccountingService = ${comprehensiveMocks.AccountingService};
  const mockInsuranceCalcService = ${comprehensiveMocks.InsuranceCalculationService};
  const mockFinancialYearsService = ${comprehensiveMocks.FinancialYearsService};
  const mockCDSSService = ${comprehensiveMocks.CDSSService};
  const mockSoftDeleteService = ${comprehensiveMocks.SoftDeleteService};
`;
    
    // Insert mock setup before beforeEach
    content = content.replace(
      /beforeEach\(async \(\) => {/,
      mockSetup + '\n\n  beforeEach(async () => {'
    );
    
    // Update providers array with all mocks
    const enhancedProviders = `providers: [
        ${content.match(/describe\('(\w+)Service'/) ? content.match(/describe\('(\w+)Service'/)[1] + 'Service' : 'Service'},
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: InsuranceCalculationService, useValue: mockInsuranceCalcService },
        { provide: FinancialYearsService, useValue: mockFinancialYearsService },
        { provide: CDSSService, useValue: mockCDSSService },
        { provide: SoftDeleteService, useValue: mockSoftDeleteService },
      ],`;
    
    content = content.replace(
      /providers: \[[^\]]+\],/s,
      enhancedProviders
    );
    
    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Enhanced`);
    
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
  }
});

console.log('Comprehensive test enhancement completed!');
