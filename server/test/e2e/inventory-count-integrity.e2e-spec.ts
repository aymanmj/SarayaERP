import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InventoryCountService } from '../../src/inventory/inventory-count.service';
import { AccountingService } from '../../src/accounting/accounting.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Inventory counts: confirmed snapshots, independent posting and atomic valuation', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let service: InventoryCountService;
  let hospitalId: number;
  let warehouseId: number;
  let counterId: number;
  let checkerId: number;
  let counter: string;
  let checker: string;
  let productId: number;
  const create = () =>
    service.createDraftCount({
      hospitalId,
      warehouseId,
      userId: counterId,
      type: 'FULL',
    });
  const read = (id: number) => service.getCount(id, hospitalId);
  const confirm = async (
    id: number,
    mode: 'same' | 'zero-first' | 'offset' = 'same',
  ) => {
    const count = await read(id);
    for (const line of count.lines) {
      const qty =
        mode === 'zero-first' && line.productId === productId
          ? '0'
          : mode === 'offset' && line.batchNumber === 'A'
            ? '0'
            : mode === 'offset' && line.batchNumber === 'C'
              ? '1.500'
              : line.systemQty.toString();
      await service.updateLine(
        id,
        line.id,
        qty,
        line.revision,
        counterId,
        hospitalId,
      );
    }
  };
  const ready = async (mode: 'same' | 'zero-first' | 'offset' = 'same') => {
    const count = await create();
    await confirm(count.id, mode);
    await service.updateStatus(count.id, 'REVIEW', hospitalId, counterId);
    return count.id;
  };
  const state = async () =>
    JSON.stringify({
      stocks: await db.productStock.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, quantity: true, version: true },
      }),
      products: await db.product.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, stockOnHand: true, version: true },
      }),
    });
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    db = app.get(PrismaService);
    service = app.get(InventoryCountService);
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    const auth = new AuthHelper(db, app.get(JwtService));
    const actor = await auth.createTestUser('count-counter', 'synthetic', {
      permissions: ['inventory:view', 'inventory:manage'],
    });
    hospitalId = actor.user.hospitalId;
    counterId = actor.user.id;
    counter = actor.accessToken;
    const approver = await auth.createTestUser('count-checker', 'synthetic', {
      hospitalId,
      permissions: ['inventory:view', 'inventory:counts:post'],
    });
    checkerId = approver.user.id;
    checker = approver.accessToken;
    warehouseId = (
      await db.warehouse.create({
        data: { hospitalId, name: 'Synthetic count warehouse' },
      })
    ).id;
    for (const key of [
      'INVENTORY_DRUGS',
      'INVENTORY_GAIN',
      'INVENTORY_LOSS',
    ] as const) {
      const account = await db.account.create({
        data: {
          hospitalId,
          code: key,
          name: key,
          type:
            key === 'INVENTORY_DRUGS'
              ? 'ASSET'
              : key === 'INVENTORY_GAIN'
                ? 'REVENUE'
                : 'EXPENSE',
        },
      });
      await db.systemAccountMapping.create({
        data: { hospitalId, key, accountId: account.id },
      });
    }
    const year = new Date().getUTCFullYear();
    const fy = await db.financialYear.create({
      data: {
        hospitalId,
        code: 'COUNT-FY',
        name: String(year),
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year}-12-31`),
        status: 'OPEN',
        isCurrent: true,
      },
    });
    await db.financialPeriod.create({
      data: {
        financialYearId: fy.id,
        periodCode: 'COUNT-P',
        periodIndex: 1,
        monthStartDate: new Date(`${year}-01-01`),
        monthEndDate: new Date(`${year}-12-31`),
        numberOfDays: 365,
        isOpen: true,
      },
    });
    for (const code of ['FIRST', 'SECOND']) {
      const product = await db.product.create({
        data: {
          hospitalId,
          code,
          name: code,
          type: 'DRUG',
          stockOnHand: 1,
          costPrice: '2.345',
        },
      });
      if (code === 'FIRST') productId = product.id;
      for (const batch of code === 'FIRST' ? ['A', 'B'] : ['C'])
        await db.productStock.create({
          data: {
            hospitalId,
            warehouseId,
            productId: product.id,
            batchNumber: batch,
            quantity: code === 'FIRST' ? '0.500' : '1.000',
            unitCost: '2.345',
          },
        });
    }
  });
  it('does not confirm a physical count by copying the system snapshot', async () => {
    const count = await create();
    const detail = await read(count.id);
    expect(detail.lines).toHaveLength(3);
    expect(
      detail.lines.every(
        (l) => l.physicalQty === null && l.countedById === null,
      ),
    ).toBe(true);
    await expect(
      service.updateStatus(count.id, 'REVIEW', hospitalId, counterId),
    ).rejects.toThrow();
    await expect(
      service.postCount(count.id, checkerId, hospitalId),
    ).rejects.toThrow();
    expect(await db.stockTransaction.count()).toBe(0);
  });
  it('posts exact signed costs, both stock balances, versions, journal and audit once', async () => {
    const id = await ready('zero-first');
    const [a, b] = await Promise.all([
      service.postCount(id, checkerId, hospitalId),
      service.postCount(id, checkerId, hospitalId),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.status).toBe('POSTED');
    const product = await db.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockOnHand.toString()).toBe('0');
    expect(product.version).toBe(2);
    const movements = await db.stockTransaction.findMany({
      orderBy: { id: 'asc' },
    });
    expect(movements.map((m) => m.totalCost.toString())).toEqual([
      '-1.173',
      '-1.172',
    ]);
    expect(
      movements.every((m) => m.quantity.eq(m.baseQuantity) && m.quantity.lt(0)),
    ).toBe(true);
    expect(await db.accountingEntry.count()).toBe(1);
    expect((await read(id)).accountingEntryId).not.toBeNull();
    expect(
      await db.auditLog.count({ where: { action: 'POST_INVENTORY_COUNT' } }),
    ).toBe(1);
    expect(
      (
        await db.accountingEntryLine.aggregate({
          where: { account: { code: 'INVENTORY_LOSS' } },
          _sum: { debit: true },
        })
      )._sum.debit?.toString(),
    ).toBe('2.345');
  });
  it('posts both gains and losses even when their net value is zero', async () => {
    const id = await ready('offset');
    await service.postCount(id, checkerId, hospitalId);
    expect(await db.accountingEntry.count()).toBe(1);
    const lines = await db.accountingEntryLine.findMany({
      include: { account: true },
    });
    expect(lines).toHaveLength(4);
    expect(
      lines.find((l) => l.account.code === 'INVENTORY_GAIN')?.credit.toString(),
    ).toBe('1.173');
    expect(
      lines.find((l) => l.account.code === 'INVENTORY_LOSS')?.debit.toString(),
    ).toBe('1.173');
  });
  it('requires independent posting and a dedicated permission', async () => {
    const id = await ready();
    await expect(
      service.postCount(id, counterId, hospitalId),
    ).rejects.toThrow();
    await request(app.getHttpServer())
      .post(`/inventory/counts/${id}/post`)
      .auth(counter, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/inventory/counts/${id}/post`)
      .auth(checker, { type: 'bearer' })
      .expect(201);
    expect((await read(id)).status).toBe('POSTED');
    expect(await db.accountingEntry.count()).toBe(0);
  });
  it('cannot bypass posting or reopen terminal states through the status endpoint', async () => {
    const id = await ready();
    await request(app.getHttpServer())
      .put(`/inventory/counts/${id}/status`)
      .auth(counter, { type: 'bearer' })
      .send({ status: 'POSTED' })
      .expect(409);
    await service.postCount(id, checkerId, hospitalId);
    await expect(
      service.updateStatus(id, 'IN_PROGRESS', hospitalId, counterId),
    ).rejects.toThrow();
    const line = (await read(id)).lines[0];
    await expect(
      service.updateLine(
        id,
        line.id,
        '1.000',
        line.revision,
        counterId,
        hospitalId,
      ),
    ).rejects.toThrow();
    await expect(
      db.inventoryCountLine.update({
        where: { id: line.id },
        data: { physicalQty: '1.000' },
      }),
    ).rejects.toThrow();
  });
  it('binds a line to its parent count and rejects stale edit revisions', async () => {
    const a = await create();
    const b = await create();
    const line = (await read(a.id)).lines[0];
    await request(app.getHttpServer())
      .put(`/inventory/counts/${b.id}/lines/${line.id}`)
      .auth(counter, { type: 'bearer' })
      .send({ physicalQty: '0.500', revision: 0 })
      .expect(404);
    await service.updateLine(a.id, line.id, '0.500', 0, counterId, hospitalId);
    await expect(
      service.updateLine(a.id, line.id, '0.000', 0, counterId, hospitalId),
    ).rejects.toThrow();
    expect(
      (
        await db.inventoryCountLine.findUniqueOrThrow({
          where: { id: line.id },
        })
      ).physicalQty?.toString(),
    ).toBe('0.5');
  });
  it.each([-1, 0.5, '-1', '0.0001', 'NaN', '1000000000000000'])(
    'rejects malformed physical quantity %s',
    async (physicalQty) => {
      const count = await create();
      const line = (await read(count.id)).lines[0];
      await request(app.getHttpServer())
        .put(`/inventory/counts/${count.id}/lines/${line.id}`)
        .auth(counter, { type: 'bearer' })
        .send({ physicalQty, revision: 0 })
        .expect(400);
      expect(
        (
          await db.inventoryCountLine.findUniqueOrThrow({
            where: { id: line.id },
          })
        ).physicalQty,
      ).toBeNull();
    },
  );
  it.each(['quantity', 'version', 'cost', 'new-batch', 'removed-batch'])(
    'rejects a stale snapshot after a %s change',
    async (change) => {
      const id = await ready('zero-first');
      if (change === 'quantity')
        await db.productStock.updateMany({
          where: { batchNumber: 'A' },
          data: { quantity: '0.400' },
        });
      if (change === 'version')
        await db.productStock.updateMany({
          where: { batchNumber: 'A' },
          data: { version: { increment: 1 } },
        });
      if (change === 'cost')
        await db.product.update({
          where: { id: productId },
          data: { costPrice: '2.346' },
        });
      if (change === 'new-batch')
        await db.productStock.create({
          data: {
            hospitalId,
            warehouseId,
            productId,
            batchNumber: 'NEW',
            quantity: 0,
            unitCost: 0,
          },
        });
      if (change === 'removed-batch')
        await db.productStock.deleteMany({ where: { batchNumber: 'A' } });
      const before = await state();
      await expect(
        service.postCount(id, checkerId, hospitalId),
      ).rejects.toThrow();
      expect(await state()).toBe(before);
      expect(await db.stockTransaction.count()).toBe(0);
      expect(await db.accountingEntry.count()).toBe(0);
      expect((await read(id)).status).toBe('REVIEW');
    },
  );
  it('rejects a second overlapping count after the first changes stock', async () => {
    const a = await ready('zero-first');
    const b = await ready('zero-first');
    await service.postCount(a, checkerId, hospitalId);
    await expect(service.postCount(b, checkerId, hospitalId)).rejects.toThrow();
    expect(await db.accountingEntry.count()).toBe(1);
  });
  it('isolates foreign warehouses and count reads and redacts user credential fields', async () => {
    const foreign = await db.hospital.create({
      data: { code: 'COUNT-FOREIGN', name: 'Synthetic foreign' },
    });
    const warehouse = await db.warehouse.create({
      data: { hospitalId: foreign.id, name: 'Foreign' },
    });
    await expect(
      service.createDraftCount({
        hospitalId,
        warehouseId: warehouse.id,
        userId: counterId,
        type: 'FULL',
      }),
    ).rejects.toThrow();
    const count = await create();
    await expect(service.getCount(count.id, foreign.id)).rejects.toThrow();
    const response = await request(app.getHttpServer())
      .get(`/inventory/counts/${count.id}`)
      .auth(counter, { type: 'bearer' })
      .expect(200);
    expect(response.body).toHaveProperty('assignedTo', {
      id: counterId,
      fullName: 'Test User',
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });
  it('refuses a closed financial period even for a zero-variance count', async () => {
    const id = await ready();
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(
      service.postCount(id, checkerId, hospitalId),
    ).rejects.toThrow();
    expect((await read(id)).status).toBe('REVIEW');
  });
  it('keeps snapshots immutable and cancellation terminal', async () => {
    const count = await create();
    const line = (await read(count.id)).lines[0];
    await expect(
      db.inventoryCountLine.update({
        where: { id: line.id },
        data: { systemQty: 2 },
      }),
    ).rejects.toThrow();
    await service.updateStatus(count.id, 'CANCELLED', hospitalId, counterId);
    expect(
      (await service.getDashboardStats(hospitalId, warehouseId)).activeCounts,
    ).toBe(0);
    await expect(
      service.updateStatus(count.id, 'IN_PROGRESS', hospitalId, counterId),
    ).rejects.toThrow();
    await expect(
      service.postCount(count.id, checkerId, hospitalId),
    ).rejects.toThrow();
  });
  it('refuses a wrong loss account type without changing count or stock', async () => {
    const id = await ready('zero-first');
    await db.account.updateMany({
      where: { code: 'INVENTORY_LOSS' },
      data: { type: 'REVENUE' },
    });
    const before = await state();
    await expect(
      service.postCount(id, checkerId, hospitalId),
    ).rejects.toThrow();
    expect(await state()).toBe(before);
    expect(await db.accountingEntry.count()).toBe(0);
    expect((await read(id)).status).toBe('REVIEW');
  });
  it('rejects unsupported valuation instead of pretending to post FIFO', async () => {
    const category = await db.itemCategory.create({
      data: { hospitalId, name: 'Synthetic FIFO', valuationMethod: 'FIFO' },
    });
    await db.product.update({
      where: { id: productId },
      data: { categoryId: category.id },
    });
    const id = await ready('zero-first');
    await expect(
      service.postCount(id, checkerId, hospitalId),
    ).rejects.toThrow();
    expect(await db.stockTransaction.count()).toBe(0);
  });
  it('does not let an approver post after participating in a recount', async () => {
    const id = await ready();
    await service.updateStatus(id, 'IN_PROGRESS', hospitalId, counterId);
    const line = (await read(id)).lines[0];
    await service.updateLine(
      id,
      line.id,
      line.systemQty.toString(),
      line.revision,
      checkerId,
      hospitalId,
    );
    await service.updateStatus(id, 'REVIEW', hospitalId, counterId);
    await expect(
      service.postCount(id, checkerId, hospitalId),
    ).rejects.toThrow();
    expect(await db.accountingEntry.count()).toBe(0);
  });
  it('keeps confirmed count lines stable until posting commits', async () => {
    const id = await ready('zero-first');
    const line = (await read(id)).lines[0];
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((r) => {
      entered = r;
    });
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const accounting = app.get(AccountingService);
    const original = accounting.recordInventoryAdjustmentEntry.bind(
      accounting,
    ) as AccountingService['recordInventoryAdjustmentEntry'];
    const hook = jest
      .spyOn(accounting, 'recordInventoryAdjustmentEntry')
      .mockImplementationOnce(async (params) => {
        entered();
        await gate;
        return original(params);
      });
    const pending = service.postCount(id, checkerId, hospitalId);
    const observed = pending.then(() => {
      throw new Error('Posting bypassed the accounting gate');
    });
    try {
      await Promise.race([reached, observed]);
      await expect(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '200ms'");
          await tx.inventoryCountLine.update({
            where: { id: line.id },
            data: { physicalQty: '0.500', variance: 0 },
          });
        }),
      ).rejects.toThrow();
    } finally {
      release();
      hook.mockRestore();
      await pending;
    }
    expect((await read(id)).lines[0].physicalQty?.toString()).toBe('0');
  });
  it.each(['AccountingEntry', 'AuditLog'])(
    'rolls back posting entirely when %s fails',
    async (table) => {
      const id = await ready('zero-first');
      const before = await state();
      await db.$executeRawUnsafe(
        `CREATE FUNCTION repair_count_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic count failure'; END $$`,
      );
      try {
        await db.$executeRawUnsafe(
          `CREATE TRIGGER repair_count_failure BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION repair_count_failure()`,
        );
        await expect(
          service.postCount(id, checkerId, hospitalId),
        ).rejects.toThrow();
        expect(await state()).toBe(before);
        expect(await db.stockTransaction.count()).toBe(0);
        expect(await db.accountingEntry.count()).toBe(0);
        expect((await read(id)).status).toBe('REVIEW');
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS repair_count_failure ON "${table}"`,
        );
        await db.$executeRawUnsafe('DROP FUNCTION repair_count_failure()');
      }
    },
  );
});
