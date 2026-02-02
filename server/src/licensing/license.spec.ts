
import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock } from '../test-utils';
import { PrismaService } from '../prisma/prisma.service';
import { InsuranceCalculationService } from '../insurance/insurance-calculation.service';
import { AccountingService } from '../accounting/accounting.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LicenseService } from './license.service';
import { ConfigService } from '@nestjs/config';

describe('LicenseService', () => {
  let service: LicenseService;

  
  // Comprehensive mock setup
  const mockPrismaService = ({
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
  });
  const mockEventEmitter = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
  const mockAccountingService = {
    postBillingEntry: jest.fn(),
    postPharmacyDispenseEntry: jest.fn(),
    createJournalEntry: jest.fn(),
    reverseJournalEntry: jest.fn(),
    getAccountBalance: jest.fn(),
  };
  const mockInsuranceCalcService = {
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
  };
  const mockFinancialYearsService = {
    getCurrentPeriod: jest.fn().mockResolvedValue({
      id: 1,
      financialYearId: 1,
      isOpen: true,
    }),
  };
  const mockCDSSService = {
    checkDrugInteractions: jest.fn().mockResolvedValue([]),
    checkDrugAllergy: jest.fn().mockResolvedValue([]),
    createAlerts: jest.fn().mockResolvedValue([]),
  };
  const mockSoftDeleteService = {
    softDelete: jest.fn(),
    restore: jest.fn(),
    isDeleted: jest.fn(),
  };


  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicensePatientsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: InsuranceCalculationService, useValue: mockInsuranceCalcService },
        { provide: FinancialYearsService, useValue: mockFinancialYearsService },
        { provide: CDSSService, useValue: mockCDSSService },
        { provide: SoftDeleteService, useValue: mockSoftDeleteService },
      ],
    }).compile();

    service = module.get<LicenseService>(LicenseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isModuleEnabled', () => {
    it('should return true if module is present in modules array', () => {
      // @ts-ignore
      service._details = {
        modules: ['LAB', 'PHARMACY'],
        plan: 'BASIC', // Basic usually has nothing, but modules override
      };

      expect(service.isModuleEnabled('LAB')).toBe(true);
      expect(service.isModuleEnabled('PHARMACY')).toBe(true);
      expect(service.isModuleEnabled('RADIOLOGY')).toBe(false);
    });

    it('should fallback to Plan if modules array is missing (Legacy)', () => {
      // @ts-ignore
      service._details = {
        plan: 'ENTERPRISE',
      };
      expect(service.isModuleEnabled('HR')).toBe(true);

      // @ts-ignore
      service._details = {
        plan: 'PRO',
      };
      // PRO has no HR
      expect(service.isModuleEnabled('HR')).toBe(false); 
      // PRO has LAB
      expect(service.isModuleEnabled('LAB')).toBe(true);

      // @ts-ignore
      service._details = {
        plan: 'BASIC',
      };
      // BASIC has no LAB
      expect(service.isModuleEnabled('LAB')).toBe(false);
    });

    it('should prioritize modules array over plan if both exist', () => {
       // @ts-ignore
       service._details = {
        plan: 'ENTERPRISE', // Enterprise has everything
        modules: ['LAB'], // But modules array restricts it to ONLY Lab? 
                          // Logic says: if modules array exists, use it.
      };

      // So even if plan is Enterprise, if modules list is provided, strictly follow it?
      // My implementation: 
      // if (modules) return modules.includes(feature);
      // So yes, it restricts.
      
      expect(service.isModuleEnabled('LAB')).toBe(true);
      expect(service.isModuleEnabled('HR')).toBe(false); // Enterprise usually has HR, but modules array didn't include it
    });
  });
});
