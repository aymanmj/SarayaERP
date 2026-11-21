import { responseBody } from '../http-response';
type TestResponse = {
  id: number;
  status: string;
  accountingEntryId: number | null;
};
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccountingService } from '../../src/accounting/accounting.service';
import { InventoryCountService } from '../../src/inventory/inventory-count.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Direct purchase invoice creation, approval, WAC valuation and atomic posting (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let token: string;
  let reader: string;
  let hospitalId: number;
  let userId: number;
  let warehouseId: number;
  let supplierId: number;
  let productId: number;
  let expiryDate: string;

  const futureDate = (days = 90) =>
    new Date(Date.now() + 86400000 * days).toISOString();

  const stockState = async () =>
    JSON.stringify({
      products: await db.product.findMany({
        select: { id: true, stockOnHand: true, costPrice: true, version: true },
        orderBy: { id: 'asc' },
      }),
      stocks: await db.productStock.findMany({
        select: {
          id: true,
          batchNumber: true,
          quantity: true,
          unitCost: true,
          expiryDate: true,
          version: true,
        },
        orderBy: { id: 'asc' },
      }),
      txs: await db.stockTransaction.count(),
      entries: await db.accountingEntry.count(),
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
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    expiryDate = futureDate(90);
    const auth = new AuthHelper(db, app.get(JwtService));
    const actor = await auth.createTestUser(
      'direct-purchase-actor',
      'synthetic',
      {
        permissions: [
          'purchases:manage',
          'purchases:invoice:create',
          'purchases:invoice:approve',
          'inventory:view',
          'inventory:manage',
        ],
      },
    );
    hospitalId = actor.user.hospitalId;
    userId = actor.user.id;
    token = actor.accessToken;

    reader = (
      await auth.createTestUser('direct-purchase-reader', 'synthetic', {
        hospitalId,
        permissions: ['purchases:manage'],
      })
    ).accessToken;

    await app
      .get(AccountingService)
      .ensureDefaultAccountsForHospital(hospitalId);

    for (const [key, type] of [
      ['INVENTORY_DRUGS', 'ASSET'],
      ['INVENTORY_SUPPLIES', 'ASSET'],
      ['INVENTORY_LAB', 'ASSET'],
      ['PAYABLE_SUPPLIERS', 'LIABILITY'],
    ] as const) {
      const account = await db.account.create({
        data: { hospitalId, code: `DIRECT-${key}`, name: key, type },
      });
      await db.systemAccountMapping.upsert({
        where: { hospitalId_key: { hospitalId, key } },
        update: { accountId: account.id, isActive: true },
        create: { hospitalId, key, accountId: account.id, isActive: true },
      });
    }

    const year = new Date().getUTCFullYear();
    const fy = await db.financialYear.create({
      data: {
        hospitalId,
        code: 'DIRECT-FY',
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
        periodCode: 'DIRECT-P1',
        periodIndex: 1,
        monthStartDate: new Date(`${year}-01-01`),
        monthEndDate: new Date(`${year}-12-31`),
        numberOfDays: 365,
        isOpen: true,
      },
    });

    warehouseId = (
      await db.warehouse.create({
        data: { hospitalId, name: 'Direct purchase warehouse' },
      })
    ).id;
    supplierId = (
      await db.supplier.create({
        data: { hospitalId, name: 'Direct purchase supplier' },
      })
    ).id;
    productId = (
      await db.product.create({
        data: {
          hospitalId,
          code: 'DIRECT-DRUG-1',
          name: 'Direct purchase drug',
          type: 'DRUG',
          costPrice: '1.000',
          stockOnHand: '2.000',
        },
      })
    ).id;
    await db.productStock.create({
      data: {
        hospitalId,
        warehouseId,
        productId,
        batchNumber: 'BATCH-OLD',
        quantity: '2.000',
        unitCost: '1.000',
        expiryDate: new Date(expiryDate),
      },
    });
  });

  const createDraftViaApi = async (
    overrides: Record<string, unknown> = {},
    lineOverrides: Record<string, unknown>[] = [
      {
        productId,
        description: 'Direct purchase line',
        quantity: 4,
        unitPrice: 3,
        batchNumber: 'BATCH-NEW',
        expiryDate,
      },
    ],
  ) => {
    const res = await request(app.getHttpServer())
      .post('/purchases/invoices')
      .auth(token, { type: 'bearer' })
      .send({
        supplierId,
        warehouseId,
        invoiceNumber: 'DIR-INV-001',
        invoiceDate: new Date().toISOString().slice(0, 10),
        currency: 'LYD',
        lines: lineOverrides,
        ...overrides,
      })
      .expect(201);
    return responseBody<TestResponse>(res) as { id: number };
  };

  it('preserves batchNumber and expiryDate via DTO and commits stock, WAC, journal and audit atomically', async () => {
    const draft = await createDraftViaApi();
    const savedLine = await db.purchaseInvoiceLine.findFirstOrThrow({
      where: { purchaseInvoiceId: draft.id },
    });
    expect(savedLine.batchNumber).toBe('BATCH-NEW');
    expect(savedLine.expiryDate?.toISOString()).toBe(expiryDate);

    const res = await request(app.getHttpServer())
      .post(`/purchases/invoices/${draft.id}/approve`)
      .auth(token, { type: 'bearer' })
      .expect(201);

    expect(responseBody<TestResponse>(res).status).toBe('APPROVED');
    expect(responseBody<TestResponse>(res).accountingEntryId).not.toBeNull();

    const product = await db.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockOnHand.toString()).toBe('6');
    expect(product.costPrice.toString()).toBe('2.333');
    expect(product.version).toBe(2);

    const newStock = await db.productStock.findUniqueOrThrow({
      where: {
        warehouseId_productId_batchNumber: {
          warehouseId,
          productId,
          batchNumber: 'BATCH-NEW',
        },
      },
    });
    expect(newStock.quantity.toString()).toBe('4');
    expect(newStock.unitCost.toString()).toBe('3');
    expect(newStock.expiryDate?.toISOString()).toBe(expiryDate);

    const entry = await db.accountingEntry.findUniqueOrThrow({
      where: { postingKey: `purchase-invoice:${hospitalId}:${draft.id}` },
      include: { lines: true },
    });
    expect(
      entry.lines.map((l) => [l.debit.toString(), l.credit.toString()]),
    ).toEqual([
      ['12', '0'],
      ['0', '12'],
    ]);

    const audit = await db.auditLog.findFirstOrThrow({
      where: {
        hospitalId,
        action: 'APPROVE_PURCHASE_INVOICE',
        entityId: draft.id,
      },
    });
    expect(audit.details).toMatchObject({
      payload: {
        valuationRoundingResiduals: [{ productId, amount: '-0.002' }],
      },
    });
  });

  it('serializes concurrent approval requests so stock and journal are posted once', async () => {
    const draft = await createDraftViaApi();
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/purchases/invoices/${draft.id}/approve`)
        .auth(token, { type: 'bearer' }),
      request(app.getHttpServer())
        .post(`/purchases/invoices/${draft.id}/approve`)
        .auth(token, { type: 'bearer' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('6');
    expect(await db.accountingEntry.count()).toBe(1);
    expect(await db.stockTransaction.count()).toBe(1);
  });

  it('rejects approval when summary stockOnHand and batch stocks are unreconciled', async () => {
    const draft = await createDraftViaApi();
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: '3.000' },
    });
    const before = await stockState();
    await request(app.getHttpServer())
      .post(`/purchases/invoices/${draft.id}/approve`)
      .auth(token, { type: 'bearer' })
      .expect(409);
    expect(await stockState()).toBe(before);
  });

  it('rejects conflicting expiry on an existing batch and expired stock', async () => {
    await request(app.getHttpServer())
      .post('/purchases/invoices')
      .auth(token, { type: 'bearer' })
      .send({
        supplierId,
        warehouseId,
        invoiceDate: new Date().toISOString().slice(0, 10),
        lines: [
          {
            productId,
            description: 'Expired drug',
            quantity: 1,
            unitPrice: 5,
            batchNumber: 'EXP-1',
            expiryDate: new Date(Date.now() - 86400000).toISOString(),
          },
        ],
      })
      .expect(400);

    const conflictingDraft = await createDraftViaApi({}, [
      {
        productId,
        description: 'Conflicting batch expiry',
        quantity: 2,
        unitPrice: 4,
        batchNumber: 'BATCH-OLD',
        expiryDate: futureDate(120),
      },
    ]);
    const before = await stockState();
    await request(app.getHttpServer())
      .post(`/purchases/invoices/${conflictingDraft.id}/approve`)
      .auth(token, { type: 'bearer' })
      .expect(409);
    expect(await stockState()).toBe(before);
  });

  it('invalidates an open inventory count when approving into an existing batch', async () => {
    const counts = app.get(InventoryCountService);
    const count = await counts.createDraftCount({
      hospitalId,
      warehouseId,
      userId,
      type: 'FULL',
    });
    const line = (await counts.getCount(count.id, hospitalId)).lines[0];
    await counts.updateLine(
      count.id,
      line.id,
      line.systemQty.toString(),
      line.revision,
      userId,
      hospitalId,
    );
    await counts.updateStatus(count.id, 'REVIEW', hospitalId, userId);

    const draft = await createDraftViaApi({}, [
      {
        productId,
        description: 'Same batch replenishment',
        quantity: 2,
        unitPrice: 3,
        batchNumber: 'BATCH-OLD',
        expiryDate,
      },
    ]);
    await request(app.getHttpServer())
      .post(`/purchases/invoices/${draft.id}/approve`)
      .auth(token, { type: 'bearer' })
      .expect(201);

    const checker = (
      await new AuthHelper(db, app.get(JwtService)).createTestUser(
        'direct-purchase-count-checker',
        'synthetic',
        { hospitalId, permissions: ['inventory:counts:post'] },
      )
    ).user.id;
    await expect(
      counts.postCount(count.id, checker, hospitalId),
    ).rejects.toThrow();
  });

  it.each(['AccountingEntry', 'AuditLog'])(
    'rolls back stock, batch and invoice status when %s insert fails',
    async (table) => {
      const draft = await createDraftViaApi();
      const before = await stockState();
      await db.$executeRawUnsafe(
        `CREATE FUNCTION repair_direct_purchase_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic direct purchase failure'; END $$`,
      );
      try {
        await db.$executeRawUnsafe(
          `CREATE TRIGGER repair_direct_purchase_fail BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION repair_direct_purchase_fail()`,
        );
        await request(app.getHttpServer())
          .post(`/purchases/invoices/${draft.id}/approve`)
          .auth(token, { type: 'bearer' })
          .expect(500);
        expect(await stockState()).toBe(before);
        expect(
          (
            await db.purchaseInvoice.findUniqueOrThrow({
              where: { id: draft.id },
            })
          ).status,
        ).toBe('DRAFT');
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS repair_direct_purchase_fail ON "${table}"`,
        );
        await db.$executeRawUnsafe(
          'DROP FUNCTION repair_direct_purchase_fail()',
        );
      }
    },
  );

  it('enforces permissions on invoice creation and approval', async () => {
    const draft = await createDraftViaApi();
    await request(app.getHttpServer())
      .post(`/purchases/invoices/${draft.id}/approve`)
      .auth(reader, { type: 'bearer' })
      .expect(403);
  });
});
