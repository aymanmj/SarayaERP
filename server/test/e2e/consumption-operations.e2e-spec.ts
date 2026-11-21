import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { enqueueConsumptionIntent } from '../../src/inventory/consumption-intent';
import { InventoryAutoDepletionListener } from '../../src/inventory/inventory-auto-depletion.listener';
describe('Consumption operations authorization and audited rescheduling', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let token: string;
  let reader: string;
  let hospitalId: number;
  let userId: number;
  let id: number;
  const root = '/inventory/consumption-operations';
  const material = async (serviceItemId: number, warehouseId: number) => {
    const product = await db.product.create({
      data: {
        hospitalId,
        code: 'POLICY-MATERIAL',
        name: 'Synthetic policy material',
        costPrice: 0,
        stockOnHand: 1,
      },
    });
    await db.productStock.create({
      data: {
        hospitalId,
        warehouseId,
        productId: product.id,
        batchNumber: 'POLICY-BATCH',
        quantity: 1,
        unitCost: 0,
      },
    });
    await db.serviceItemProduct.create({
      data: { serviceItemId, productId: product.id, quantity: 1 },
    });
    return product.id;
  };
  const get = (query = '', access = token) =>
    request(app.getHttpServer())
      .get(root + query)
      .auth(access, { type: 'bearer' });
  const retry = (
    operation = id,
    access = token,
    reason = 'Synthetic resolved stock issue',
  ) =>
    request(app.getHttpServer())
      .post(`${root}/${operation}/retry`)
      .auth(access, { type: 'bearer' })
      .send({ reason });
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
    const actor = await auth.createTestUser('ops-manager', 'synthetic', {
      permissions: ['inventory:view', 'inventory:manage'],
    });
    token = actor.accessToken;
    hospitalId = actor.user.hospitalId;
    userId = actor.user.id;
    reader = (
      await auth.createTestUser('ops-reader', 'synthetic', {
        hospitalId,
        permissions: ['inventory:view'],
      })
    ).accessToken;
    const service = await db.serviceItem.create({
      data: {
        hospitalId,
        name: 'Synthetic service',
        type: 'OTHER',
        defaultPrice: 0,
      },
    });
    id = (
      await db.serviceMaterialConsumption.create({
        data: {
          hospitalId,
          userId,
          serviceItemId: service.id,
          referenceType: 'TEST_OPS',
          referenceId: 1,
          multiplier: 1,
          status: 'FAILED',
          attempts: 10,
          error: 'SERVICE_MATERIAL_CONSUMPTION_FAILED',
        },
      })
    ).id;
  });
  it('requires an explicit active warehouse from the same hospital and audits configuration', async () => {
    const before = await get('/source-policy').expect(200);
    expect((before.body as { warehouseId: null }).warehouseId).toBeNull();
    const wh = await db.warehouse.create({
      data: { hospitalId, name: 'Explicit source' },
    });
    const configure = (access = token, warehouseId = wh.id) =>
      request(app.getHttpServer())
        .put(`${root}/source-policy`)
        .auth(access, { type: 'bearer' })
        .send({ warehouseId, reason: 'Approved consumption source warehouse' });
    await configure(reader).expect(403);
    await db.$executeRawUnsafe(
      `CREATE FUNCTION repair_policy_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='CONFIGURE_CONSUMPTION_WAREHOUSE' THEN RAISE EXCEPTION 'synthetic policy audit failure'; END IF; RETURN NEW; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        'CREATE TRIGGER repair_policy_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION repair_policy_audit_failure()',
      );
      await configure().expect(500);
      expect(await db.consumptionWarehousePolicy.count()).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS repair_policy_audit_failure ON "AuditLog"',
      );
      await db.$executeRawUnsafe('DROP FUNCTION repair_policy_audit_failure()');
    }
    await configure().expect(200);
    expect(
      (
        await db.consumptionWarehousePolicy.findUniqueOrThrow({
          where: { hospitalId },
        })
      ).warehouseId,
    ).toBe(wh.id);
    expect(
      await db.auditLog.count({
        where: {
          action: 'CONFIGURE_CONSUMPTION_WAREHOUSE',
          hospitalId,
          userId,
        },
      }),
    ).toBe(1);
    await db.warehouse.update({
      where: { id: wh.id },
      data: { isActive: false },
    });
    await configure().expect(400);
    const foreign = await db.hospital.create({
      data: { code: 'POLICY-FOREIGN', name: 'Synthetic foreign' },
    });
    const other = await db.warehouse.create({
      data: { hospitalId: foreign.id, name: 'Foreign source' },
    });
    await configure(token, other.id).expect(400);
    await expect(
      db.consumptionWarehousePolicy.create({
        data: {
          hospitalId: foreign.id,
          warehouseId: wh.id,
          updatedById: userId,
        },
      }),
    ).rejects.toThrow();
  });
  it('freezes the configured warehouse for registered operations', async () => {
    const svc = (
      await db.serviceMaterialConsumption.findUniqueOrThrow({ where: { id } })
    ).serviceItemId;
    const first = await db.warehouse.create({
      data: { hospitalId, name: 'First source' },
    });
    const second = await db.warehouse.create({
      data: { hospitalId, name: 'Second source' },
    });
    await db.consumptionWarehousePolicy.create({
      data: { hospitalId, warehouseId: first.id, updatedById: userId },
    });
    const productId = await material(svc, first.id);
    const pending = await db.$transaction((tx) =>
      enqueueConsumptionIntent(tx, {
        hospitalId,
        serviceItemId: svc,
        userId,
        referenceType: 'POLICY_TEST',
        referenceId: 2,
      }),
    );
    await db.consumptionWarehousePolicy.update({
      where: { hospitalId },
      data: { warehouseId: second.id },
    });
    await app.get(InventoryAutoDepletionListener).retryPending();
    expect(
      (
        await db.serviceMaterialConsumption.findUniqueOrThrow({
          where: { id: pending.id },
        })
      ).warehouseId,
    ).toBe(first.id);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('0');
  });
  it('never chooses the first available warehouse when policy is absent', async () => {
    const svc = (
      await db.serviceMaterialConsumption.findUniqueOrThrow({ where: { id } })
    ).serviceItemId;
    const wh = await db.warehouse.create({
      data: { hospitalId, name: 'Not implicitly selected' },
    });
    const productId = await material(svc, wh.id);
    const pending = await db.$transaction((tx) =>
      enqueueConsumptionIntent(tx, {
        hospitalId,
        serviceItemId: svc,
        userId,
        referenceType: 'NO_POLICY_TEST',
        referenceId: 3,
      }),
    );
    const worker = app.get(InventoryAutoDepletionListener);
    await worker.retryPending();
    expect(
      await db.serviceMaterialConsumption.findUniqueOrThrow({
        where: { id: pending.id },
      }),
    ).toMatchObject({ status: 'FAILED', warehouseId: null });
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('1');
    await db.consumptionWarehousePolicy.create({
      data: { hospitalId, warehouseId: wh.id, updatedById: userId },
    });
    await db.serviceMaterialConsumption.update({
      where: { id: pending.id },
      data: { nextRetryAt: new Date('2000-01-01') },
    });
    await worker.retryPending();
    expect(
      await db.serviceMaterialConsumption.findUniqueOrThrow({
        where: { id: pending.id },
      }),
    ).toMatchObject({ status: 'COMPLETED', warehouseId: wh.id });
  });
  it('lists failed records with bounded pagination', async () => {
    const row = await db.serviceMaterialConsumption.findUniqueOrThrow({
      where: { id },
    });
    await db.serviceMaterialConsumption.create({
      data: {
        hospitalId,
        userId,
        serviceItemId: row.serviceItemId,
        referenceType: 'TEST_OPS',
        referenceId: 2,
        multiplier: 1,
        status: 'FAILED',
      },
    });
    const first = await get('?status=FAILED&limit=1').expect(200);
    const page = first.body as {
      items: { id: number }[];
      nextCursor: number | null;
    };
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    const second = await get(
      `?status=FAILED&limit=1&before=${page.nextCursor}`,
    ).expect(200);
    expect((second.body as { items: { id: number }[] }).items[0].id).toBe(id);
  });
  it('preserves operation inputs and records actor and reason on rescheduling', async () => {
    const original = await db.serviceMaterialConsumption.findUniqueOrThrow({
      where: { id },
    });
    await retry().expect(201);
    const updated = await db.serviceMaterialConsumption.findUniqueOrThrow({
      where: { id },
    });
    expect(updated).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      error: null,
      userId: original.userId,
      warehouseId: original.warehouseId,
      serviceItemId: original.serviceItemId,
    });
    expect(
      await db.auditLog.count({
        where: { action: 'REQUEUE_SERVICE_CONSUMPTION', entityId: id, userId },
      }),
    ).toBe(1);
    expect(await db.stockTransaction.count()).toBe(0);
    await retry().expect(409);
  });
  it('does not permit viewers to reschedule', async () => {
    await get('', reader).expect(200);
    await retry(id, reader).expect(403);
    expect(
      (await db.serviceMaterialConsumption.findUniqueOrThrow({ where: { id } }))
        .status,
    ).toBe('FAILED');
  });
  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get(root).expect(401);
  });
  it('isolates branch listing and rejects foreign operation ids', async () => {
    const foreign = await db.hospital.create({
      data: { code: 'OPS-FOREIGN', name: 'Synthetic foreign' },
    });
    await db.serviceMaterialConsumption.update({
      where: { id },
      data: { hospitalId: foreign.id },
    });
    const result = await get().expect(200);
    expect((result.body as { items: unknown[] }).items).toEqual([]);
    await retry().expect(404);
  });
  it('rejects empty, whitespace-only and oversized reasons', async () => {
    for (const reason of ['', '               ', 'x'.repeat(501)])
      await retry(id, token, reason).expect(400);
  });
  it('rejects invalid filters and unbounded page sizes', async () => {
    for (const query of [
      '?status=UNKNOWN',
      '?limit=101',
      '?limit=0',
      '?before=-1',
      '?before=2147483648',
    ])
      await get(query).expect(400);
  });
  it('rejects completed operations and serializes duplicate rescheduling', async () => {
    const results = await Promise.all([retry(), retry()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    await db.serviceMaterialConsumption.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await retry().expect(409);
    expect(
      await db.auditLog.count({
        where: { action: 'REQUEUE_SERVICE_CONSUMPTION', entityId: id },
      }),
    ).toBe(1);
  });
  it('rolls back rescheduling when mandatory audit insertion fails', async () => {
    await db.$executeRawUnsafe(
      `CREATE FUNCTION repair_requeue_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='REQUEUE_SERVICE_CONSUMPTION' THEN RAISE EXCEPTION 'synthetic requeue audit failure'; END IF; RETURN NEW; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        'CREATE TRIGGER repair_requeue_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION repair_requeue_failure()',
      );
      await retry().expect(500);
      expect(
        await db.serviceMaterialConsumption.findUniqueOrThrow({
          where: { id },
        }),
      ).toMatchObject({ status: 'FAILED', attempts: 10 });
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS repair_requeue_failure ON "AuditLog"',
      );
      await db.$executeRawUnsafe('DROP FUNCTION repair_requeue_failure()');
    }
  });
});
