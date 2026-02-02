import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock } from '../test-utils';
import { RadiologyController } from './radiology.controller';
import { RadiologyService } from './radiology.service';
import { PrismaService } from '../prisma/prisma.service';
import { InsuranceCalculationService } from '../insurance/insurance-calculation.service';
import { AccountingService } from '../accounting/accounting.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('RadiologyController', () => {
  let controller: RadiologyController;

  const mockRadiologyService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getWorklist: jest.fn(),
    addReport: jest.fn(),
    scheduleStudy: jest.fn(),
  };

  
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
      controllers: [RadiologyController],
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: InsuranceCalculationService, useValue: mockInsuranceCalcService },
        { provide: FinancialYearsService, useValue: mockFinancialYearsService },
        { provide: CDSSService, useValue: mockCDSSService },
        { provide: SoftDeleteService, useValue: mockSoftDeleteService },
      ],
    }).compile();

    controller = module.get<RadiologyController>(RadiologyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
