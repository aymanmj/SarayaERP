import {
  AssetStatus,
  MaintenanceType,
  Prisma,
  TicketStatus,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssetsService } from './assets.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccountingService } from '../accounting/accounting.service';

describe('AssetsService Money depreciation & tenant isolation (FLOW04 & SEC03)', () => {
  it('validates registerAsset inputs and computes straight-line depreciation with Money, FOR UPDATE, and postingKey', async () => {
    const createEntryMock = jest.fn().mockResolvedValue({ id: 7001 });
    const createDepMock = jest.fn().mockResolvedValue({ id: 8001 });
    const updateAssetMock = jest.fn().mockResolvedValue({ id: 10 });
    const queryRawMock = jest.fn().mockResolvedValue([{ id: 10 }]);

    const assetRecord = {
      id: 10,
      hospitalId: 1,
      name: 'جهاز أشعة رقمي',
      tagNumber: 'AST-010',
      purchaseCost: new Prisma.Decimal('10000.000'),
      salvageValue: new Prisma.Decimal('1000.000'),
      currentValue: new Prisma.Decimal('10000.000'),
      usefulLifeYears: 5,
      status: AssetStatus.IN_SERVICE,
    };

    const prismaMock = {
      $transaction: jest.fn(
        async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
          cb(prismaMock),
      ),
      $queryRaw: queryRawMock,
      account: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 530, code: '530100' })
          .mockResolvedValueOnce({ id: 160, code: '160100' }),
      },
      asset: {
        fields: { salvageValue: 'salvageValue' },
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([assetRecord]),
        findFirst: jest.fn().mockResolvedValue(assetRecord),
        create: jest.fn().mockResolvedValue(assetRecord),
        update: updateAssetMock,
      },
      assetDepreciation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: createDepMock,
      },
      accountingEntry: {
        create: createEntryMock,
      },
    };
    const accountingMock = {
      getOpenPeriodForDate: jest.fn().mockResolvedValue({
        fy: { id: 2026 },
        period: { id: 6 },
      }),
    };

    const service = new AssetsService(
      prismaMock as unknown as PrismaService,
      accountingMock as unknown as AccountingService,
    );

    await expect(
      service.registerAsset({
        hospitalId: 1,
        name: 'أصل غير صالح',
        tagNumber: 'BAD-1',
        purchaseDate: new Date('2026-01-01'),
        purchaseCost: 100,
        salvageValue: 200,
        usefulLifeYears: 5,
      }),
    ).rejects.toThrow(BadRequestException);

    const depRes = await service.runDepreciationForPeriod(
      1,
      9,
      new Date('2026-06-30T00:00:00.000Z'),
    );
    // (10000 - 1000) / (5 * 12) = 9000 / 60 = 150.000; new book value = 9850.000
    expect(depRes).toEqual({
      success: true,
      processedCount: 1,
      totalAssets: 1,
      errors: [],
    });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(updateAssetMock.mock.calls).toMatchObject([
      [{ where: { id: 10 }, data: { currentValue: '9850.000' } }],
    ]);
    expect(createEntryMock.mock.calls).toMatchObject([
      [
        {
          data: {
            postingKey: 'asset-depreciation:1:10:2026:6',
            lines: {
              create: [
                { accountId: 530, debit: '150.000', credit: '0.000' },
                { accountId: 160, debit: '0.000', credit: '150.000' },
              ],
            },
          },
        },
      ],
    ]);
    expect(createDepMock.mock.calls).toMatchObject([
      [
        {
          data: {
            amount: '150.000',
            bookValueAfter: '9850.000',
            accountingEntryId: 7001,
          },
        },
      ],
    ]);
  });

  it('enforces hospitalId tenant isolation in createMaintenanceTicket and resolveTicket', async () => {
    const updateTicketMock = jest.fn().mockResolvedValue({ id: 55 });
    const updateAssetsManyMock = jest.fn().mockResolvedValue({ count: 1 });
    const prismaMock = {
      $transaction: jest.fn(
        async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
          cb(prismaMock),
      ),
      asset: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: updateAssetsManyMock,
      },
      maintenanceTicket: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 55, hospitalId: 1, assetId: 10 }),
        update: updateTicketMock,
      },
    };

    const service = new AssetsService(
      prismaMock as unknown as PrismaService,
      {} as AccountingService,
    );

    await expect(
      service.createMaintenanceTicket({
        hospitalId: 2,
        userId: 9,
        assetId: 10,
        type: MaintenanceType.CORRECTIVE,
        priority: 'HIGH',
        issueDescription: 'محاولة عبر منشأة أخرى',
      }),
    ).rejects.toThrow(NotFoundException);

    await expect(
      service.resolveTicket({
        hospitalId: 2,
        userId: 9,
        ticketId: 55,
        notes: 'مرفوض',
        cost: 50,
        newStatus: TicketStatus.CLOSED,
      }),
    ).rejects.toThrow(NotFoundException);

    await service.resolveTicket({
      hospitalId: 1,
      userId: 9,
      ticketId: 55,
      notes: 'تمت الصيانة',
      cost: 125.375,
      newStatus: TicketStatus.RESOLVED,
    });
    expect(updateTicketMock.mock.calls).toMatchObject([
      [{ where: { id: 55 }, data: { cost: '125.375' } }],
    ]);
    expect(updateAssetsManyMock.mock.calls).toMatchObject([
      [
        {
          where: { id: 10, hospitalId: 1 },
          data: { status: AssetStatus.IN_SERVICE },
        },
      ],
    ]);
  });
});
