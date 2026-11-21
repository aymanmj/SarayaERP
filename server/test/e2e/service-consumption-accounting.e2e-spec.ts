import { Test } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { AccountingService } from '../../src/accounting/accounting.service';
import { InventoryAutoDepletionListener } from '../../src/inventory/inventory-auto-depletion.listener';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
describe('Service consumption exact money and atomic journal', () => {
  let app: INestApplication;
  let db: PrismaService;
  let hospitalId: number;
  let userId: number;
  let warehouseId: number;
  let serviceId: number;
  let categoryId: number;
  let inventoryId: number;
  let expenseId: number;
  let periodId: number;
  const consume = () =>
    app
      .get(InventoryService)
      .autoDepleteServiceMaterials(
        hospitalId,
        serviceId,
        warehouseId,
        1,
        userId,
        serviceId,
        'MONEY_TEST',
      );
  const event = () =>
    app.get(InventoryAutoDepletionListener).handleServiceCompletedEvent({
      hospitalId,
      serviceItemId: serviceId,
      performerId: userId,
      referenceType: 'MONEY_TEST',
      referenceId: serviceId,
    });
  const unchanged = async () => {
    expect(
      (
        await db.productStock.aggregate({ _sum: { quantity: true } })
      )._sum.quantity?.toString(),
    ).toBe('6');
    expect(
      (
        await db.product.aggregate({ _sum: { stockOnHand: true } })
      )._sum.stockOnHand?.toString(),
    ).toBe('6');
    expect(await db.stockTransaction.count()).toBe(0);
    expect(await db.accountingEntry.count()).toBe(0);
  };
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    const actor = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'money-consumer',
      'synthetic',
    );
    hospitalId = actor.user.hospitalId;
    userId = actor.user.id;
    warehouseId = (
      await db.warehouse.create({
        data: { hospitalId, name: 'Synthetic money warehouse' },
      })
    ).id;
    await db.consumptionWarehousePolicy.create({
      data: { hospitalId, warehouseId, updatedById: userId },
    });
    inventoryId = (
      await db.account.create({
        data: {
          hospitalId,
          code: 'TEST-INVENTORY',
          name: 'Synthetic inventory',
          type: 'ASSET',
        },
      })
    ).id;
    expenseId = (
      await db.account.create({
        data: {
          hospitalId,
          code: 'TEST-EXPENSE',
          name: 'Synthetic consumption',
          type: 'EXPENSE',
        },
      })
    ).id;
    categoryId = (
      await db.itemCategory.create({
        data: {
          hospitalId,
          name: 'Synthetic category',
          inventoryAccountId: inventoryId,
          expenseAccountId: expenseId,
        },
      })
    ).id;
    serviceId = (
      await db.serviceItem.create({
        data: {
          hospitalId,
          name: 'Synthetic priced service',
          type: 'OTHER',
          defaultPrice: 0,
        },
      })
    ).id;
    for (const [code, cost, quantity] of [
      ['A', '2.345', '0.500'],
      ['B', '0.100', '1.000'],
    ] as const) {
      const product = await db.product.create({
        data: {
          hospitalId,
          code,
          name: code,
          costPrice: cost,
          stockOnHand: 3,
          categoryId,
        },
      });
      await db.productStock.create({
        data: {
          hospitalId,
          warehouseId,
          productId: product.id,
          batchNumber: code,
          quantity: 3,
          unitCost: cost,
        },
      });
      await db.serviceItemProduct.create({
        data: { serviceItemId: serviceId, productId: product.id, quantity },
      });
    }
    const year = new Date().getUTCFullYear();
    const fy = await db.financialYear.create({
      data: {
        hospitalId,
        code: 'MONEY-FY',
        name: String(year),
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year}-12-31`),
        status: 'OPEN',
        isCurrent: true,
      },
    });
    periodId = (
      await db.financialPeriod.create({
        data: {
          financialYearId: fy.id,
          periodCode: 'MONEY-P',
          periodIndex: 1,
          monthStartDate: new Date(`${year}-01-01`),
          monthEndDate: new Date(`${year}-12-31`),
          numberOfDays: 365,
          isOpen: true,
        },
      })
    ).id;
  });
  it('posts HALF_EVEN movement totals exactly and replays without a second journal', async () => {
    await consume();
    await consume();
    expect(await db.accountingEntry.count()).toBe(1);
    const lines = await db.accountingEntryLine.findMany();
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.accountId === expenseId)?.debit.toString()).toBe(
      '1.272',
    );
    expect(
      lines.find((l) => l.accountId === inventoryId)?.credit.toString(),
    ).toBe('1.272');
    expect(
      (
        await db.stockTransaction.aggregate({ _sum: { totalCost: true } })
      )._sum.totalCost?.toString(),
    ).toBe('1.272');
    expect(
      (
        await db.product.aggregate({ _sum: { stockOnHand: true } })
      )._sum.stockOnHand?.toString(),
    ).toBe('4.5');
  });
  it('rolls back stock and success receipt when the period is closed', async () => {
    await db.financialPeriod.update({
      where: { id: periodId },
      data: { isOpen: false },
    });
    await expect(consume()).rejects.toThrow('ACCOUNTING_POSTING_FAILED');
    await unchanged();
    expect(await db.serviceMaterialConsumption.count()).toBe(0);
  });
  it('retains a diagnosed failure and retries after a journal insertion fault without double posting', async () => {
    await db.$executeRawUnsafe(
      `CREATE FUNCTION repair_consumption_journal_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic journal failure'; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        'CREATE TRIGGER repair_consumption_journal_failure BEFORE INSERT ON "AccountingEntry" FOR EACH ROW EXECUTE FUNCTION repair_consumption_journal_failure()',
      );
      await event();
      await unchanged();
      expect(
        await db.serviceMaterialConsumption.findFirstOrThrow(),
      ).toMatchObject({
        status: 'FAILED',
        error: 'ACCOUNTING_POSTING_FAILED',
        completedAt: null,
      });
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS repair_consumption_journal_failure ON "AccountingEntry"',
      );
      await db.$executeRawUnsafe(
        'DROP FUNCTION repair_consumption_journal_failure()',
      );
    }
    await db.serviceMaterialConsumption.updateMany({
      data: { nextRetryAt: new Date('2000-01-01') },
    });
    await app.get(InventoryAutoDepletionListener).retryPending();
    await event();
    expect(await db.accountingEntry.count()).toBe(1);
    expect(
      (await db.serviceMaterialConsumption.findFirstOrThrow()).status,
    ).toBe('COMPLETED');
  });
  it('rejects a foreign category account before consuming stock', async () => {
    const foreign = await db.hospital.create({
      data: { code: 'MONEY-FOREIGN', name: 'Synthetic foreign' },
    });
    const account = await db.account.create({
      data: {
        hospitalId: foreign.id,
        code: 'FOREIGN',
        name: 'Foreign expense',
        type: 'EXPENSE',
      },
    });
    await db.itemCategory.update({
      where: { id: categoryId },
      data: { expenseAccountId: account.id },
    });
    await event();
    await unchanged();
    expect((await db.serviceMaterialConsumption.findFirstOrThrow()).error).toBe(
      'ACCOUNT_MAPPING_INVALID',
    );
  });
  it('rejects negative and non-finite input before any journal write', async () => {
    for (const totalCost of [-1, NaN, Infinity])
      await expect(
        app.get(AccountingService).recordCogsEntry({
          hospitalId,
          userId,
          sourceId: 1,
          module: 'INVENTORY',
          totalCost,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    expect(await db.accountingEntry.count()).toBe(0);
  });
  it('uses the money policy at the journal boundary for midpoint ties', async () => {
    const accounting = app.get(AccountingService);
    const params = {
      hospitalId,
      userId,
      sourceId: 999,
      module: 'INVENTORY' as const,
      inventoryAccountId: inventoryId,
      expenseAccountId: expenseId,
    };
    await accounting.recordCogsEntry({ ...params, totalCost: 0.0005 });
    expect(await db.accountingEntry.count()).toBe(0);
    await accounting.recordCogsEntry({ ...params, totalCost: 0.0015 });
    expect(
      (
        await db.accountingEntryLine.findFirstOrThrow({
          where: { accountId: expenseId },
        })
      ).debit.toString(),
    ).toBe('0.002');
  });
});
