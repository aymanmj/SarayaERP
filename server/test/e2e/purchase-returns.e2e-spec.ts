import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccountingService } from '../../src/accounting/accounting.service';
import { drainPendingAuditWrites } from '../../src/audit/audit-chain';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { InventoryService } from '../../src/inventory/inventory.service';

describe('Atomic purchase returns and supplier reconciliation (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let token: string;
  let reader: string;
  let hospitalId: number;
  let userId: number;
  let invoiceId: number;
  let lineId: number;
  let productId: number;
  let warehouseId: number;
  let supplierId: number;
  let periodId: number;
  const post = (url: string, body: object = {}, access = token) =>
    request(app.getHttpServer())
      .post(url)
      .set('Authorization', 'Bearer ' + access)
      .send(body);
  const get = (url: string) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', 'Bearer ' + token);
  const idOf = (r: request.Response) => (r.body as { id: number }).id;
  const reason = 'Synthetic documented supplier return';
  const dto = (quantity = 3, requestId = randomUUID()) => ({
    purchaseInvoiceId: invoiceId,
    reason,
    requestId,
    items: [{ productId, purchaseInvoiceLineId: lineId, quantity }],
  });
  const ret = (quantity = 3, key = randomUUID()) =>
    post('/purchases/returns', dto(quantity, key));
  const addInvoice = async (
    lines: { quantity: number; unitPrice: number; batchNumber: string }[],
  ) => {
    const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    const inv = await db.purchaseInvoice.create({
      data: {
        hospitalId,
        supplierId,
        warehouseId,
        invoiceDate: new Date(),
        totalAmount: total,
        netAmount: total,
        lines: {
          create: lines.map((l) => ({
            ...l,
            productId,
            totalAmount: l.quantity * l.unitPrice,
            description: 'Synthetic purchased product',
          })),
        },
      },
    });
    await post(`/purchases/invoices/${inv.id}/approve`)
      .expect((response) => {
        if (response.status !== 201)
          throw new Error(JSON.stringify(response.body));
      })
      .expect(201);
    return inv.id;
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
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
    const auth = new AuthHelper(db, app.get(JwtService));
    const actor = await auth.createTestUser(
      'purchase-return-maker',
      'synthetic',
      {
        permissions: [
          'purchases:manage',
          'purchases:invoice:approve',
          'suppliers:manage',
        ],
      },
    );
    token = actor.accessToken;
    hospitalId = actor.user.hospitalId;
    userId = actor.user.id;
    reader = (
      await auth.createTestUser('purchase-return-reader', 'synthetic', {
        hospitalId,
        permissions: ['cashier:view'],
      })
    ).accessToken;
    await app
      .get(AccountingService)
      .ensureDefaultAccountsForHospital(hospitalId);
    for (const [key, type] of [
      ['INVENTORY_DRUGS', 'ASSET'],
      ['INVENTORY_LOSS', 'EXPENSE'],
      ['INVENTORY_GAIN', 'REVENUE'],
    ] as const) {
      const account = await db.account.create({
        data: { hospitalId, code: 'SYNTHETIC-' + key, name: key, type },
      });
      await db.systemAccountMapping.upsert({
        where: { hospitalId_key: { hospitalId, key } },
        update: { accountId: account.id, isActive: true },
        create: { hospitalId, key, accountId: account.id },
      });
    }
    const year = new Date().getUTCFullYear();
    const fy = await db.financialYear.create({
      data: {
        hospitalId,
        code: 'RETURN-FY',
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
          periodCode: 'RETURN-P',
          periodIndex: 1,
          monthStartDate: new Date(`${year}-01-01`),
          monthEndDate: new Date(`${year}-12-31`),
          numberOfDays: 365,
          isOpen: true,
        },
      })
    ).id;
    supplierId = (
      await db.supplier.create({
        data: { hospitalId, name: 'Synthetic return supplier' },
      })
    ).id;
    warehouseId = (
      await db.warehouse.create({
        data: { hospitalId, name: 'Synthetic return warehouse' },
      })
    ).id;
    productId = (
      await db.product.create({
        data: {
          hospitalId,
          code: 'SYNTHETIC-RETURN-DRUG',
          name: 'Synthetic return drug',
          type: 'DRUG',
        },
      })
    ).id;
    invoiceId = await addInvoice([
      { quantity: 10, unitPrice: 10, batchNumber: 'ORIGINAL-A' },
    ]);
    lineId = (
      await db.purchaseInvoiceLine.findFirstOrThrow({
        where: { purchaseInvoiceId: invoiceId },
      })
    ).id;
  });
  it('commits stock, supplier credit, journal and audit together without changing the original invoice', async () => {
    const before = await db.purchaseInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const id = idOf(await ret().expect(201));
    const done = await db.purchaseReturn.findUniqueOrThrow({ where: { id } });
    expect(done.status).toBe('COMPLETED');
    expect(done.totalAmount.toString()).toBe('30');
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('7');
    expect(
      (
        await db.productStock.findFirstOrThrow({
          where: { hospitalId, productId, batchNumber: 'ORIGINAL-A' },
        })
      ).quantity.toString(),
    ).toBe('7');
    expect(
      await db.stockTransaction.count({
        where: {
          purchaseReturnId: id,
          type: 'OUT',
          baseQuantity: 3,
          totalCost: 30,
        },
      }),
    ).toBe(1);
    const entry = await db.accountingEntry.findUniqueOrThrow({
      where: { postingKey: `purchase-return:${hospitalId}:${id}` },
      include: { lines: true },
    });
    expect(
      entry.lines.map((l) => [l.debit.toString(), l.credit.toString()]),
    ).toEqual([
      ['30', '0'],
      ['0', '30'],
    ]);
    expect(
      await db.purchaseInvoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toEqual(before);
    expect(
      await db.auditLog.count({
        where: {
          hospitalId,
          entity: 'PurchaseReturn',
          entityId: id,
          action: 'COMPLETE_PURCHASE_RETURN',
        },
      }),
    ).toBe(1);
  });
  async function disposalFixture(isolatedQuantity = '10') {
    const batch = await db.productStock.findFirstOrThrow({
      where: { hospitalId, productId, warehouseId },
    });
    const inventory = app.get(InventoryService);
    await inventory.changeBatchRestriction(
      hospitalId,
      userId,
      batch.id,
      'RECALLED',
      'Synthetic disposal recall',
    );
    const auth = new AuthHelper(db, app.get(JwtService));
    const operator = await auth.createTestUser(
      'disposal-operator',
      'synthetic',
      {
        hospitalId,
        permissions: ['inventory:manage', 'inventory:recall-disposal:review'],
      },
    );
    const reviewer = await auth.createTestUser(
      'disposal-reviewer',
      'synthetic',
      {
        hospitalId,
        permissions: ['inventory:recall-disposal:review'],
      },
    );
    const poster = await auth.createTestUser('disposal-poster', 'synthetic', {
      hospitalId,
      permissions: ['inventory:recall-disposal:post'],
    });
    const isolation = await inventory.recordRecallIsolation(
      hospitalId,
      operator.user.id,
      batch.id,
      {
        stockVersion: batch.version,
        isolatedQuantity,
        location: 'Quarantine shelf',
        reason: 'Witnessed isolation',
        requestId: randomUUID(),
      },
    );
    const route = `/inventory/stock/${batch.id}/recall-disposals`;
    const open = (quantity: string, requestId = randomUUID()) =>
      post(
        route,
        {
          isolationId: isolation.id,
          quantity,
          reason: 'Synthetic recall destruction',
          requestId,
        },
        operator.accessToken,
      );
    const approve = (id: number, access = reviewer.accessToken) =>
      post(
        `${route}/${id}/review`,
        { decision: 'APPROVE', note: 'Verified disposal approval' },
        access,
      );
    const evidence = (id: number, quantity: string) =>
      post(
        `${route}/${id}/evidence`,
        {
          quantity,
          evidenceReference: 'SYNTHETIC-DESTRUCTION',
          performedBy: 'Synthetic witness',
          performedAt: new Date().toISOString(),
        },
        operator.accessToken,
      );
    const reconcile = (
      id: number,
      countedRemaining: string,
      access = reviewer.accessToken,
    ) =>
      post(
        `${route}/${id}/reconcile`,
        {
          countedRemaining,
          reference: 'SYNTHETIC-COUNT-1',
          note: 'Independently counted remaining recalled stock',
        },
        access,
      );
    return {
      batch,
      route,
      operator,
      reviewer,
      poster,
      open,
      approve,
      evidence,
      reconcile,
    };
  }

  it('reserves verified recall stock, rolls back on ledger failure and posts a partial disposal once', async () => {
    const f = await disposalFixture();
    await f.open('10.001').expect(400);
    const key = randomUUID();
    const first = idOf(await f.open('3.250', key).expect(201));
    expect(idOf(await f.open('3.25', key).expect(201))).toBe(first);
    await f.open('3.251', key).expect(409);
    await f.approve(first, f.operator.accessToken).expect(403);
    const second = idOf(await f.open('2').expect(201));
    const competing = await Promise.all([f.approve(first), f.approve(second)]);
    expect(competing.map(({ status }) => status).sort()).toEqual([201, 409]);
    const approved = competing[0].status === 201 ? first : second;
    const quantity = approved === first ? '3.25' : '2';
    await ret(1).expect(409);
    await expect(
      db.productStock.update({
        where: { id: f.batch.id },
        data: { quantity: { decrement: 1 } },
      }),
    ).rejects.toThrow('reserved for an approved recall disposal');
    await f.evidence(approved, quantity).expect(201);
    const posting = `${f.route}/${approved}/post`;
    await post(posting, {}, f.operator.accessToken).expect(403);
    await db.financialPeriod.update({
      where: { id: periodId },
      data: { isOpen: false },
    });
    await post(posting, {}, f.poster.accessToken).expect(400);
    await drainPendingAuditWrites();
    expect(
      await db.auditLog.count({
        where: {
          hospitalId,
          userId: f.poster.user.id,
          OR: [
            { entity: 'StockTransaction' },
            { entity: 'AccountingEntry' },
            { action: 'RECALL_DISPOSAL_POSTED' },
          ],
        },
      }),
    ).toBe(0);
    expect(
      await db.stockTransaction.count({
        where: { hospitalId, referenceType: 'RECALL_DISPOSAL' },
      }),
    ).toBe(0);
    expect(
      await db.inventoryRecallDisposal.findUnique({ where: { id: approved } }),
    ).toMatchObject({
      status: 'EXECUTED',
      evidenceReference: 'SYNTHETIC-DESTRUCTION',
      movementId: null,
    });
    await db.financialPeriod.update({
      where: { id: periodId },
      data: { isOpen: true },
    });
    const [one, two] = await Promise.all([
      post(posting, {}, f.poster.accessToken).expect(201),
      post(posting, {}, f.poster.accessToken).expect(201),
    ]);
    expect(one.body).toEqual(two.body);
    expect(
      await db.auditLog.count({
        where: {
          hospitalId,
          userId: f.poster.user.id,
          action: 'RECALL_DISPOSAL_POSTED',
          entityId: approved,
        },
      }),
    ).toBe(1);
    const value = quantity === '3.25' ? '32.5' : '20';
    const remaining = quantity === '3.25' ? '6.75' : '8';
    const journal = await db.accountingEntry.findUniqueOrThrow({
      where: { postingKey: `recall-disposal:${hospitalId}:${approved}` },
      include: { lines: { include: { account: true } } },
    });
    expect(
      journal.lines.map((line) => [
        line.account.type,
        line.debit.toString(),
        line.credit.toString(),
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['EXPENSE', value, '0'],
        ['ASSET', '0', value],
      ]),
    );
    expect(
      (
        await db.productStock.findUniqueOrThrow({ where: { id: f.batch.id } })
      ).quantity.toString(),
    ).toBe(remaining);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe(remaining);
    expect(
      await db.stockTransaction.count({
        where: { hospitalId, referenceType: 'RECALL_DISPOSAL' },
      }),
    ).toBe(1);
    const trace = await app
      .get(InventoryService)
      .recallFollowup(hospitalId, userId, f.batch.id, false);
    expect(
      trace.movements.find((row) => row.referenceType === 'RECALL_DISPOSAL'),
    ).toMatchObject({ referenceId: approved, linked: true });
    await f.approve(approved === first ? second : first).expect(409);
  });

  it('holds a partial discrepancy until independent reconciliation and posts the actual quantity once', async () => {
    const f = await disposalFixture();
    const beforeExecution = idOf(await f.open('2').expect(201));
    await f.approve(beforeExecution).expect(201);
    const cancel = (id: number) =>
      post(
        `${f.route}/${id}/review`,
        {
          decision: 'CANCEL',
          note: 'Cancelled before physical execution',
        },
        f.reviewer.accessToken,
      );
    await cancel(beforeExecution).expect(201);
    await cancel(beforeExecution).expect(201);
    const id = idOf(await f.open('3').expect(201));
    await f.approve(id).expect(201);
    await f.evidence(id, '2.875').expect(201);
    await cancel(id).expect(409);
    await post(`${f.route}/${id}/post`, {}, f.poster.accessToken).expect(409);
    expect(
      (
        await db.inventoryRecallDisposal.findUniqueOrThrow({ where: { id } })
      ).performedQuantity?.toString(),
    ).toBe('2.875');
    await ret(1).expect(409);
    await f.reconcile(id, '7.125', f.operator.accessToken).expect(403);
    await f.reconcile(id, '7.125', f.poster.accessToken).expect(403);
    await f.reconcile(id, '7.126').expect(409);
    const first = await f.reconcile(id, '7.125').expect(201);
    const replay = await f.reconcile(id, '7.125').expect(201);
    expect(replay.body).toEqual(first.body);
    expect(first.body).toMatchObject({
      status: 'EXECUTED',
      quantity: '3',
      performedQuantity: '2.875',
      countedRemaining: '7.125',
    });
    await f.reconcile(id, '7.126').expect(409);
    await expect(
      db.inventoryRecallDisposal.update({
        where: { id },
        data: { reconciliationReference: 'REWRITE', countedRemaining: '7.125' },
      }),
    ).rejects.toThrow('Invalid recall disposal transition');
    await ret(1).expect(409);
    const result = await post(
      `${f.route}/${id}/post`,
      {},
      f.poster.accessToken,
    ).expect(201);
    expect(result.body).toMatchObject({
      status: 'POSTED',
      quantity: '3',
      performedQuantity: '2.875',
      valuationAfter: '71.25',
    });
    expect(
      await db.auditLog.count({
        where: {
          hospitalId,
          entityId: id,
          action: 'RECALL_DISPOSAL_RECONCILED',
        },
      }),
    ).toBe(1);
    expect(
      (
        await db.productStock.findUniqueOrThrow({ where: { id: f.batch.id } })
      ).quantity.toString(),
    ).toBe('7.125');
    const movement = await db.stockTransaction.findFirstOrThrow({
      where: { hospitalId, referenceId: id, referenceType: 'RECALL_DISPOSAL' },
    });
    expect(movement.quantity.toString()).toBe('2.875');
  });

  it.each([
    {
      actual: '4.250',
      remaining: '5.750',
      isolated: '5',
      outcome: 'EXECUTED',
      expected: 201,
    },
    {
      actual: '4.250',
      remaining: '5.750',
      isolated: '4',
      outcome: 'EXECUTED',
      expected: 400,
    },
    {
      actual: '0',
      remaining: '10',
      isolated: '5',
      outcome: 'NO_DISPOSAL',
      expected: 201,
    },
  ])(
    'reconciles $actual actual units against $isolated isolated units with status $expected',
    async ({ actual, remaining, isolated, outcome, expected }) => {
      const f = await disposalFixture(isolated);
      const id = idOf(await f.open('3').expect(201));
      await f.approve(id).expect(201);
      await f.evidence(id, actual).expect(201);
      await f.reconcile(id, remaining).expect(expected);
      const row = await db.inventoryRecallDisposal.findUniqueOrThrow({
        where: { id },
      });
      expect(row.status).toBe(outcome);
      if (expected === 400) {
        await ret(1).expect(409);
        return;
      }
      if (outcome === 'NO_DISPOSAL') {
        expect(row.movementId).toBeNull();
        expect(row.accountingEntryId).toBeNull();
        await post(`${f.route}/${id}/post`, {}, f.poster.accessToken).expect(
          409,
        );
        expect(
          (
            await db.productStock.findUniqueOrThrow({
              where: { id: f.batch.id },
            })
          ).quantity.toString(),
        ).toBe('10');
        await ret(1).expect(201);
        return;
      }
      await post(`${f.route}/${id}/post`, {}, f.poster.accessToken).expect(201);
      expect(
        (
          await db.productStock.findUniqueOrThrow({ where: { id: f.batch.id } })
        ).quantity.toString(),
      ).toBe('5.75');
    },
  );

  it('reopens investigation after escalation and approves a matched recount without bypassing the reservation', async () => {
    const f = await disposalFixture();
    const id = idOf(await f.open('3').expect(201));
    await f.approve(id).expect(201);
    await f.evidence(id, '2.875').expect(201);
    const route = `${f.route}/${id}/investigations`;
    const history = await request(app.getHttpServer())
      .get(route)
      .auth(f.operator.accessToken, { type: 'bearer' })
      .expect(200);
    const snapshot = history.body as {
      version: number;
      movements: { id: number }[];
    };
    expect(snapshot.movements.length).toBeGreaterThan(0);
    const payload = {
      version: snapshot.version,
      movementIds: snapshot.movements.map(({ id }) => id),
      requestId: randomUUID(),
      countReference: 'COUNT-001',
      countedRemaining: '7',
      findings:
        'Second count found an unexplained shortfall after checking receipts and issues.',
    };
    const submit = (data = payload) =>
      post(route, data, f.operator.accessToken);
    const decision = (
      findingId: number,
      outcome: 'RESOLVE' | 'ESCALATE',
      access = f.reviewer.accessToken,
    ) =>
      post(
        `${route}/${findingId}/review`,
        {
          decision: outcome,
          note: 'Independent review of count and movements',
        },
        access,
      );
    await submit({ ...payload, movementIds: [] }).expect(409);
    const proposal = idOf(await submit().expect(201));
    expect(idOf(await submit().expect(201))).toBe(proposal);
    await submit({ ...payload, requestId: randomUUID() }).expect(409);
    await decision(proposal, 'RESOLVE', f.operator.accessToken).expect(403);
    await decision(proposal, 'RESOLVE').expect(409);
    expect(
      (
        await db.inventoryRecallDisposalInvestigation.findUniqueOrThrow({
          where: { id: proposal },
        })
      ).status,
    ).toBe('SUBMITTED');
    await f.reconcile(id, '7.125').expect(409);
    await decision(proposal, 'ESCALATE').expect(201);
    await ret(1).expect(409);
    const next = idOf(
      await submit({
        ...payload,
        requestId: randomUUID(),
        countReference: 'COUNT-002',
        countedRemaining: '7.125',
        findings:
          'Independent recount matched the documented disposal and reviewed movements.',
      }).expect(201),
    );
    await expect(
      db.inventoryRecallDisposalInvestigation.update({
        where: { id: next },
        data: { findings: 'Attempt to overwrite the submitted report' },
      }),
    ).rejects.toThrow('Invalid recall disposal investigation transition');
    const once = await decision(next, 'RESOLVE').expect(201);
    const duplicate = await decision(next, 'RESOLVE').expect(201);
    expect(once.body).toEqual(duplicate.body);
    expect(
      await db.inventoryRecallDisposal.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({
      status: 'EXECUTED',
      reconciliationReference: 'COUNT-002',
      reconciledById: f.reviewer.user.id,
    });
    await ret(1).expect(409);
    const posted = await post(
      `${f.route}/${id}/post`,
      {},
      f.poster.accessToken,
    ).expect(201);
    expect(posted.body).toMatchObject({
      status: 'POSTED',
      performedQuantity: '2.875',
    });
    expect(
      (
        await db.productStock.findUniqueOrThrow({ where: { id: f.batch.id } })
      ).quantity.toString(),
    ).toBe('7.125');
  });

  it('keeps an investigation above the isolated limit escalated and retains the stock hold', async () => {
    const f = await disposalFixture('4');
    const id = idOf(await f.open('3').expect(201));
    await f.approve(id).expect(201);
    await f.evidence(id, '4.250').expect(201);
    const route = `${f.route}/${id}/investigations`;
    const history = await request(app.getHttpServer())
      .get(route)
      .auth(f.reviewer.accessToken, { type: 'bearer' })
      .expect(200);
    const snapshot = history.body as {
      version: number;
      movements: { id: number }[];
    };
    const proposal = idOf(
      await post(
        route,
        {
          version: snapshot.version,
          movementIds: snapshot.movements.map(({ id }) => id),
          requestId: randomUUID(),
          countReference: 'OVER-ISOLATION',
          countedRemaining: '5.750',
          findings: 'Disposal exceeded the confirmed isolated quantity.',
        },
        f.operator.accessToken,
      ).expect(201),
    );
    const review = (decision: string) =>
      post(
        `${route}/${proposal}/review`,
        { decision, note: 'Physical reconciliation review' },
        f.reviewer.accessToken,
      );
    await review('RESOLVE').expect(400);
    await review('ESCALATE').expect(201);
    await post(`${f.route}/${id}/post`, {}, f.poster.accessToken).expect(409);
    await ret(1).expect(409);
  });

  it('posts a full zero cost disposal without a journal and denies cross-facility access', async () => {
    const f = await disposalFixture();
    const foreign = await db.hospital.create({
      data: { code: 'FOREIGN-DISPOSAL', name: 'Synthetic foreign facility' },
    });
    const stranger = await new AuthHelper(
      db,
      app.get(JwtService),
    ).createTestUser('disposal-foreign', 'synthetic', {
      hospitalId: foreign.id,
      permissions: ['inventory:recall-disposal:review'],
    });
    const id = idOf(await f.open('10').expect(201));
    await f.approve(id, stranger.accessToken).expect(404);
    const listed = await request(app.getHttpServer())
      .get(f.route)
      .auth(f.reviewer.accessToken, { type: 'bearer' })
      .expect(200);
    expect(listed.body).toMatchObject({
      records: [{ id, isolation: { isolatedQuantity: '10', onHand: '10' } }],
    });
    await db.product.update({
      where: { id: productId },
      data: { costPrice: 0 },
    });
    await f.approve(id).expect(201);
    await f.evidence(id, '10').expect(201);
    const posted = await post(
      `${f.route}/${id}/post`,
      {},
      f.poster.accessToken,
    ).expect(201);
    expect(posted.body).toMatchObject({
      status: 'POSTED',
      accountingEntryId: null,
      valuationBefore: '0',
      valuationAfter: '0',
    });
    expect(
      (
        await db.productStock.findUniqueOrThrow({ where: { id: f.batch.id } })
      ).quantity.toString(),
    ).toBe('0');
  });

  it('posts the difference between rounded inventory valuations for fractional disposal', async () => {
    const f = await disposalFixture();
    await db.product.update({
      where: { id: productId },
      data: { costPrice: '0.003' },
    });
    const id = idOf(await f.open('3.500').expect(201));
    await f.approve(id).expect(201);
    await f.evidence(id, '3.500').expect(201);
    const result = await post(
      `${f.route}/${id}/post`,
      {},
      f.poster.accessToken,
    ).expect(201);
    expect(result.body).toMatchObject({
      valuationBefore: '0.03',
      valuationAfter: '0.02',
    });
    const movement = await db.stockTransaction.findFirstOrThrow({
      where: { hospitalId, referenceType: 'RECALL_DISPOSAL', referenceId: id },
    });
    expect(movement.totalCost.toString()).toBe('0.01');
    const entry = await db.accountingEntry.findUniqueOrThrow({
      where: { postingKey: `recall-disposal:${hospitalId}:${id}` },
      include: { lines: true },
    });
    expect(entry.lines.map(({ debit }) => debit.toString()).sort()).toEqual([
      '0',
      '0.01',
    ]);
  });

  it('records partial supplier delivery and rejects duplicate or excessive evidence on a recalled return', async () => {
    const batch = await db.productStock.findFirstOrThrow({
      where: { hospitalId, productId, warehouseId },
    });
    const inventory = app.get(InventoryService);
    await inventory.changeBatchRestriction(
      hospitalId,
      userId,
      batch.id,
      'RECALLED',
      'Synthetic supplier recall',
    );
    const returned = await ret().expect(201);
    const movement = await db.stockTransaction.findFirstOrThrow({
      where: { purchaseReturnId: idOf(returned), hospitalId },
    });
    expect(
      await inventory.recallFollowup(hospitalId, userId, batch.id, false),
    ).toMatchObject({
      movements: [
        {
          referenceType: 'PURCHASE_RETURN',
          referenceId: idOf(returned),
          linked: true,
          canRecordSupplierReceipt: true,
        },
      ],
    });
    const auth = new AuthHelper(db, app.get(JwtService));
    const manager = await auth.createTestUser(
      'recall-supplier-manager',
      'synthetic',
      { hospitalId, permissions: ['inventory:manage'] },
    );
    const foreign = await db.hospital.create({
      data: { code: 'FOREIGN-RECALL-SUPPLIER', name: 'Synthetic foreign' },
    });
    const outsider = await auth.createTestUser(
      'recall-supplier-outsider',
      'synthetic',
      {
        hospitalId: foreign.id,
        permissions: ['inventory:manage'],
      },
    );
    const path = `/inventory/stock/${batch.id}/recall-supplier-receipts/${movement.id}`;
    const read = (access = manager.accessToken) =>
      request(app.getHttpServer()).get(path).auth(access, { type: 'bearer' });
    const initial = await read().expect(200);
    expect(initial.body).toMatchObject({
      returnedQuantity: '3',
      acknowledgedQuantity: '0',
      outstandingQuantity: '3',
      records: [],
    });
    await read(outsider.accessToken).expect(404);
    await read(reader).expect(403);
    const financialEntries = await db.accountingEntry.count({
      where: { hospitalId },
    });
    const stockBefore = await db.productStock.findUniqueOrThrow({
      where: { id: batch.id },
    });
    const evidence = {
      quantity: '1.000',
      evidenceReference: 'SYNTH-RECEIPT-1',
      receivedBy: 'Synthetic supplier representative',
      receivedAt: new Date(Date.now() - 60_000).toISOString(),
      requestId: randomUUID(),
    };
    const save = (data: typeof evidence, access = manager.accessToken) =>
      post(path, data, access);
    await save(evidence, outsider.accessToken).expect(404);
    await save({
      ...evidence,
      receivedAt: new Date(Date.now() + 3600000).toISOString(),
    }).expect(400);
    const replays = await Promise.all([
      save(evidence).expect(201),
      save(evidence).expect(201),
    ]);
    expect(replays[0].body).toEqual(replays[1].body);
    await save({ ...evidence, quantity: '0.500' }).expect(409);
    await save({ ...evidence, requestId: randomUUID() }).expect(409);
    const competing = await Promise.all(
      ['2', '3'].map((index) =>
        save({
          ...evidence,
          evidenceReference: `SYNTH-RECEIPT-${index}`,
          quantity: '1.500',
          requestId: randomUUID(),
        }),
      ),
    );
    expect(competing.map(({ status }) => status).sort()).toEqual([201, 400]);
    expect((await read().expect(200)).body).toMatchObject({
      acknowledgedQuantity: '2.5',
      outstandingQuantity: '0.5',
    });
    await save({
      ...evidence,
      quantity: '0.500',
      evidenceReference: 'SYNTH-RECEIPT-4',
      requestId: randomUUID(),
    }).expect(201);
    expect((await read().expect(200)).body).toMatchObject({
      acknowledgedQuantity: '3',
      outstandingQuantity: '0',
    });
    const row = await db.inventoryRecallSupplierReceipt.findFirstOrThrow({
      where: { movementId: movement.id },
    });
    await expect(
      db.inventoryRecallSupplierReceipt.create({
        data: {
          hospitalId,
          movementId: movement.id,
          recordedById: manager.user.id,
          quantity: '0.001',
          evidenceReference: 'SYNTH-RAW-OVERAGE',
          receivedAt: new Date(evidence.receivedAt),
          receivedBy: evidence.receivedBy,
          requestId: randomUUID(),
        },
      }),
    ).rejects.toThrow('exceeds the returned quantity');
    await expect(
      db.inventoryRecallSupplierReceipt.update({
        where: { id: row.id },
        data: { receivedBy: 'Synthetic rewrite' },
      }),
    ).rejects.toThrow('append-only');
    expect(await db.accountingEntry.count({ where: { hospitalId } })).toBe(
      financialEntries,
    );
    expect(
      await db.productStock.findUniqueOrThrow({ where: { id: batch.id } }),
    ).toEqual(stockBefore);
    expect(
      await db.auditLog.count({
        where: { hospitalId, action: 'RECORD_RECALL_SUPPLIER_RECEIPT' },
      }),
    ).toBe(3);
    expect(
      await db.auditLog.count({
        where: {
          hospitalId,
          action: 'CREATE',
          entity: 'InventoryRecallSupplierReceipt',
        },
      }),
    ).toBe(0);
  });
  it('preserves one financial movement for retry and rejects changed request contents', async () => {
    const key = randomUUID();
    const id = idOf(await ret(3, key).expect(201));
    expect(idOf(await ret(3, key).expect(201))).toBe(id);
    await ret(4, key).expect(409);
    expect(await db.purchaseReturn.count()).toBe(1);
  });
  it('serializes competing requests against the remaining original quantity', async () => {
    const responses = await Promise.all([ret(6), ret(6)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('4');
  });
  it('serializes simultaneous retries to a single document and journal', async () => {
    const key = randomUUID();
    const responses = await Promise.all([ret(3, key), ret(3, key)]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(idOf(responses[0])).toBe(idOf(responses[1]));
    expect(
      await db.accountingEntry.count({
        where: { sourceModule: 'PURCHASE_RETURN' },
      }),
    ).toBe(1);
  });
  it('rejects empty, duplicate, negative and excessive-precision quantities', async () => {
    const data = dto();
    await post('/purchases/returns', { ...data, items: [] }).expect(400);
    await post('/purchases/returns', {
      ...data,
      items: [data.items[0], data.items[0]],
    }).expect(400);
    await ret(-1).expect(400);
    await ret(0.0001).expect(400);
    await ret(10000000000000).expect(400);
    await ret(11).expect(400);
    expect(await db.purchaseReturn.count()).toBe(0);
  });
  it('selects the original line and batch when a product appears at different prices', async () => {
    invoiceId = await addInvoice([
      { quantity: 5, unitPrice: 10, batchNumber: 'MULTI-A' },
      { quantity: 5, unitPrice: 20, batchNumber: 'MULTI-B' },
    ]);
    await post('/purchases/returns', {
      purchaseInvoiceId: invoiceId,
      reason,
      requestId: randomUUID(),
      items: [{ productId, quantity: 2 }],
    }).expect(400);
    lineId = (
      await db.purchaseInvoiceLine.findFirstOrThrow({
        where: { purchaseInvoiceId: invoiceId, batchNumber: 'MULTI-B' },
      })
    ).id;
    const id = idOf(await ret(2).expect(201));
    expect(
      (
        await db.purchaseReturn.findUniqueOrThrow({ where: { id } })
      ).totalAmount.toString(),
    ).toBe('40');
    expect(
      (
        await db.productStock.findFirstOrThrow({
          where: { hospitalId, productId, batchNumber: 'MULTI-B' },
        })
      ).quantity.toString(),
    ).toBe('3');
    expect(
      (
        await db.productStock.findFirstOrThrow({
          where: { hospitalId, productId, batchNumber: 'MULTI-A' },
        })
      ).quantity.toString(),
    ).toBe('5');
  });
  it('rejects unavailable batch quantity without partial stock or journal updates', async () => {
    await db.productStock.updateMany({
      where: { hospitalId, productId },
      data: { quantity: 2 },
    });
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: 2 },
    });
    await ret(3).expect(409);
    expect(await db.purchaseReturn.count()).toBe(0);
    expect(await db.stockTransaction.count({ where: { type: 'OUT' } })).toBe(0);
  });
  it('requires an explicit reconciliation when summary and batch stocks differ', async () => {
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: 11 },
    });
    await ret().expect(400);
    expect(await db.purchaseReturn.count()).toBe(0);
  });
  it('rolls back stock and document when the financial period is closed', async () => {
    await db.financialPeriod.update({
      where: { id: periodId },
      data: { isOpen: false },
    });
    await ret().expect(400);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('10');
    expect(await db.purchaseReturn.count()).toBe(0);
  });
  it('records WAC loss separately from original supplier credit', async () => {
    await addInvoice([{ quantity: 10, unitPrice: 30, batchNumber: 'LATER-B' }]);
    const id = idOf(await ret(2).expect(201));
    const loss = await db.systemAccountMapping.findUniqueOrThrow({
      where: { hospitalId_key: { hospitalId, key: 'INVENTORY_LOSS' } },
    });
    expect(
      await db.accountingEntryLine.count({
        where: {
          entryId: (
            await db.purchaseReturn.findUniqueOrThrow({ where: { id } })
          ).accountingEntryId!,
          accountId: loss.accountId,
          debit: 20,
        },
      }),
    ).toBe(1);
    expect(
      (
        await db.stockTransaction.findFirstOrThrow({
          where: { purchaseReturnId: id },
        })
      ).totalCost.toString(),
    ).toBe('40');
  });
  it('records WAC gain separately and fails atomically when the required variance account is missing', async () => {
    await addInvoice([{ quantity: 10, unitPrice: 2, batchNumber: 'LATER-C' }]);
    await db.systemAccountMapping.update({
      where: { hospitalId_key: { hospitalId, key: 'INVENTORY_GAIN' } },
      data: { isActive: false },
    });
    await ret(2).expect(400);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('20');
    await db.systemAccountMapping.update({
      where: { hospitalId_key: { hospitalId, key: 'INVENTORY_GAIN' } },
      data: { isActive: true },
    });
    const id = idOf(await ret(2).expect(201));
    const gain = await db.systemAccountMapping.findUniqueOrThrow({
      where: { hospitalId_key: { hospitalId, key: 'INVENTORY_GAIN' } },
    });
    expect(
      await db.accountingEntryLine.count({
        where: {
          entryId: (
            await db.purchaseReturn.findUniqueOrThrow({ where: { id } })
          ).accountingEntryId!,
          accountId: gain.accountId,
          credit: 8,
        },
      }),
    ).toBe(1);
  });
  it('shows the supplier credit in statement, ageing and remaining payable and blocks excess payment', async () => {
    await ret().expect(201);
    const details = await get(`/purchases/invoices/${invoiceId}`).expect(200);
    expect(details.body).toMatchObject({
      returnedAmount: 30,
      remainingPayable: 70,
    });
    expect(
      (await get(`/suppliers/${supplierId}/statement`).expect(200)).body,
    ).toMatchObject({
      closingBalance: 70,
    });
    const statement = (
      await get(`/suppliers/${supplierId}/statement`).expect(200)
    ).body as { rows: { kind: string; credit: number }[] };
    expect(statement.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'RETURN', credit: 30 }),
      ]),
    );
    expect((await get('/suppliers/aging').expect(200)).body).toMatchObject({
      grandTotals: { total: 70 },
    });
    await post(`/purchases/invoices/${invoiceId}/payments`, {
      supplierId,
      amount: 71,
      method: 'CASH',
    }).expect(400);
  });
  it('preserves an overpaid suppliers credit without creating a fake cash receipt', async () => {
    await post(`/purchases/invoices/${invoiceId}/payments`, {
      supplierId,
      amount: 100,
      method: 'CASH',
    }).expect(201);
    await ret().expect(201);
    expect(
      (
        await db.purchaseInvoice.findUniqueOrThrow({ where: { id: invoiceId } })
      ).paidAmount.toString(),
    ).toBe('100');
    expect(
      (await get(`/suppliers/${supplierId}/statement`).expect(200)).body,
    ).toMatchObject({ closingBalance: -30 });
    expect((await get('/suppliers/aging').expect(200)).body).toMatchObject({
      grandTotals: { total: 0, creditBalance: 30 },
    });
    expect(await db.supplierPayment.count()).toBe(1);
  });
  it('refuses ambiguous historic returns and incorrectly expensed source invoices', async () => {
    await db.purchaseReturn.create({
      data: {
        hospitalId,
        supplierId,
        purchaseInvoiceId: invoiceId,
        status: 'COMPLETED',
        netAmount: 10,
        totalAmount: 10,
        createdById: userId,
      },
    });
    await ret().expect(400);
    expect(
      (await get(`/suppliers/${supplierId}/statement`).expect(200)).body,
    ).toMatchObject({
      closingBalance: 100,
    });
    const statement = (
      await get(`/suppliers/${supplierId}/statement`).expect(200)
    ).body as { unreconciledReturns: { purchaseInvoiceId: number }[] };
    expect(statement.unreconciledReturns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ purchaseInvoiceId: invoiceId }),
      ]),
    );
  });
  it('denies cross-hospital returns and read-only actors', async () => {
    await post('/purchases/returns', dto(), reader).expect(403);
    const hospital = await db.hospital.create({
      data: { code: 'OTHER-PURCHASE-RETURN', name: 'Synthetic other hospital' },
    });
    const other = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'other-return',
      'synthetic',
      { hospitalId: hospital.id, permissions: ['purchases:manage'] },
    );
    await post('/purchases/returns', dto(), other.accessToken).expect(404);
  });
  it('rolls back every financial and stock effect on mandatory audit failure', async () => {
    await db.$executeRawUnsafe(
      `CREATE FUNCTION repair_test_purchase_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='COMPLETE_PURCHASE_RETURN' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        `CREATE TRIGGER repair_test_purchase_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION repair_test_purchase_audit_failure()`,
      );
      await ret().expect(500);
      expect(await db.purchaseReturn.count()).toBe(0);
      expect(
        (
          await db.product.findUniqueOrThrow({ where: { id: productId } })
        ).stockOnHand.toString(),
      ).toBe('10');
      expect(
        await db.accountingEntry.count({
          where: { sourceModule: 'PURCHASE_RETURN' },
        }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS repair_test_purchase_audit_failure ON "AuditLog"',
      );
      await db.$executeRawUnsafe(
        'DROP FUNCTION repair_test_purchase_audit_failure()',
      );
    }
  });
  it('refuses an incorrectly expensed original without rewriting its journal', async () => {
    const invoice = await db.purchaseInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const expense = await db.account.findFirstOrThrow({
      where: { hospitalId, type: 'EXPENSE' },
    });
    await db.accountingEntryLine.updateMany({
      where: { entryId: invoice.accountingEntryId!, debit: { gt: 0 } },
      data: { accountId: expense.id },
    });
    await ret().expect(400);
    expect(await db.purchaseReturn.count()).toBe(0);
    expect(
      await db.accountingEntryLine.count({
        where: {
          entryId: invoice.accountingEntryId!,
          accountId: expense.id,
          debit: 100,
        },
      }),
    ).toBe(1);
  });
  it.each([{ discountAmount: 1 }, { vatAmount: 1 }, { currency: 'USD' }])(
    'contains unsupported invoice pricing %j without stock changes',
    async (pricing) => {
      await db.purchaseInvoice.update({
        where: { id: invoiceId },
        data: pricing,
      });
      await ret().expect(400);
      expect(
        (
          await db.product.findUniqueOrThrow({ where: { id: productId } })
        ).stockOnHand.toString(),
      ).toBe('10');
      expect(await db.purchaseReturn.count()).toBe(0);
    },
  );
  it('protects posted returns and their original journals from standalone reversal', async () => {
    const id = idOf(await ret().expect(201));
    const returned = await db.purchaseReturn.findUniqueOrThrow({
      where: { id },
    });
    const original = await db.purchaseInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    await expect(
      app
        .get(AccountingService)
        .reverseEntry(hospitalId, returned.accountingEntryId!, userId, reason),
    ).rejects.toThrow();
    await expect(
      app
        .get(AccountingService)
        .reverseEntry(hospitalId, original.accountingEntryId!, userId, reason),
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`DELETE FROM "AccountingEntry" WHERE id=${returned.accountingEntryId}`,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23503' } });
  });
  it('contains linked GRN workflows instead of receiving or returning their stock twice', async () => {
    await db.goodsReceipt.create({
      data: {
        hospitalId,
        purchaseInvoiceId: invoiceId,
        warehouseId,
        receivedById: userId,
        status: 'COMPLETED',
      },
    });
    await ret().expect(400);
    const draft = await db.purchaseInvoice.create({
      data: {
        hospitalId,
        supplierId,
        warehouseId,
        invoiceDate: new Date(),
        netAmount: 10,
        totalAmount: 10,
        lines: {
          create: {
            productId,
            quantity: 1,
            unitPrice: 10,
            totalAmount: 10,
            description: 'Synthetic GRN-linked line',
          },
        },
      },
    });
    await db.goodsReceipt.create({
      data: {
        hospitalId,
        purchaseInvoiceId: draft.id,
        warehouseId,
        receivedById: userId,
        status: 'DRAFT',
      },
    });
    await post(`/purchases/invoices/${draft.id}/approve`).expect(400);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('10');
  });
  it('allocates successive fractional returns cumulatively without exceeding the original monetary amount', async () => {
    invoiceId = await addInvoice([
      { quantity: 1, unitPrice: 0.003, batchNumber: 'FRACTIONAL' },
    ]);
    lineId = (
      await db.purchaseInvoiceLine.findFirstOrThrow({
        where: { purchaseInvoiceId: invoiceId },
      })
    ).id;
    const first = idOf(await ret(0.5).expect(201));
    const second = idOf(await ret(0.5).expect(201));
    expect(
      (
        await db.purchaseReturn.findUniqueOrThrow({ where: { id: first } })
      ).totalAmount.toString(),
    ).toBe('0.002');
    expect(
      (
        await db.purchaseReturn.findUniqueOrThrow({ where: { id: second } })
      ).totalAmount.toString(),
    ).toBe('0.001');
    const total = await db.purchaseReturn.aggregate({
      where: { hospitalId, purchaseInvoiceId: invoiceId },
      _sum: { totalAmount: true },
    });
    expect(total._sum.totalAmount?.toString()).toBe('0.003');
    await ret(0.001).expect(400);
  });
});
