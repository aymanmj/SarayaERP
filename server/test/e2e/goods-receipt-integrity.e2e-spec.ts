import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PurchasesService } from '../../src/purchases/purchases.service';
import { InventoryCountService } from '../../src/inventory/inventory-count.service';
import { ProcurementService } from '../../src/purchases/procurement.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Goods receipt identity, ordered quantities, valuation snapshots and atomic accrual', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let service: ProcurementService;
  let hospitalId: number;
  let userId: number;
  let warehouseId: number;
  let supplierId: number;
  let productId: number;
  let uomId: number;
  let poId: number;
  let itemId: number;
  let token: string;
  let reader: string;
  const expiry = () => new Date(Date.now() + 86400000 * 90).toISOString();
  let expiryDate: string;
  const body = (quantity = '1.000', requestId = randomUUID()) => ({
    poId,
    warehouseId,
    requestId,
    items: [
      {
        purchaseOrderItemId: itemId,
        productId,
        uomId,
        quantity,
        batchNumber: 'NEW',
        expiryDate,
      },
    ],
  });
  const receive = (quantity = '1.000', requestId = randomUUID()) =>
    service.createGRN({ ...body(quantity, requestId), hospitalId, userId });
  const stockState = async () =>
    JSON.stringify({
      products: await db.product.findMany({
        select: { id: true, stockOnHand: true, costPrice: true, version: true },
        orderBy: { id: 'asc' },
      }),
      stocks: await db.productStock.findMany({
        select: { id: true, quantity: true, unitCost: true, version: true },
        orderBy: { id: 'asc' },
      }),
    });
  const noEffects = async () => {
    expect(await db.goodsReceipt.count()).toBe(0);
    expect(await db.stockTransaction.count()).toBe(0);
    expect(await db.accountingEntry.count()).toBe(0);
    expect(
      (
        await db.purchaseOrderItem.findUniqueOrThrow({ where: { id: itemId } })
      ).receivedQuantity.toString(),
    ).toBe('0');
  };
  const invoice = (grnIds: number[], invoiceNumber = 'SYNTHETIC-INV') =>
    service.createInvoiceFromGRN({
      hospitalId,
      userId,
      supplierId,
      grnIds,
      invoiceNumber,
      invoiceDate: new Date(new Date().toISOString().slice(0, 10)),
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
    service = app.get(ProcurementService);
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    expiryDate = expiry();
    const auth = new AuthHelper(db, app.get(JwtService));
    const actor = await auth.createTestUser('receiver', 'synthetic', {
      permissions: ['inventory:view', 'inventory:manage'],
    });
    hospitalId = actor.user.hospitalId;
    userId = actor.user.id;
    token = actor.accessToken;
    reader = (
      await auth.createTestUser('receipt-reader', 'synthetic', {
        hospitalId,
        permissions: ['inventory:view'],
      })
    ).accessToken;
    warehouseId = (
      await db.warehouse.create({
        data: { hospitalId, name: 'Synthetic receiving warehouse' },
      })
    ).id;
    supplierId = (
      await db.supplier.create({
        data: { hospitalId, name: 'Synthetic supplier' },
      })
    ).id;
    uomId = (
      await db.unitOfMeasure.create({
        data: { hospitalId, code: 'BOX', name: 'Synthetic ordered box' },
      })
    ).id;
    productId = (
      await db.product.create({
        data: {
          hospitalId,
          code: 'SYNTHETIC',
          name: 'Synthetic drug',
          type: 'DRUG',
          costPrice: '1.000',
          stockOnHand: 2,
        },
      })
    ).id;
    await db.productStock.create({
      data: {
        hospitalId,
        warehouseId,
        productId,
        batchNumber: 'OLD',
        quantity: 2,
        unitCost: 1,
        expiryDate: new Date(expiryDate),
      },
    });
    const po = await db.purchaseOrder.create({
      data: {
        hospitalId,
        supplierId,
        createdById: userId,
        poNumber: 'SYNTHETIC-PO',
        status: 'SENT',
        totalAmount: 12,
        items: {
          create: {
            productId,
            uomId,
            quantity: 2,
            baseQuantity: 4,
            unitPrice: 6,
            totalPrice: 12,
          },
        },
      },
      include: { items: true },
    });
    poId = po.id;
    itemId = po.items[0].id;
    for (const key of [
      'INVENTORY_DRUGS',
      'INVENTORY_SUPPLIES',
      'INVENTORY_LAB',
      'GRN_SUSPENSE',
      'PAYABLE_SUPPLIERS',
    ] as const) {
      const account = await db.account.create({
        data: {
          hospitalId,
          code: key,
          name: key,
          type: key.startsWith('INVENTORY') ? 'ASSET' : 'LIABILITY',
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
        code: 'GRN-FY',
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
        periodCode: 'GRN-P',
        periodIndex: 1,
        monthStartDate: new Date(`${year}-01-01`),
        monthEndDate: new Date(`${year}-12-31`),
        numberOfDays: 365,
        isOpen: true,
      },
    });
  });
  it('receives only an ordered line and freezes quantities and costs in one accrual', async () => {
    const grn = await receive();
    expect(grn.grnNumber).toMatch(/^GRN-/);
    expect(grn.accountingEntryId).not.toBeNull();
    const line = await db.goodsReceiptItem.findFirstOrThrow();
    expect(line.quantity.toString()).toBe('1');
    expect(line.baseQuantity.toString()).toBe('2');
    expect(line.unitPrice?.toString()).toBe('6');
    expect(line.unitCost?.toString()).toBe('3');
    expect(line.totalCost?.toString()).toBe('6');
    const product = await db.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockOnHand.toString()).toBe('4');
    expect(product.costPrice.toString()).toBe('2');
    expect(product.version).toBe(2);
    expect(
      (await db.purchaseOrder.findUniqueOrThrow({ where: { id: poId } }))
        .status,
    ).toBe('PARTIALLY_RECEIVED');
    const lines = await db.accountingEntryLine.findMany();
    expect(lines.find((l) => l.debit.gt(0))?.debit.toString()).toBe('6');
    expect(lines.find((l) => l.credit.gt(0))?.credit.toString()).toBe('6');
    expect(
      await db.auditLog.count({ where: { action: 'RECEIVE_PURCHASE_ORDER' } }),
    ).toBe(1);
  });
  it('returns the same receipt for concurrent identical requests', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      receive('1.000', key),
      receive('1.000', key),
    ]);
    expect(a).toEqual(b);
    await expect(receive('0.500', key)).rejects.toThrow();
    expect(await db.goodsReceipt.count()).toBe(1);
    expect(await db.accountingEntry.count()).toBe(1);
  });
  it('cannot exceed the remaining order quantity through two concurrent receipts', async () => {
    const result = await Promise.allSettled([
      receive('1.500'),
      receive('1.500'),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await db.purchaseOrderItem.findUniqueOrThrow({ where: { id: itemId } })
      ).receivedQuantity.toString(),
    ).toBe('1.5');
    expect(await db.goodsReceipt.count()).toBe(1);
  });
  it('completes the order exactly and tracks the rounded WAC residual', async () => {
    await receive();
    await receive();
    expect(
      (await db.purchaseOrder.findUniqueOrThrow({ where: { id: poId } }))
        .status,
    ).toBe('COMPLETED');
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).costPrice.toString(),
    ).toBe('2.333');
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'RECEIVE_PURCHASE_ORDER' },
      orderBy: { id: 'desc' },
    });
    expect(audit.details).toMatchObject({
      payload: {
        valuationRoundingResiduals: [{ productId, amount: '-0.002' }],
      },
    });
    const before = await stockState();
    await expect(receive()).rejects.toThrow();
    expect(await stockState()).toBe(before);
  });
  it('carries partial line rounding so the final receipts equal the ordered value', async () => {
    await db.productStock.updateMany({ data: { quantity: 0 } });
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: 0, costPrice: 0 },
    });
    await db.purchaseOrderItem.update({
      where: { id: itemId },
      data: {
        quantity: 1,
        baseQuantity: 1,
        unitPrice: '2.345',
        totalPrice: '2.345',
      },
    });
    await receive('0.500');
    await receive('0.500');
    expect(
      (
        await db.goodsReceiptItem.aggregate({ _sum: { totalCost: true } })
      )._sum.totalCost?.toString(),
    ).toBe('2.345');
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).costPrice.toString(),
    ).toBe('2.345');
  });
  it('uses the conversion frozen in the order rather than a mutable unit mapping', async () => {
    await db.productUOM.create({
      data: { productId, uomId, conversionRate: 100 },
    });
    await receive();
    expect(
      (await db.goodsReceiptItem.findFirstOrThrow()).baseQuantity.toString(),
    ).toBe('2');
  });
  it('invalidates an older count when receiving into its existing batch', async () => {
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
    const data = body();
    await service.createGRN({
      ...data,
      hospitalId,
      userId,
      items: [{ ...data.items[0], batchNumber: 'OLD' }],
    });
    const checker = (
      await new AuthHelper(db, app.get(JwtService)).createTestUser(
        'grn-count-checker',
        'synthetic',
        { hospitalId, permissions: ['inventory:counts:post'] },
      )
    ).user.id;
    await expect(
      counts.postCount(count.id, checker, hospitalId),
    ).rejects.toThrow();
    expect(await db.accountingEntry.count()).toBe(1);
  });
  it('posts supplies to their own inventory account', async () => {
    await db.product.update({
      where: { id: productId },
      data: { type: 'SUPPLY' },
    });
    await receive();
    const line = await db.accountingEntryLine.findFirstOrThrow({
      where: { debit: { gt: 0 } },
      include: { account: true },
    });
    expect(line.account.code).toBe('INVENTORY_SUPPLIES');
  });
  it.each(['0', '-1', '2.001', '0.0001', 'NaN', 'Infinity'])(
    'rejects invalid or excessive quantity %s',
    async (quantity) => {
      const before = await stockState();
      await expect(receive(quantity)).rejects.toThrow();
      await noEffects();
      expect(await stockState()).toBe(before);
    },
  );
  it.each(['DRAFT', 'CANCELLED', 'COMPLETED'] as const)(
    'rejects an order in state %s',
    async (status) => {
      await db.purchaseOrder.update({ where: { id: poId }, data: { status } });
      await expect(receive()).rejects.toThrow();
      await noEffects();
    },
  );
  it('rejects a different product, unit, or nonexistent order line', async () => {
    for (const patch of [
      { productId: productId + 1 },
      { uomId: uomId + 1 },
      { purchaseOrderItemId: itemId + 1 },
    ]) {
      const data = body();
      await expect(
        service.createGRN({
          ...data,
          hospitalId,
          userId,
          items: [{ ...data.items[0], ...patch }],
        }),
      ).rejects.toThrow();
    }
    await noEffects();
  });
  it('rejects foreign and inactive warehouses and suppliers', async () => {
    const foreign = await db.hospital.create({
      data: { code: 'GRN-FOREIGN', name: 'Synthetic foreign' },
    });
    const wh = await db.warehouse.create({
      data: { hospitalId: foreign.id, name: 'Foreign' },
    });
    await expect(
      service.createGRN({ ...body(), hospitalId, userId, warehouseId: wh.id }),
    ).rejects.toThrow();
    await db.warehouse.update({
      where: { id: warehouseId },
      data: { isActive: false },
    });
    await expect(receive()).rejects.toThrow();
    await db.warehouse.update({
      where: { id: warehouseId },
      data: { isActive: true },
    });
    await db.supplier.update({
      where: { id: supplierId },
      data: { isActive: false },
    });
    await expect(receive()).rejects.toThrow();
    await noEffects();
  });
  it('rejects expired receipts and a conflicting expiry on an existing batch', async () => {
    const data = body();
    await expect(
      service.createGRN({
        ...data,
        hospitalId,
        userId,
        items: [
          { ...data.items[0], expiryDate: new Date(Date.now() - 86400000) },
        ],
      }),
    ).rejects.toThrow();
    await expect(
      service.createGRN({
        ...data,
        hospitalId,
        userId,
        items: [
          {
            ...data.items[0],
            batchNumber: 'OLD',
            expiryDate: new Date(Date.now() + 86400000 * 100),
          },
        ],
      }),
    ).rejects.toThrow();
    await noEffects();
  });
  it('does not guess a unit conversion or accept an inconsistent summary', async () => {
    await db.purchaseOrderItem.update({
      where: { id: itemId },
      data: { baseQuantity: 1, quantity: 3 },
    });
    await expect(receive()).rejects.toThrow();
    await db.purchaseOrderItem.update({
      where: { id: itemId },
      data: { baseQuantity: 4, quantity: 2 },
    });
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: 3 },
    });
    await expect(receive()).rejects.toThrow();
    await noEffects();
  });
  it('rejects a closed financial period and a wrong suspense account type', async () => {
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(receive()).rejects.toThrow();
    await db.financialPeriod.updateMany({ data: { isOpen: true } });
    await db.account.updateMany({
      where: { code: 'GRN_SUSPENSE' },
      data: { type: 'ASSET' },
    });
    await expect(receive()).rejects.toThrow();
    await noEffects();
  });
  it.each(['AccountingEntry', 'AuditLog'])(
    'rolls back receipt and order progress when %s fails',
    async (table) => {
      const before = await stockState();
      await db.$executeRawUnsafe(
        `CREATE FUNCTION repair_grn_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic GRN failure'; END $$`,
      );
      try {
        await db.$executeRawUnsafe(
          `CREATE TRIGGER repair_grn_failure BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION repair_grn_failure()`,
        );
        await expect(receive()).rejects.toThrow();
        await noEffects();
        expect(await stockState()).toBe(before);
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS repair_grn_failure ON "${table}"`,
        );
        await db.$executeRawUnsafe('DROP FUNCTION repair_grn_failure()');
      }
    },
  );
  it('closes clearing from frozen receipt values and never receives inventory twice', async () => {
    const grn = await receive();
    const before = await stockState();
    const [a, b] = await Promise.all([invoice([grn.id]), invoice([grn.id])]);
    expect(a).toEqual(b);
    expect(a.netAmount.toString()).toBe('6');
    expect(await stockState()).toBe(before);
    expect(await db.purchaseInvoice.count()).toBe(1);
    expect(await db.accountingEntry.count()).toBe(2);
    expect(await db.stockTransaction.count()).toBe(1);
    await expect(invoice([grn.id], 'DIFFERENT')).rejects.toThrow();
    await expect(
      app.get(PurchasesService).cancelPurchaseInvoice({
        hospitalId,
        purchaseInvoiceId: a.id,
        userId,
        reason: 'Synthetic cancellation attempt',
      }),
    ).rejects.toThrow();
    await expect(
      db.goodsReceiptItem.updateMany({ data: { totalCost: 99 } }),
    ).rejects.toThrow();
    await expect(
      db.purchaseOrderItem.update({
        where: { id: itemId },
        data: { unitPrice: 99 },
      }),
    ).rejects.toThrow();
    await expect(
      db.goodsReceipt.update({
        where: { id: grn.id },
        data: { status: 'DRAFT' },
      }),
    ).rejects.toThrow();
  });
  it.each(['AccountingEntry', 'AuditLog'])(
    'rolls back receipt invoicing when %s fails',
    async (table) => {
      const grn = await receive();
      const before = await stockState();
      await db.$executeRawUnsafe(
        `CREATE FUNCTION repair_grn_invoice_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic invoice failure'; END $$`,
      );
      try {
        await db.$executeRawUnsafe(
          `CREATE TRIGGER repair_grn_invoice_failure BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION repair_grn_invoice_failure()`,
        );
        await expect(invoice([grn.id])).rejects.toThrow();
        expect(await db.purchaseInvoice.count()).toBe(0);
        expect(
          (await db.goodsReceipt.findUniqueOrThrow({ where: { id: grn.id } }))
            .purchaseInvoiceId,
        ).toBeNull();
        expect(await db.accountingEntry.count()).toBe(1);
        expect(await stockState()).toBe(before);
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS repair_grn_invoice_failure ON "${table}"`,
        );
        await db.$executeRawUnsafe(
          'DROP FUNCTION repair_grn_invoice_failure()',
        );
      }
    },
  );
  it('rejects receipt invoicing with a wrong supplier or unsupported tax/discount', async () => {
    const grn = await receive();
    const other = await db.supplier.create({
      data: { hospitalId, name: 'Different supplier' },
    });
    await expect(
      service.createInvoiceFromGRN({
        hospitalId,
        userId,
        supplierId: other.id,
        grnIds: [grn.id],
        invoiceNumber: 'X',
        invoiceDate: new Date(),
      }),
    ).rejects.toThrow();
    await expect(
      service.createInvoiceFromGRN({
        hospitalId,
        userId,
        supplierId,
        grnIds: [grn.id],
        invoiceNumber: 'X',
        invoiceDate: new Date(),
        vatAmount: 1,
      }),
    ).rejects.toThrow();
    expect(await db.purchaseInvoice.count()).toBe(0);
  });
  it('enforces receiving permissions and the same DTO on both entry points', async () => {
    await request(app.getHttpServer())
      .post('/procurement/receipts')
      .auth(reader, { type: 'bearer' })
      .send(body())
      .expect(403);
    for (const path of ['/procurement/receipts', '/purchases/grn'])
      await request(app.getHttpServer())
        .post(path)
        .auth(token, { type: 'bearer' })
        .send({ ...body(), items: [{ ...body().items[0], quantity: 1 }] })
        .expect(400);
    const data = body();
    await request(app.getHttpServer())
      .post('/procurement/receipts')
      .auth(token, { type: 'bearer' })
      .send(data)
      .expect(201);
    await request(app.getHttpServer())
      .post('/purchases/grn')
      .auth(token, { type: 'bearer' })
      .send(data)
      .expect(201);
    expect(await db.goodsReceipt.count()).toBe(1);
  });
  it('does not allow a status patch to fake completion or reopen a cancelled order', async () => {
    await expect(
      service.updatePOStatus(hospitalId, userId, poId, 'COMPLETED'),
    ).rejects.toThrow();
    await service.updatePOStatus(hospitalId, userId, poId, 'CANCELLED');
    await expect(
      service.updatePOStatus(hospitalId, userId, poId, 'SENT'),
    ).rejects.toThrow();
  });
});
