import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma/prisma.service';

// Generic mock factory for PrismaService
export const createPrismaMock = () => ({
  $transaction: jest.fn((fn) => fn(createPrismaMock())),
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
  },
  hospital: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  patient: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  encounter: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  bed: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  bedAssignment: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  room: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  ward: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  invoice: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  prescription: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  prescriptionItem: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  product: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  productStock: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  appointment: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  doctorSchedule: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  labTest: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  radiologyStudy: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  order: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  accountingEntry: {
    create: jest.fn(),
  }
});

export const mockEventEmitter = {
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  emitAsync: jest.fn(),
};

export const mockAccountingService = {
  postBillingEntry: jest.fn(),
  postPharmacyDispenseEntry: jest.fn(),
  createJournalEntry: jest.fn(),
  reverseJournalEntry: jest.fn(),
  getAccountBalance: jest.fn(),
};

export const mockInsuranceCalcService = {
  calculateCoverage: jest.fn().mockResolvedValue({
    patientShare: 100,
    insuranceShare: 0,
    details: [],
  }),
  calculateInsuranceSplit: jest.fn().mockResolvedValue({
    patientShare: 100,
    insuranceShare: 0,
    details: [],
  }),
};

export const mockFinancialYearsService = {
  getCurrentPeriod: jest.fn().mockResolvedValue({
    id: 1,
    financialYearId: 1,
    isOpen: true,
  }),
  getCurrentYear: jest.fn().mockResolvedValue({
    id: 1,
    code: '2025',
  })
};

export const mockCDSSService = {
  checkDrugInteractions: jest.fn().mockResolvedValue([]),
  checkDrugAllergy: jest.fn().mockResolvedValue([]),
  createAlerts: jest.fn().mockResolvedValue([]),
};

export const mockSoftDeleteService = {
  softDelete: jest.fn(),
  restore: jest.fn(),
  isDeleted: jest.fn(),
};

// Generic test module factory
export const createTestModule = async (providers: any[], controllers: any[] = []) => {
  return Test.createTestingModule({
    providers: [
      ...providers,
      {
        provide: PrismaService,
        useValue: createPrismaMock(),
      },
    ],
    controllers,
  }).compile();
};
