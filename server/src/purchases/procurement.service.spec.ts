import { Test, TestingModule } from '@nestjs/testing';
import { ProcurementService } from './procurement.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PRStatus, POStatus, Prisma } from '@prisma/client';

describe('ProcurementService', () => {
  let service: ProcurementService;

  const mockPrisma = {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    user: { findFirst: jest.fn() },
    supplier: { findFirst: jest.fn() },
    unitOfMeasure: { findMany: jest.fn() },
    product: {
      findMany: jest.fn(),
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
    jest.resetAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue({ id: 9 });
    mockPrisma.supplier.findFirst.mockResolvedValue({ id: 5 });
    mockPrisma.product.findMany.mockResolvedValue([
      {
        id: 1,
        hospitalId: 1,
        isActive: true,
        isDeleted: false,
        baseUomId: 2,
        costPrice: new Prisma.Decimal(100),
      },
    ]);
    mockPrisma.unitOfMeasure.findMany.mockResolvedValue([
      { id: 2, hospitalId: 1, isActive: true },
    ]);

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
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        requestNumber: 'PR-000005',
      });
      mockPrisma.purchaseRequest.create.mockResolvedValue({
        id: 10,
        requestNumber: 'PR-000006',
      });

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
      mockPrisma.purchaseRequest.create.mockResolvedValue({
        id: 10,
        requestNumber: 'PR-000001',
      });

      const result = await service.createPR({
        hospitalId: 1,
        userId: 9,
        items: [{ productId: 1, uomId: 2, quantity: 5 }],
      });

      expect(result.requestNumber).toBe('PR-000001');
    });

    it('should throw BadRequestException if products are invalid or belong to other hospital', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

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
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        status: PRStatus.APPROVED,
        items: [
          {
            productId: 1,
            uomId: 2,
            quantity: new Prisma.Decimal(5),
            baseQuantity: new Prisma.Decimal(50),
            product: {
              costPrice: new Prisma.Decimal(100),
              hospitalId: 1,
              isActive: true,
              isDeleted: false,
            },
          },
        ],
      });
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
        poNumber: 'PO-000042',
      });
      mockPrisma.purchaseOrder.create.mockResolvedValue({
        id: 20,
        poNumber: 'PO-000043',
      });
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
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue(null);

      await expect(service.createPOFromPR(1, 9, 10, 5)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================
  // createGRN
  // ============================================
  describe('createGRN input contract', () => {
    const base = { hospitalId: 1, userId: 9, poId: 20, warehouseId: 3 };
    it('requires a request identity before inventory writes', async () => {
      await expect(service.createGRN({ ...base, items: [] })).rejects.toThrow(
        BadRequestException,
      );
    });
    it('rejects an empty receiving document', async () => {
      await expect(
        service.createGRN({
          ...base,
          requestId: '00000000-0000-4000-8000-000000000001',
          items: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
    it('rejects a line without a purchase order item identity', async () => {
      await expect(
        service.createGRN({
          ...base,
          requestId: '00000000-0000-4000-8000-000000000001',
          items: [
            {
              productId: 1,
              uomId: 2,
              quantity: 5,
              batchNumber: 'B',
              expiryDate: new Date(),
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
    it('rejects zero quantities before inventory writes', async () => {
      await expect(
        service.createGRN({
          ...base,
          requestId: '00000000-0000-4000-8000-000000000001',
          items: [
            {
              purchaseOrderItemId: 4,
              productId: 1,
              uomId: 2,
              quantity: '0',
              batchNumber: 'B',
              expiryDate: new Date(),
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
