import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper, testStaffSessionClaims } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { responseBody } from '../http-response';
import { InventoryService } from '../../src/inventory/inventory.service';
import { InventoryAutoDepletionListener } from '../../src/inventory/inventory-auto-depletion.listener';

describe('Internal inventory transfers (real HTTP/PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let token: string;
  let hospitalId: number;
  let productId: number;
  let from: number;
  let to: number;
  let mrId: number;
  const post = (path: string, body: object = {}, access = token) =>
    request(app.getHttpServer())
      .post(path)
      .auth(access, { type: 'bearer' })
      .send(body);
  const create = (quantity = 10, extra: object = {}) =>
    post('/inventory/material-requests', {
      requestingWarehouseId: to,
      fulfillingWarehouseId: from,
      items: [{ productId, requestedQty: quantity }],
      ...extra,
    });
  const issue = (qty?: number, key = randomUUID(), extra: object = {}) =>
    post(`/inventory/material-requests/${mrId}/issue`, {
      requestKey: key,
      ...(qty === undefined ? {} : { items: [{ productId, quantity: qty }] }),
      ...extra,
    });
  const receive = (id: number) => post(`/inventory/stock-issues/${id}/receive`);
  const idOf = (response: request.Response) =>
    (response.body as { id: number }).id;
  const issueId = (response: request.Response) =>
    (response.body as { stockIssueId: number }).stockIssueId;
  const total = async (warehouseId: number) =>
    (
      await db.productStock.aggregate({
        where: { warehouseId },
        _sum: { quantity: true },
      })
    )._sum.quantity?.toString() ?? '0';
  const unchanged = async () => {
    expect(await total(from)).toBe('10');
    expect(await total(to)).toBe('0');
    expect(await db.stockIssue.count()).toBe(0);
    expect(await db.stockTransaction.count()).toBe(0);
    expect(await db.accountingEntry.count()).toBe(0);
  };
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
    const actor = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'transfer-staff',
      'synthetic',
      { permissions: ['inventory:manage', 'inventory:view'] },
    );
    token = actor.accessToken;
    hospitalId = actor.user.hospitalId;
    from = (
      await db.warehouse.create({
        data: { hospitalId, name: 'Synthetic source' },
      })
    ).id;
    to = (
      await db.warehouse.create({
        data: { hospitalId, name: 'Synthetic destination' },
      })
    ).id;
    productId = (
      await db.product.create({
        data: {
          hospitalId,
          code: 'TRANSFER-P',
          name: 'Synthetic transfer product',
          stockOnHand: 10,
          costPrice: '2.345',
        },
      })
    ).id;
    for (const [batch, qty, years] of [
      ['A', 6, 1],
      ['B', 4, 2],
    ] as const) {
      await db.productStock.create({
        data: {
          hospitalId,
          warehouseId: from,
          productId,
          batchNumber: batch,
          quantity: qty,
          unitCost: '1.234',
          expiryDate: new Date(Date.now() + years * 365 * 86400000),
        },
      });
    }
    mrId = idOf(await create().expect(201));
  });

  it('preserves owned quantity, cost snapshots and total book stock without posting COGS', async () => {
    const id = issueId(await issue().expect(201));
    expect(await total(from)).toBe('0');
    expect(await total(to)).toBe('0');
    const transit = await db.stockIssueItem.aggregate({
      where: { stockIssueId: id },
      _sum: { issuedQty: true, totalCost: true },
    });
    expect(transit._sum.issuedQty?.toString()).toBe('10');
    expect(transit._sum.totalCost?.toString()).toBe('23.45');
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('10');
    await db.product.update({
      where: { id: productId },
      data: { costPrice: 9 },
    });
    await receive(id).expect(201);
    expect(await total(to)).toBe('10');
    expect(await db.accountingEntry.count()).toBe(0);
    const moves = await db.stockTransaction.findMany({
      where: { stockIssueId: id },
      orderBy: { id: 'asc' },
    });
    expect(moves).toHaveLength(4);
    expect(moves.every((m) => m.unitCost.toString() === '2.345')).toBe(true);
    for (const batch of ['A', 'B']) {
      const pair = moves.filter((m) => m.batchNumber === batch);
      expect(pair[0].quantity.equals(pair[1].quantity)).toBe(true);
      expect(pair[0].totalCost.equals(pair[1].totalCost)).toBe(true);
    }
    const stocks = await db.productStock.findMany({
      where: { warehouseId: to },
    });
    expect(stocks.every((s) => s.unitCost.toString() === '1.234')).toBe(true);
  });
  it('replays a partial issue once and rejects changed payload reuse', async () => {
    const key = randomUUID();
    const first = issueId(await issue(2, key).expect(201));
    expect(issueId(await issue(2, key).expect(201))).toBe(first);
    await issue(3, key).expect(409);
    expect(await db.stockIssue.count()).toBe(1);
    expect(await total(from)).toBe('8');
    expect(
      (
        await db.materialRequestItem.findFirstOrThrow({
          where: { materialRequestId: mrId },
        })
      ).issuedQty.toString(),
    ).toBe('2');
  });
  it('serializes simultaneous partial issue retries with the same key', async () => {
    const key = randomUUID();
    const results = await Promise.all([issue(2, key), issue(2, key)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(issueId(results[0])).toBe(issueId(results[1]));
    expect(await total(from)).toBe('8');
  });
  it('prevents two issues from exceeding the remaining request quantity', async () => {
    const results = await Promise.all([issue(7), issue(7)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await total(from)).toBe('3');
    await issue(3).expect(201);
    expect(
      (await db.materialRequest.findUniqueOrThrow({ where: { id: mrId } }))
        .status,
    ).toBe('COMPLETED');
  });
  it('receives concurrent retries once without duplicate IN movements', async () => {
    const id = issueId(await issue(4).expect(201));
    const results = await Promise.all([receive(id), receive(id)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(await total(to)).toBe('4');
    expect(
      await db.stockTransaction.count({
        where: { stockIssueId: id, type: 'IN' },
      }),
    ).toBe(1);
  });
  it.each([0, -1, 0.0001, 11])(
    'rejects invalid or excessive issue quantity %s atomically',
    async (qty) => {
      await issue(qty).expect(400);
      await unchanged();
    },
  );
  it('rejects empty, duplicate and unrequested issue items', async () => {
    for (const items of [
      [],
      [
        { productId, quantity: 1 },
        { productId, quantity: 1 },
      ],
      [{ productId: 2147483647, quantity: 1 }],
    ]) {
      await issue(undefined, randomUUID(), { items }).expect(400);
      await unchanged();
    }
    await post(`/inventory/material-requests/${mrId}/issue`, {}).expect(400);
    await issue(1, randomUUID(), {
      items: [{ productId: 2147483648, quantity: 1 }],
    }).expect(400);
    await post('/inventory/transfer', {
      requestKey: randomUUID(),
      fromWarehouseId: 2147483648,
      toWarehouseId: to,
      items: [{ productId, quantity: 1 }],
    }).expect(400);
    await unchanged();
  });
  it('excludes expired automatic and explicitly chosen batches', async () => {
    await db.productStock.updateMany({
      where: { productId },
      data: { expiryDate: new Date(Date.now() - 86400000) },
    });
    await issue(1).expect(400);
    await issue(1, randomUUID(), {
      items: [{ productId, quantity: 1, batchNumber: 'A' }],
    }).expect(400);
    await unchanged();
  });
  it('rejects aggregate quantity drift rather than concealing it', async () => {
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: 12 },
    });
    await issue(1).expect(409);
    await unchanged();
  });
  it('rejects an explicitly selected quarantined batch and allocates usable stock automatically', async () => {
    await db.inventoryBatchRestriction.create({
      data: {
        hospitalId,
        productId,
        batchNumber: 'A',
        status: 'QUARANTINED',
        reason: 'Synthetic investigation',
      },
    });
    await issue(1, randomUUID(), {
      items: [{ productId, quantity: 1, batchNumber: 'A' }],
    }).expect(400);
    await unchanged();
    await issue(1).expect(201);
    expect(await db.stockIssueItem.count({ where: { batchNumber: 'A' } })).toBe(
      0,
    );
  });
  it('denies foreign warehouses and products on creation', async () => {
    const foreign = await db.hospital.create({
      data: { code: 'FOREIGN-TRANSFER', name: 'Synthetic foreign' },
    });
    const wh = await db.warehouse.create({
      data: { hospitalId: foreign.id, name: 'Foreign' },
    });
    const p = await db.product.create({
      data: { hospitalId: foreign.id, code: 'FOREIGN-P', name: 'Foreign' },
    });
    await create(1, { requestingWarehouseId: wh.id }).expect(400);
    await create(1, { items: [{ productId: p.id, requestedQty: 1 }] }).expect(
      400,
    );
    await create(1, {
      items: [
        { productId, requestedQty: 1 },
        { productId, requestedQty: 1 },
      ],
    }).expect(400);
    expect(await db.materialRequest.count()).toBe(1);
  });
  it('keeps a zero cost snapshot without falling back to a later price', async () => {
    await db.product.update({
      where: { id: productId },
      data: { costPrice: 0 },
    });
    const id = issueId(await issue(1).expect(201));
    await db.product.update({
      where: { id: productId },
      data: { costPrice: 99 },
    });
    await receive(id).expect(201);
    expect(
      (
        await db.stockTransaction.findMany({ where: { stockIssueId: id } })
      ).every((m) => m.totalCost.isZero()),
    ).toBe(true);
  });
  it('rejects incompatible destination batch metadata without partial receipt', async () => {
    const id = issueId(await issue(1).expect(201));
    await db.productStock.create({
      data: {
        hospitalId,
        warehouseId: to,
        productId,
        batchNumber: 'A',
        quantity: 0,
        expiryDate: new Date('2040-01-01'),
      },
    });
    await receive(id).expect(409);
    expect(await total(to)).toBe('0');
    expect(
      (await db.stockIssue.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('ISSUED');
  });
  it('runs the direct route through the same atomic FEFO transfer and replays it once', async () => {
    const body = {
      requestKey: randomUUID(),
      fromWarehouseId: from,
      toWarehouseId: to,
      items: [{ productId, quantity: 8 }],
    };
    const results = await Promise.all([
      post('/inventory/transfer', body),
      post('/inventory/transfer', body),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect(await total(from)).toBe('2');
    expect(await total(to)).toBe('8');
    expect(await db.stockIssue.count()).toBe(1);
    expect(await db.accountingEntry.count()).toBe(0);
    expect((await db.stockIssue.findFirstOrThrow()).status).toBe('RECEIVED');
    await post('/inventory/transfer', {
      ...body,
      items: [{ productId, quantity: 7 }],
    }).expect(409);
    const next = await create(1).expect(201);
    expect(idOf(next)).not.toBe(mrId);
  });
  it('links a recalled lot to its requesting department and records arrival after recall', async () => {
    const department = await db.department.create({
      data: { hospitalId, name: 'Synthetic receiving department' },
    });
    await db.materialRequest.update({
      where: { id: mrId },
      data: { fromDepartmentId: department.id },
    });
    const id = issueId(await issue(1).expect(201));
    const batch = await db.productStock.findFirstOrThrow({
      where: { hospitalId, productId, warehouseId: from, batchNumber: 'A' },
    });
    await post(`/inventory/stock/${batch.id}/batch-restriction`, {
      status: 'RECALLED',
      reason: 'Synthetic recall in transit',
    }).expect(201);
    const followup = () =>
      request(app.getHttpServer())
        .get(`/inventory/stock/${batch.id}/recall-followup`)
        .auth(token, { type: 'bearer' })
        .expect(200);
    expect(responseBody(await followup())).toMatchObject({
      movements: [
        {
          referenceType: 'MATERIAL_ISSUE',
          linked: true,
          referenceId: id,
          sourceWarehouse: 'Synthetic source',
          targetWarehouse: 'Synthetic destination',
          department: 'Synthetic receiving department',
          transferStatus: 'ISSUED',
        },
      ],
    });
    const issued = await db.stockTransaction.findFirstOrThrow({
      where: { stockIssueId: id, referenceType: 'MATERIAL_ISSUE' },
    });
    const notify = {
      audience: 'DEPARTMENT',
      outcome: 'NOTIFIED',
      channel: 'INTERNAL_HANDOFF',
      note: 'Synthetic department acknowledgement',
      requestId: randomUUID(),
    };
    await post(
      `/inventory/stock/${batch.id}/recall-contacts/${issued.id}`,
      notify,
    ).expect(201);
    await receive(id).expect(201);
    expect(responseBody(await followup())).toMatchObject({
      movements: [
        {
          referenceType: 'MATERIAL_RECEIVE',
          linked: true,
          transferStatus: 'RECEIVED',
          departmentOutcome: 'NOTIFIED',
        },
        {
          referenceType: 'MATERIAL_ISSUE',
          linked: true,
          transferStatus: 'RECEIVED',
          departmentOutcome: 'NOTIFIED',
        },
      ],
      stocks: [{ quantity: '5' }, { quantity: '1' }],
    });
    const received = await db.stockTransaction.findFirstOrThrow({
      where: { stockIssueId: id, referenceType: 'MATERIAL_RECEIVE' },
    });
    const contacts = `/inventory/stock/${batch.id}/recall-contacts/${received.id}`;
    await post(contacts, { ...notify, requestId: randomUUID() }).expect(409);
    await post(contacts, {
      ...notify,
      outcome: 'RESOLVED',
      note: 'Synthetic department follow-up verified',
      requestId: randomUUID(),
    }).expect(201);
    expect(
      responseBody(
        await request(app.getHttpServer())
          .get(contacts)
          .query({ audience: 'DEPARTMENT' })
          .auth(token, { type: 'bearer' })
          .expect(200),
      ),
    ).toMatchObject({
      records: [
        { movementId: received.id, outcome: 'RESOLVED' },
        { movementId: issued.id, outcome: 'NOTIFIED' },
      ],
    });
  });
  it('rolls back a direct transfer including its implicit request if receipt fails', async () => {
    await db.productStock.create({
      data: {
        hospitalId,
        warehouseId: to,
        productId,
        batchNumber: 'A',
        quantity: 0,
        expiryDate: new Date('2040-01-01'),
      },
    });
    await post('/inventory/transfer', {
      requestKey: randomUUID(),
      fromWarehouseId: from,
      toWarehouseId: to,
      items: [{ productId, quantity: 2 }],
    }).expect(409);
    await unchanged();
    expect(await db.materialRequest.count()).toBe(1);
  });
  it('does not permit the direct route to bypass a required approval policy', async () => {
    const org = await db.organization.create({
      data: { code: 'TRANSFER-ORG', name: 'Synthetic org' },
    });
    await db.hospital.update({
      where: { id: hospitalId },
      data: { organizationId: org.id },
    });
    await db.orgSetting.create({
      data: {
        organizationId: org.id,
        key: 'require_material_request_approval',
        value: 'true',
      },
    });
    await post('/inventory/transfer', {
      requestKey: randomUUID(),
      fromWarehouseId: from,
      toWarehouseId: to,
      items: [{ productId, quantity: 1 }],
    }).expect(400);
    const pending = idOf(await create(1).expect(201));
    await post(`/inventory/material-requests/${pending}/issue`, {
      requestKey: randomUUID(),
    }).expect(400);
    await post(`/inventory/material-requests/${pending}/approve`).expect(201);
    await post(`/inventory/material-requests/${pending}/issue`, {
      requestKey: randomUUID(),
    }).expect(201);
  });
  it('keeps base quantities and request quantities in their correct units', async () => {
    const uom = await db.unitOfMeasure.create({
      data: { hospitalId, code: 'BOX', name: 'Synthetic Box' },
    });
    await db.productUOM.create({
      data: { productId, uomId: uom.id, conversionRate: 10 },
    });
    mrId = idOf(
      await create(1, {
        items: [{ productId, uomId: uom.id, requestedQty: 1 }],
      }).expect(201),
    );
    const id = issueId(await issue().expect(201));
    expect(
      (
        await db.materialRequestItem.findFirstOrThrow({
          where: { materialRequestId: mrId },
        })
      ).issuedQty.toString(),
    ).toBe('1');
    expect(
      (
        await db.stockIssueItem.aggregate({
          where: { stockIssueId: id },
          _sum: { baseQuantity: true },
        })
      )._sum.baseQuantity?.toString(),
    ).toBe('10');
    await receive(id).expect(201);
    expect(await total(to)).toBe('10');
  });
  it('rejects a unit conversion that would silently round a stock quantity', async () => {
    const uom = await db.unitOfMeasure.create({
      data: { hospitalId, code: 'FRACTION', name: 'Synthetic Fraction' },
    });
    await db.productUOM.create({
      data: { productId, uomId: uom.id, conversionRate: '0.333' },
    });
    mrId = idOf(
      await create(0.1, {
        items: [{ productId, uomId: uom.id, requestedQty: 0.1 }],
      }).expect(201),
    );
    await issue().expect(400);
    await unchanged();
  });
  it('exposes owned in-transit snapshots until receipt and isolates other branches', async () => {
    const id = issueId(await issue(2).expect(201));
    const response = await request(app.getHttpServer())
      .get('/inventory/in-transit')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id,
        status: 'ISSUED',
        items: [expect.objectContaining({ issuedQty: '2', totalCost: '4.69' })],
      }),
    ]);
    const other = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'foreign-reader',
      'synthetic',
      { permissions: ['inventory:view'] },
    );
    const foreign = await db.hospital.create({
      data: { code: 'TRANSIT-FOREIGN', name: 'Synthetic isolated branch' },
    });
    await db.user.update({
      where: { id: other.user.id },
      data: { hospitalId: foreign.id },
    });
    const jwt = await app.get(JwtService).signAsync(
      {
        ...(await testStaffSessionClaims(db, other.user.id, foreign.id)),
        sub: other.user.id,
        hospitalId: foreign.id,
        roles: [],
        permissions: [],
      },
      { secret: process.env.JWT_SECRET, issuer: 'saraya-staff' },
    );
    await request(app.getHttpServer())
      .get('/inventory/in-transit')
      .auth(jwt, { type: 'bearer' })
      .expect(200)
      .expect([]);
    await receive(id).expect(201);
    await request(app.getHttpServer())
      .get('/inventory/in-transit')
      .auth(token, { type: 'bearer' })
      .expect(200)
      .expect([]);
  });
  it('prevents competing requests from overdrawing the same warehouse stock', async () => {
    const second = idOf(await create(7).expect(201));
    const results = await Promise.all([
      issue(7),
      post(`/inventory/material-requests/${second}/issue`, {
        requestKey: randomUUID(),
        items: [{ productId, quantity: 7 }],
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await total(from)).toBe('3');
    expect(await db.stockIssue.count()).toBe(1);
  });
  it('denies issuing a soft-deleted product without creating transfer effects', async () => {
    await db.product.update({
      where: { id: productId },
      data: { isDeleted: true },
    });
    await issue(1).expect(400);
    await unchanged();
  });
  it('keeps service depletion and transfer quantities consistent under competition', async () => {
    await db.product.update({
      where: { id: productId },
      data: { costPrice: 0 },
    });
    const service = await db.serviceItem.create({
      data: {
        hospitalId,
        name: 'Synthetic consumption',
        type: 'OTHER',
        defaultPrice: 0,
      },
    });
    await db.serviceItemProduct.create({
      data: { serviceItemId: service.id, productId, quantity: 7 },
    });
    const user = await db.user.findFirstOrThrow({ where: { hospitalId } });
    let reference = 100000;
    const consume = () =>
      app
        .get(InventoryService)
        .autoDepleteServiceMaterials(
          hospitalId,
          service.id,
          from,
          1,
          user.id,
          ++reference,
          'TEST_SERVICE',
        );
    const results = await Promise.allSettled([consume(), consume()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await total(from)).toBe('3');
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('3');
    const id = issueId(await issue(3).expect(201));
    await receive(id).expect(201);
    expect(await total(to)).toBe('3');
  });
  it('rolls back depletion when the product summary is insufficient', async () => {
    const service = await db.serviceItem.create({
      data: {
        hospitalId,
        name: 'Synthetic consumption rollback',
        type: 'OTHER',
        defaultPrice: 0,
      },
    });
    await db.serviceItemProduct.create({
      data: { serviceItemId: service.id, productId, quantity: 2 },
    });
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: 1 },
    });
    const user = await db.user.findFirstOrThrow({ where: { hospitalId } });
    await expect(
      app
        .get(InventoryService)
        .autoDepleteServiceMaterials(
          hospitalId,
          service.id,
          from,
          1,
          user.id,
          service.id,
          'TEST_SERVICE',
        ),
    ).rejects.toThrow();
    await unchanged();
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('1');
  });
  it('deduplicates concurrent and sequential consumption retries atomically', async () => {
    await db.product.update({
      where: { id: productId },
      data: { costPrice: 0 },
    });
    const svc = await db.serviceItem.create({
      data: {
        hospitalId,
        name: 'Idempotent synthetic service',
        type: 'OTHER',
        defaultPrice: 0,
      },
    });
    await db.serviceItemProduct.create({
      data: { serviceItemId: svc.id, productId, quantity: 2 },
    });
    const user = await db.user.findFirstOrThrow({ where: { hospitalId } });
    const consume = () =>
      app
        .get(InventoryService)
        .autoDepleteServiceMaterials(
          hospitalId,
          svc.id,
          from,
          1,
          user.id,
          svc.id,
          'REPLAY_TEST',
        );
    await Promise.all([consume(), consume()]);
    await consume();
    expect(await total(from)).toBe('8');
    expect(await db.serviceMaterialConsumption.count()).toBe(1);
    expect(
      (await db.serviceMaterialConsumption.findFirstOrThrow()).status,
    ).toBe('COMPLETED');
    await expect(
      app
        .get(InventoryService)
        .autoDepleteServiceMaterials(
          hospitalId,
          svc.id,
          from,
          2,
          user.id,
          svc.id,
          'REPLAY_TEST',
        ),
    ).rejects.toThrow();
    expect(await total(from)).toBe('8');
  });
  it('retains a failed event and retries it without double consumption', async () => {
    await db.product.update({
      where: { id: productId },
      data: { costPrice: 0 },
    });
    const svc = await db.serviceItem.create({
      data: {
        hospitalId,
        name: 'Retry synthetic service',
        type: 'OTHER',
        defaultPrice: 0,
      },
    });
    await db.serviceItemProduct.create({
      data: { serviceItemId: svc.id, productId, quantity: 2 },
    });
    const user = await db.user.findFirstOrThrow({ where: { hospitalId } });
    const listener = app.get(InventoryAutoDepletionListener);
    await db.consumptionWarehousePolicy.create({
      data: { hospitalId, warehouseId: from, updatedById: user.id },
    });
    const payload = {
      hospitalId,
      serviceItemId: svc.id,
      performerId: user.id,
      referenceType: 'RETRY_TEST',
      referenceId: svc.id,
    };
    await db.productStock.updateMany({
      where: { productId },
      data: { expiryDate: new Date('2000-01-01') },
    });
    await listener.handleServiceCompletedEvent(payload);
    expect(
      (await db.serviceMaterialConsumption.findFirstOrThrow()).status,
    ).toBe('FAILED');
    expect(await total(from)).toBe('10');
    await db.productStock.updateMany({
      where: { productId },
      data: { expiryDate: new Date('2040-01-01') },
    });
    await db.serviceMaterialConsumption.updateMany({
      data: { nextRetryAt: new Date('2000-01-01') },
    });
    await db.serviceItemProduct.updateMany({
      where: { serviceItemId: svc.id },
      data: { quantity: 1 },
    });
    await listener.retryPending();
    await listener.handleServiceCompletedEvent(payload);
    expect(await total(from)).toBe('8');
    expect(
      (await db.serviceMaterialConsumption.findFirstOrThrow()).status,
    ).toBe('COMPLETED');
  });
  it('does not grant write access to inventory viewers', async () => {
    const reader = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'viewer',
      'synthetic',
      { hospitalId, permissions: ['inventory:view'] },
    );
    await post(
      `/inventory/material-requests/${mrId}/issue`,
      { requestKey: randomUUID() },
      reader.accessToken,
    ).expect(403);
    await post(
      '/inventory/transfer',
      {
        requestKey: randomUUID(),
        fromWarehouseId: from,
        toWarehouseId: to,
        items: [{ productId, quantity: 1 }],
      },
      reader.accessToken,
    ).expect(403);
    await unchanged();
  });
  it.each(['ISSUE_INTERNAL_TRANSFER', 'RECEIVE_INTERNAL_TRANSFER'])(
    'rolls back all effects on mandatory %s audit failure',
    async (action) => {
      const id =
        action === 'RECEIVE_INTERNAL_TRANSFER'
          ? issueId(await issue(2).expect(201))
          : undefined;
      await db.$executeRawUnsafe(
        `CREATE FUNCTION repair_test_transfer_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN RAISE EXCEPTION 'synthetic transfer audit failure'; END IF; RETURN NEW; END $$`,
      );
      try {
        await db.$executeRawUnsafe(
          'CREATE TRIGGER repair_test_transfer_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION repair_test_transfer_failure()',
        );
        if (id) {
          await receive(id).expect(500);
          expect(await total(to)).toBe('0');
          expect(await total(from)).toBe('8');
          expect(
            (await db.stockIssue.findUniqueOrThrow({ where: { id } })).status,
          ).toBe('ISSUED');
        } else {
          await issue(2).expect(500);
          await unchanged();
        }
      } finally {
        await db.$executeRawUnsafe(
          'DROP TRIGGER IF EXISTS repair_test_transfer_failure ON "AuditLog"',
        );
        await db.$executeRawUnsafe(
          'DROP FUNCTION repair_test_transfer_failure()',
        );
      }
    },
  );
});
