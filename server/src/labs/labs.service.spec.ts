// src/labs/labs.service.spec.ts
// Unit tests for Lab Service

import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock } from '../test-utils';
import { LabService } from './labs.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PriceListsService } from '../price-lists/price-lists.service';
import { AccountingService } from '../accounting/accounting.service';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('LabService', () => {
  let service: LabService;

  // Mock data
  const mockHospitalId = 1;
  const mockEncounterId = 100;
  const mockDoctorId = 1;

  const mockLabTests = [
    {
      id: 1,
      hospitalId: mockHospitalId,
      code: 'CBC',
      name: 'Complete Blood Count',
      arabicName: 'تعداد الدم الكامل',
      category: 'Hematology',
      isActive: true,
      serviceItem: { id: 1, defaultPrice: new Decimal(25) },
    },
    {
      id: 2,
      hospitalId: mockHospitalId,
      code: 'RBS',
      name: 'Random Blood Sugar',
      arabicName: 'سكر الدم العشوائي',
      category: 'Chemistry',
      isActive: true,
      serviceItem: { id: 2, defaultPrice: new Decimal(15) },
    },
  ];

  const mockLabOrder = {
    id: 1,
    orderId: 1,
    testId: 1,
    resultStatus: 'PENDING',
    test: mockLabTests[0],
    order: {
      id: 1,
      hospitalId: mockHospitalId,
      encounterId: mockEncounterId,
      encounter: {
        id: mockEncounterId,
        patient: { id: 1, fullName: 'أحمد محمد', mrn: 'MRN-001' },
      },
    },
  };

  const mockPrismaService = ({
    labTest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    labOrder: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    order: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    encounter: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    encounterCharge: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      updateMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ id: 1, totalAmount: 25, invoiceId: 100 }),
    },
    invoice: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 1, fullName: 'Doctor' }),
    },
    $transaction: jest.fn((fn) => fn(mockPrismaService)),
  });

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockPriceListsService = {
    getServicePrice: jest.fn().mockResolvedValue(25),
  };

  const mockAccountingService = {
    postBillingEntry: jest.fn().mockResolvedValue({ id: 1 }),
    validateDateInOpenPeriod: jest.fn().mockResolvedValue({
      financialYear: { id: 1 },
      period: { id: 1 },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: PriceListsService, useValue: mockPriceListsService },
        { provide: AccountingService, useValue: mockAccountingService },
      ],
    }).compile();

    service = module.get<LabService>(LabService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCatalog', () => {
    it('should return list of lab tests', async () => {
      mockPrismaService.labTest.findMany.mockResolvedValue(mockLabTests);

      const result = await service.getCatalog(mockHospitalId);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should only return active tests', async () => {
      mockPrismaService.labTest.findMany.mockResolvedValue(mockLabTests);

      await service.getCatalog(mockHospitalId);

      expect(mockPrismaService.labTest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hospitalId: mockHospitalId,
            isActive: true,
          }),
        }),
      );
    });
  });

  describe('getWorklist', () => {
    it('should return pending lab orders', async () => {
      mockPrismaService.labOrder.findMany.mockResolvedValue([mockLabOrder]);

      const result = await service.getWorklist(mockHospitalId);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by pending status', async () => {
      mockPrismaService.labOrder.findMany.mockResolvedValue([]);

      await service.getWorklist(mockHospitalId);

      expect(mockPrismaService.labOrder.findMany).toHaveBeenCalled();
    });
  });

  describe('listOrdersForEncounter', () => {
    it('should return lab orders for specific encounter', async () => {
      mockPrismaService.labOrder.findMany.mockResolvedValue([mockLabOrder]);

      const result = await service.listOrdersForEncounter(mockEncounterId, mockHospitalId);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createOrdersForEncounter', () => {
    it('should create lab orders and charges', async () => {
      mockPrismaService.encounter.findUnique.mockResolvedValue({
        id: mockEncounterId,
        hospitalId: mockHospitalId,
        patientId: 1,
        patient: { id: 1, fullName: 'Test Patient', insurancePolicy: null },
      });
      mockPrismaService.labTest.findMany.mockResolvedValue(mockLabTests);
      mockPrismaService.order.create.mockResolvedValue({
        id: 1,
        hospitalId: mockHospitalId,
        encounterId: mockEncounterId,
      });
      mockPrismaService.labOrder.create.mockResolvedValue(mockLabOrder);
      mockPrismaService.encounterCharge.create.mockResolvedValue({ id: 1 });

      const result = await service.createOrdersForEncounter({
        encounterId: mockEncounterId,
        hospitalId: mockHospitalId,
        doctorId: mockDoctorId,
        testIds: [1, 2],
        notes: 'Test orders',
      });

      expect(result).toBeDefined();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('lab.order_created', expect.any(Object));
    });

    it('should throw error if encounter not found', async () => {
      mockPrismaService.encounter.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrdersForEncounter({
          encounterId: 999,
          hospitalId: mockHospitalId,
          doctorId: mockDoctorId,
          testIds: [1],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeOrder', () => {
    it('should update lab order with results', async () => {
      mockPrismaService.labOrder.findUnique.mockResolvedValue({
        ...mockLabOrder,
        order: { hospitalId: mockHospitalId, encounterId: mockEncounterId },
      });
      mockPrismaService.encounter.findUnique.mockResolvedValue({ patientId: 1 });
      
      mockPrismaService.labOrder.update.mockResolvedValue({
        ...mockLabOrder,
        resultStatus: 'COMPLETED',
        resultValue: '5.5',
      });

      const result = await service.completeOrder({
        hospitalId: mockHospitalId,
        labOrderId: 1,
        performedById: mockDoctorId,
        resultValue: '5.5',
        resultUnit: 'mmol/L',
        referenceRange: '3.9-6.1',
      });

      expect(result).toBeDefined();
      expect(result.resultStatus).toBe('COMPLETED');
    });

    it('should throw error if lab order not found', async () => {
      mockPrismaService.labOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.completeOrder({
          hospitalId: mockHospitalId,
          labOrderId: 999,
          performedById: mockDoctorId,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCumulativeReport', () => {
    it('should return cumulative lab report for encounter', async () => {
      mockPrismaService.encounter.findUnique.mockResolvedValue({
        id: mockEncounterId,
        patient: { id: 1, fullName: 'Test Patient' },
        doctor: { fullName: 'Dr. Test' },
      });
      mockPrismaService.labOrder.findMany.mockResolvedValue([mockLabOrder]);

      const result = await service.getCumulativeReport(mockHospitalId, mockEncounterId);

      expect(result).toBeDefined();
      expect(result.encounter).toBeDefined();
      expect(result.labOrders).toBeDefined();
    });

    it('should throw error if encounter not found', async () => {
      mockPrismaService.encounter.findUnique.mockResolvedValue(null);

      await expect(
        service.getCumulativeReport(mockHospitalId, 999),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
