
import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock } from '../test-utils';
import { PrismaService } from '../prisma/prisma.service';
import { InsuranceCalculationService } from '../insurance/insurance-calculation.service';
import { AccountingService } from '../accounting/accounting.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { Sensitive } from './audit.decorator';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let auditService: AuditService;
  let reflector: Reflector;

  
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
    const auditServiceMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
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

    interceptor = module.get<AuditInterceptor>(AuditInterceptor);
    auditService = module.get<AuditService>(AuditService);
    reflector = module.get<Reflector>(Reflector);
  });

  const createMockContext = (
    method: string,
    path: string,
    handler: Function,
    classRef: any,
  ) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          originalUrl: path,
          user: { sub: 1, hospitalId: 1 },
          ip: '127.0.0.1',
          headers: {},
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
      getHandler: () => handler,
      getClass: () => classRef,
    } as unknown as ExecutionContext;
  };

  const next: CallHandler = {
    handle: () => of('response'),
  };

  it('should log mutation requests (POST)', (done) => {
    const context = createMockContext('POST', '/test', () => {}, {});
    
    interceptor.intercept(context, next).subscribe(() => {
      expect(auditService.log).toHaveBeenCalled();
      done();
    });
  });

  it('should log sensitive GET requests decorated with @Sensitive', (done) => {
    class TestClass {
      @Sensitive('VIEW_SENSITIVE')
      testMethod() {}
    }
    const handler = new TestClass().testMethod;
    
    const context = createMockContext('GET', '/sensitive', handler, TestClass);

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VIEW_SENSITIVE',
        }),
      );
      done();
    });
  });

  it('should NOT log normal GET requests without decoration', (done) => {
    const context = createMockContext('GET', '/normal', () => {}, {});

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditService.log).not.toHaveBeenCalled();
      done();
    });
  });
});
