import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, StockTransactionType } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryCountService } from './inventory-count.service';

describe('InventoryCountService', () => {
  let service: InventoryCountService;
  const prisma = {
    warehouse: {
      findFirst: jest.fn(),
    },
    productStock: {
      findMany: jest.fn(),
    },
    purchaseOrder: {
      count: jest.fn(),
    },
    inventoryCount: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    stockTransaction: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T12:00:00Z'));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryCountService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: {} },
      ],
    }).compile();

    service = module.get<InventoryCountService>(InventoryCountService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects getDashboardStats when warehouseId does not belong to hospital', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);

    await expect(service.getDashboardStats(1, 999)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('reconstructs 6-month UTC stockTrend accurately using Money for IN, OUT, and signed ADJUST', async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: 5 });
    prisma.productStock.findMany.mockResolvedValue([
      {
        id: 1,
        productId: 10,
        quantity: new Prisma.Decimal('100.000'),
        minStock: new Prisma.Decimal('10.000'),
        product: {
          id: 10,
          name: 'Surgical Gloves',
          costPrice: new Prisma.Decimal('10.000'),
          minStock: new Prisma.Decimal('10.000'),
          isActive: true,
        },
      },
    ]);
    prisma.purchaseOrder.count.mockResolvedValue(2);
    prisma.inventoryCount.count.mockResolvedValue(1);
    prisma.inventoryCount.groupBy.mockResolvedValue([]);

    // Current value = 1000.000 (Nov 2026)
    // Nov 2026 delta = +250.000 (IN 300.000, OUT 50.000) -> Oct end = 750.000
    // Oct 2026 delta = -120.500 (negative ADJUST -120.500) -> Sep end = 870.500
    // Sep 2026 delta = +20.500 (positive ADJUST +20.500) -> Aug end = 850.000
    // Jun-Aug deltas = 0 -> Jun, Jul, Aug = 850.000
    prisma.stockTransaction.findMany.mockResolvedValue([
      {
        type: StockTransactionType.IN,
        quantity: new Prisma.Decimal('30'),
        baseQuantity: new Prisma.Decimal('30'),
        totalCost: new Prisma.Decimal('300.000'),
        createdAt: new Date('2026-11-05T10:00:00Z'),
      },
      {
        type: StockTransactionType.OUT,
        quantity: new Prisma.Decimal('5'),
        baseQuantity: new Prisma.Decimal('5'),
        totalCost: new Prisma.Decimal('50.000'),
        createdAt: new Date('2026-11-10T10:00:00Z'),
      },
      {
        type: StockTransactionType.ADJUST,
        quantity: new Prisma.Decimal('-12'),
        baseQuantity: new Prisma.Decimal('-12'),
        totalCost: new Prisma.Decimal('120.500'),
        createdAt: new Date('2026-10-14T10:00:00Z'),
      },
      {
        type: StockTransactionType.ADJUST,
        quantity: new Prisma.Decimal('2'),
        baseQuantity: new Prisma.Decimal('2'),
        totalCost: new Prisma.Decimal('20.500'),
        createdAt: new Date('2026-09-03T10:00:00Z'),
      },
    ]);

    const result = await service.getDashboardStats(1, 5);

    expect(result.totalValueText).toBe('1000.000');
    expect(result.stockTrend).toEqual([
      { name: '2026-06', value: 850, valueText: '850.000' },
      { name: '2026-07', value: 850, valueText: '850.000' },
      { name: '2026-08', value: 850, valueText: '850.000' },
      { name: '2026-09', value: 870.5, valueText: '870.500' },
      { name: '2026-10', value: 750, valueText: '750.000' },
      { name: '2026-11', value: 1000, valueText: '1000.000' },
    ]);
  });

  it('clamps reconstructed historical stockTrend values at 0.000 instead of negative', async () => {
    prisma.productStock.findMany.mockResolvedValue([
      {
        id: 1,
        productId: 10,
        quantity: new Prisma.Decimal('10.000'),
        minStock: new Prisma.Decimal('1.000'),
        product: {
          id: 10,
          name: 'Mask',
          costPrice: new Prisma.Decimal('5.000'),
          minStock: new Prisma.Decimal('1.000'),
          isActive: true,
        },
      },
    ]);
    prisma.purchaseOrder.count.mockResolvedValue(0);
    prisma.inventoryCount.count.mockResolvedValue(0);
    prisma.inventoryCount.groupBy.mockResolvedValue([]);
    prisma.stockTransaction.findMany.mockResolvedValue([
      {
        type: StockTransactionType.IN,
        quantity: new Prisma.Decimal('20'),
        baseQuantity: new Prisma.Decimal('20'),
        totalCost: new Prisma.Decimal('200.000'),
        createdAt: new Date('2026-11-01T10:00:00Z'),
      },
    ]);

    const result = await service.getDashboardStats(1);
    expect(result.stockTrend[5].value).toBe(50);
    expect(result.stockTrend[4]).toEqual({
      name: '2026-10',
      value: 0,
      valueText: '0.000',
    });
  });
});
