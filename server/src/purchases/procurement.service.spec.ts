import { Test, TestingModule } from '@nestjs/testing';
import { ProcurementService } from './procurement.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PRStatus, POStatus, GRNStatus, OrgType } from '@prisma/client';

describe('ProcurementService', () => {
  let service: ProcurementService;

  const mockPrisma = {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    product: {
      count: jest.fn(),
      update: jest.fn(),
    },
    productUOM: {
      findMany: jest.fn(),
    },
    purchaseRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    purchaseOrder: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    purchaseOrderItem: {
      update: jest.fn(),
    },
    goodsReceipt: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    warehouse: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    accountingEntry: {
      create: jest.fn(),
    },
    productStock: {
      upsert: jest.fn(),
    },
    stockTransaction: {
      create: jest.fn(),
    },
  };

  const mockAccounting = {
    getOpenPeriodForDate: jest.fn(),
    getSystemAccountOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountingService, useValue: mockAccounting },
      ],
    }).compile();

    service = module.get<ProcurementService>(ProcurementService);
    jest.clearAllMocks();

    // Default mock for transaction just runs the callback immediately with mockPrisma
    mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // createPR
  // ============================================
  describe('createPR', () => {
    it('should successfully create a PR and generate sequential requestNumber', async () => {
      mockPrisma.product.count.mockResolvedValue(1);
      mockPrisma.productUOM.findMany.mockResolvedValue([
        { productId: 1, uomId: 2, conversionRate: 10 },
      ]);
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({ requestNumber: 'PR-000005' });
      mockPrisma.purchaseRequest.create.mockResolvedValue({ id: 10, requestNumber: 'PR-000006' });

      const result = await service.createPR({
        hospitalId: 1,
        userId: 9,
        items: [{ productId: 1, uomId: 2, quantity: 5 }],
      });

      expect(mockPrisma.purchaseRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hospitalId: 1,
            requestNumber: 'PR-000006',
            status: PRStatus.PENDING,
          }),
        }),
      );
      expect(result.requestNumber).toBe('PR-000006');
    });

    it('should start at PR-000001 if no prior PR exists', async () => {
      mockPrisma.product.count.mockResolvedValue(1);
      mockPrisma.productUOM.findMany.mockResolvedValue([]);
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue(null);
      mockPrisma.purchaseRequest.create.mockResolvedValue({ id: 10, requestNumber: 'PR-000001' });

      const result = await service.createPR({
        hospitalId: 1,
        userId: 9,
        items: [{ productId: 1, uomId: 2, quantity: 5 }],
      });

      expect(result.requestNumber).toBe('PR-000001');
    });

    it('should throw BadRequestException if products are invalid or belong to other hospital', async () => {
      mockPrisma.product.count.mockResolvedValue(0);

      await expect(
        service.createPR({
          hospitalId: 1,
          userId: 9,
          items: [{ productId: 1, uomId: 2, quantity: 5 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // createPOFromPR
  // ============================================
  describe('createPOFromPR', () => {
    it('should convert PR to PO with sequential PO number', async () => {
      mockPrisma.purchaseRequest.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        status: PRStatus.APPROVED,
        items: [
          {
            productId: 1,
            uomId: 2,
            quantity: 5,
            baseQuantity: 50,
            product: { costPrice: 100 },
          },
        ],
      });
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ poNumber: 'PO-000042' });
      mockPrisma.purchaseOrder.create.mockResolvedValue({ id: 20, poNumber: 'PO-000043' });
      mockPrisma.purchaseRequest.update.mockResolvedValue({});

      const result = await service.createPOFromPR(1, 9, 10, 5);

      expect(mockPrisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hospitalId: 1,
            poNumber: 'PO-000043',
            supplierId: 5,
          }),
        }),
      );
      expect(result.poNumber).toBe('PO-000043');
    });

    it('should throw NotFoundException if PR belongs to a different hospital', async () => {
      mockPrisma.purchaseRequest.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 2, // different
      });

      await expect(service.createPOFromPR(1, 9, 10, 5)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================
  // createGRN
  // ============================================
  describe('createGRN', () => {
    it('should successfully create GRN and generate accounting entries when all tenant checks pass', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 20,
        hospitalId: 1,
        items: [{ productId: 1, unitPrice: 100 }],
      });
      // Warehouse verification succeeds
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: 3, hospitalId: 1 });
      // Product verification succeeds
      mockPrisma.product.count.mockResolvedValue(1);
      mockPrisma.productUOM.findMany.mockResolvedValue([
        { productId: 1, uomId: 2, conversionRate: 1 },
      ]);
      mockPrisma.goodsReceipt.findFirst.mockResolvedValue({ grnNumber: 'GRN-000008' });
      mockPrisma.goodsReceipt.create.mockResolvedValue({ id: 30, grnNumber: 'GRN-000009' });

      mockAccounting.getOpenPeriodForDate.mockResolvedValue({
        fy: { id: 2 },
        period: { id: 4 },
      });
      mockAccounting.getSystemAccountOrThrow.mockResolvedValue({ id: 99 });
      mockPrisma.productStock.upsert.mockResolvedValue({});
      mockPrisma.stockTransaction.create.mockResolvedValue({});
      mockPrisma.accountingEntry.create.mockResolvedValue({});

      const result = await service.createGRN({
        hospitalId: 1,
        userId: 9,
        poId: 20,
        warehouseId: 3,
        items: [
          {
            productId: 1,
            uomId: 2,
            quantity: 5,
            batchNumber: 'B123',
            expiryDate: new Date(),
          },
        ],
      });

      expect(mockPrisma.goodsReceipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hospitalId: 1,
            grnNumber: 'GRN-000009',
            purchaseOrderId: 20,
            warehouseId: 3,
          }),
        }),
      );
      expect(result.grnNumber).toBe('GRN-000009');
    });

    it('should throw NotFoundException if PO hospitalId does not match data hospitalId', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 20,
        hospitalId: 2, // different hospital
      });

      await expect(
        service.createGRN({
          hospitalId: 1,
          userId: 9,
          poId: 20,
          warehouseId: 3,
          items: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if warehouse belongs to a different hospital', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 20,
        hospitalId: 1,
      });
      // Warehouse verification returns null or different hospital
      mockPrisma.warehouse.findFirst.mockResolvedValue(null);

      await expect(
        service.createGRN({
          hospitalId: 1,
          userId: 9,
          poId: 20,
          warehouseId: 3,
          items: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if products do not belong to the hospital', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 20,
        hospitalId: 1,
      });
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: 3, hospitalId: 1 });
      // Product count is less than items length
      mockPrisma.product.count.mockResolvedValue(0);

      await expect(
        service.createGRN({
          hospitalId: 1,
          userId: 9,
          poId: 20,
          warehouseId: 3,
          items: [{ productId: 1, uomId: 2, quantity: 5, batchNumber: 'B', expiryDate: new Date() }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
