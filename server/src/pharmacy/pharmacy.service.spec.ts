// src/pharmacy/pharmacy.service.spec.ts
// Unit tests for Pharmacy Service

import { Test, TestingModule } from '@nestjs/testing';
import { PharmacyService } from './pharmacy.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountingService } from '../accounting/accounting.service';
import { CDSSService } from '../cdss/cdss.service';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('PharmacyService', () => {
  let service: PharmacyService;

  // Mock data
  const mockHospitalId = 1;
  const mockEncounterId = 100;
  const mockUserId = 1;

  const mockPrescription = {
    id: 1,
    hospitalId: mockHospitalId,
    encounterId: mockEncounterId,
    patientId: 1,
    doctorId: 1,
    status: 'ACTIVE',
    items: [
      {
        id: 1,
        prescriptionId: 1,
        productId: 10,
        dose: '500mg',
        route: 'ORAL',
        frequency: 'TID',
        durationDays: 7,
        quantity: 21,
        product: { id: 10, name: 'Amoxicillin', code: 'AMX500', sellPrice: new Decimal(1.5) },
      },
    ],
    patient: { id: 1, fullName: 'أحمد محمد', mrn: 'MRN-001' },
    doctor: { id: 1, fullName: 'د. سالم' },
    encounter: { id: mockEncounterId },
  };

  const mockProductStock = {
    id: 1,
    warehouseId: 1,
    productId: 10,
    quantity: new Decimal(100),
    batchNumber: 'BATCH001',
    expiryDate: new Date('2027-12-31'),
  };

  const mockDrugCatalog = [
    { id: 10, name: 'Amoxicillin 500mg', code: 'AMX500', sellPrice: new Decimal(1.5) },
    { id: 11, name: 'Paracetamol 500mg', code: 'PCM500', sellPrice: new Decimal(0.5) },
  ];

  const mockPrismaService = {
    prescription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    prescriptionItem: {
      findMany: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    productStock: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    warehouse: {
      findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Pharmacy' }),
    },
    dispenseRecord: {
      create: jest.fn(),
    },
    stockTransaction: {
      create: jest.fn(),
    },
    encounterCharge: {
      create: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockPrismaService)),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockAccountingService = {
    postPharmacyDispenseEntry: jest.fn().mockResolvedValue({ id: 1 }),
  };

  const mockCDSSService = {
    checkDrugInteractions: jest.fn().mockResolvedValue([]),
    checkDrugAllergy: jest.fn().mockResolvedValue([]),
    createAlerts: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PharmacyService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: CDSSService, useValue: mockCDSSService },
      ],
    }).compile();

    service = module.get<PharmacyService>(PharmacyService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDrugCatalog', () => {
    it('should return list of drugs', async () => {
      mockPrismaService.product.findMany.mockResolvedValue(mockDrugCatalog);

      const result = await service.getDrugCatalog(mockHospitalId);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(mockPrismaService.product.findMany).toHaveBeenCalled();
    });

    it('should filter drugs by search query', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([mockDrugCatalog[0]]);

      const result = await service.getDrugCatalog(mockHospitalId, 'Amox');

      expect(result.length).toBe(1);
      expect(result[0].name).toContain('Amoxicillin');
    });
  });

  describe('getWorklist', () => {
    it('should return prescriptions awaiting dispensing', async () => {
      mockPrismaService.prescription.findMany.mockResolvedValue([mockPrescription]);

      const result = await service.getWorklist(mockHospitalId);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getEncounterPrescriptions', () => {
    it('should return prescriptions for specific encounter', async () => {
      mockPrismaService.prescription.findMany.mockResolvedValue([mockPrescription]);

      const result = await service.getEncounterPrescriptions(mockHospitalId, mockEncounterId);

      expect(result).toBeDefined();
    });
  });

  describe('createPrescriptionForEncounter', () => {
    it('should create a new prescription with CDSS safety check', async () => {
      mockPrismaService.prescription.create.mockResolvedValue(mockPrescription);

      const result = await service.createPrescriptionForEncounter({
        hospitalId: mockHospitalId,
        encounterId: mockEncounterId,
        doctorId: mockUserId,
        notes: 'Test prescription',
        items: [
          {
            drugItemId: 10,
            dose: '500mg',
            route: 'ORAL',
            frequency: 'TID',
            durationDays: 7,
            quantity: 21,
          },
        ],
      });

      expect(result).toBeDefined();
      expect(mockCDSSService.checkDrugInteractions).toHaveBeenCalled();
    });
  });

  describe('getDrugStockList', () => {
    it('should return stock levels for all drugs', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([
        { ...mockDrugCatalog[0], productStocks: [mockProductStock] },
      ]);

      const result = await service.getDrugStockList(mockHospitalId);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe.skip('getPharmacyWarehouseId (private)', () => {
    it('should return pharmacy warehouse ID', async () => {
      mockPrismaService.warehouse.findFirst.mockResolvedValue({ id: 1, name: 'Pharmacy' });

      // @ts-ignore
      const result = await (service as any).getPharmacyWarehouseId(mockHospitalId);

      expect(result).toBe(1);
    });

    it('should throw NotFoundException if warehouse not found', async () => {
      mockPrismaService.warehouse.findFirst.mockResolvedValue(null);

      // @ts-ignore
      await expect((service as any).getPharmacyWarehouseId(mockHospitalId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createManualStockTransaction', () => {
    it('should create stock adjustment transaction', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(mockDrugCatalog[0]);
      mockPrismaService.productStock.findFirst.mockResolvedValue(mockProductStock);
      mockPrismaService.productStock.update.mockResolvedValue({ ...mockProductStock, quantity: new Decimal(110) });
      mockPrismaService.stockTransaction.create.mockResolvedValue({ id: 1 });

      const result = await service.createManualStockTransaction({
        hospitalId: mockHospitalId,
        userId: mockUserId,
        drugItemId: 10,
        type: 'IN',
        quantity: 10,
        unitCost: 1.0,
        batchNumber: 'BATCH002',
      });

      expect(result).toBeDefined();
    });
  });
});
