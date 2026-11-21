import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SurgeryService } from '../../src/surgery/surgery.service';
import { Money } from '../../src/common/utils/money.util';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { InventoryService } from '../../src/inventory/inventory.service';

describe('Surgery supplies: explicit source, atomic billing/COGS and replay', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let service: SurgeryService;
  let hospitalId: number,
    userId: number,
    caseId: number,
    productId: number,
    warehouseId: number,
    encounterId: number;
  let token: string;
  let sourceToken: string;
  const input = (quantity = '1.000', requestId = randomUUID()) => ({
    hospitalId,
    userId,
    caseId,
    productId,
    quantity,
    requestId,
  });
  const dispense = (quantity = '1.000', requestId = randomUUID()) =>
    service.addConsumable(input(quantity, requestId));
  const state = async () =>
    JSON.stringify({
      product: await db.product.findUnique({ where: { id: productId } }),
      stocks: await db.productStock.findMany({ orderBy: { id: 'asc' } }),
    });
  const noEffects = async () => {
    expect(await db.surgeryConsumable.count()).toBe(0);
    expect(await db.stockTransaction.count()).toBe(0);
    expect(await db.encounterCharge.count()).toBe(0);
    expect(await db.accountingEntry.count()).toBe(0);
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
    service = app.get(SurgeryService);
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    const auth = new AuthHelper(db, app.get(JwtService));
    const actor = await auth.createTestUser('surgery-actor', 'synthetic', {
      permissions: ['surgery:view', 'surgery:manage'],
    });
    hospitalId = actor.user.hospitalId;
    userId = actor.user.id;
    token = actor.accessToken;
    sourceToken = (
      await auth.createTestUser('surgery-source', 'synthetic', {
        hospitalId,
        permissions: ['surgery:source:manage'],
      })
    ).accessToken;
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: 'SYNTHETIC',
        fullName: 'Synthetic surgery patient',
      },
    });
    encounterId = (
      await db.encounter.create({
        data: { hospitalId, patientId: patient.id, type: 'IPD' },
      })
    ).id;
    const theatre = await db.operatingTheatre.create({
      data: { hospitalId, name: 'Synthetic theatre' },
    });
    caseId = (
      await db.surgeryCase.create({
        data: {
          hospitalId,
          encounterId,
          theatreId: theatre.id,
          surgeryName: 'Synthetic surgery',
          scheduledStart: new Date(),
          scheduledEnd: new Date(Date.now() + 3600000),
          status: 'IN_PROGRESS',
        },
      })
    ).id;
    warehouseId = (
      await db.warehouse.create({ data: { hospitalId, name: 'Operations' } })
    ).id;
    await db.surgeryWarehousePolicy.create({
      data: { hospitalId, warehouseId, updatedById: userId },
    });
    productId = (
      await db.product.create({
        data: {
          hospitalId,
          code: 'SUPPLY',
          name: 'Synthetic supply',
          type: 'SUPPLY',
          stockOnHand: 1,
          costPrice: '2.345',
          sellPrice: '3.333',
        },
      })
    ).id;
    for (const [i, batchNumber] of ['A', 'B'].entries())
      await db.productStock.create({
        data: {
          hospitalId,
          warehouseId,
          productId,
          batchNumber,
          quantity: '0.500',
          unitCost: '2.345',
          expiryDate: new Date(Date.now() + 86400000 * (10 + i)),
        },
      });
    await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'SURGERY-CONS',
        name: 'Synthetic supplies charge',
        type: 'SURGERY',
        defaultPrice: 0,
      },
    });
    for (const key of ['INVENTORY_SUPPLIES', 'COGS_SUPPLIES'] as const) {
      const account = await db.account.create({
        data: {
          hospitalId,
          code: key,
          name: key,
          type: key === 'COGS_SUPPLIES' ? 'EXPENSE' : 'ASSET',
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
        code: 'FY',
        name: 'Synthetic year',
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year}-12-31`),
        status: 'OPEN',
      },
    });
    await db.financialPeriod.create({
      data: {
        financialYearId: fy.id,
        periodCode: 'P',
        periodIndex: 1,
        monthStartDate: new Date(`${year}-01-01`),
        monthEndDate: new Date(`${year}-12-31`),
        numberOfDays: 365,
        isOpen: true,
      },
    });
  });
  it('posts exact split-batch sales, WAC cost, balance versions and mandatory audit', async () => {
    const result = await dispense();
    expect(result.totalPrice.toString()).toBe('3.333');
    expect(result.totalCost?.toString()).toBe('2.345');
    expect(result.consumptionVersion).toBe(1);
    expect(result.sourceWarehouseId).toBe(warehouseId);
    const stocks = await db.productStock.findMany();
    expect(stocks.every((s) => s.quantity.isZero() && s.version === 2)).toBe(
      true,
    );
    const product = await db.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockOnHand.isZero()).toBe(true);
    expect(product.version).toBe(2);
    const moves = await db.stockTransaction.findMany({
      orderBy: { id: 'asc' },
    });
    expect(moves).toHaveLength(2);
    expect(moves.map((m) => m.totalCost.toString())).toEqual([
      '1.173',
      '1.172',
    ]);
    expect(
      moves.every(
        (m) =>
          m.referenceId === result.id && m.baseQuantity?.toString() === '0.5',
      ),
    ).toBe(true);
    const charge = await db.encounterCharge.findFirstOrThrow();
    expect(charge.sourceType).toBe('SURGERY_CONSUMABLE');
    expect(charge.sourceId).toBe(result.id);
    expect(charge.totalAmount.toString()).toBe('3.333');
    const entry = await db.accountingEntry.findFirstOrThrow({
      include: { lines: true },
    });
    expect(
      Money.toDbString(Money.sumDecimal(...entry.lines.map((l) => l.debit))),
    ).toBe('2.345');
    expect(
      Money.toDbString(Money.sumDecimal(...entry.lines.map((l) => l.credit))),
    ).toBe('2.345');
    expect(
      await db.auditLog.count({
        where: { action: 'DISPENSE_SURGERY_CONSUMABLE' },
      }),
    ).toBe(1);
  });
  it('links recalled surgical supply to the original consumption and encounter', async () => {
    const consumption = await dispense();
    const batch = await db.productStock.findFirstOrThrow({
      where: { hospitalId, productId, warehouseId },
      orderBy: { id: 'asc' },
    });
    const inventory = app.get(InventoryService);
    await inventory.changeBatchRestriction(
      hospitalId,
      userId,
      batch.id,
      'RECALLED',
      'Synthetic surgical material recall',
    );
    expect(
      await inventory.recallFollowup(hospitalId, userId, batch.id, true),
    ).toMatchObject({
      movements: [
        {
          referenceType: 'SURGERY_CONSUMABLE',
          referenceId: consumption.id,
          encounterId,
          linked: true,
        },
      ],
    });
  });
  it('replays concurrent identical requests exactly once after stock is exhausted', async () => {
    const id = randomUUID();
    const [a, b] = await Promise.all([
      dispense('1.000', id),
      dispense('1', id),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.surgeryConsumable.count()).toBe(1);
    expect(await db.encounterCharge.count()).toBe(1);
  });
  it('rejects changing the payload of a committed request', async () => {
    const id = randomUUID();
    await dispense('0.500', id);
    await expect(dispense('0.250', id)).rejects.toThrow();
    expect(await db.surgeryConsumable.count()).toBe(1);
  });
  it('serializes different requests competing for the last units', async () => {
    const results = await Promise.allSettled([dispense(), dispense()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.surgeryConsumable.count()).toBe(1);
  });
  it('replays stored snapshots after price, source and case status change', async () => {
    const id = randomUUID();
    const first = await dispense('0.500', id);
    await db.product.update({
      where: { id: productId },
      data: { sellPrice: 9 },
    });
    await db.surgeryWarehousePolicy.deleteMany();
    await db.surgeryCase.update({
      where: { id: caseId },
      data: { status: 'COMPLETED' },
    });
    const second = await dispense('0.5', id);
    expect(second.id).toBe(first.id);
    expect(second.totalPrice.toString()).toBe(first.totalPrice.toString());
  });
  it.each(['COMPLETED', 'CANCELLED'] as const)(
    'rejects %s cases without effects',
    async (status) => {
      await db.surgeryCase.update({ where: { id: caseId }, data: { status } });
      await expect(dispense()).rejects.toThrow();
      await noEffects();
    },
  );
  it('rejects closed encounters and deleted patients', async () => {
    await db.encounter.update({
      where: { id: encounterId },
      data: { status: 'CLOSED' },
    });
    await expect(dispense()).rejects.toThrow();
    await db.encounter.update({
      where: { id: encounterId },
      data: { status: 'OPEN', patient: { update: { isDeleted: true } } },
    });
    await expect(dispense()).rejects.toThrow();
    await noEffects();
  });
  it('refuses medicines and inactive supplies through this route', async () => {
    await db.product.update({
      where: { id: productId },
      data: { type: 'DRUG' },
    });
    await expect(dispense()).rejects.toThrow();
    await db.product.update({
      where: { id: productId },
      data: { type: 'SUPPLY', isActive: false },
    });
    await expect(dispense()).rejects.toThrow();
    await noEffects();
  });
  it('does not infer a missing source from the Operations name', async () => {
    await db.surgeryWarehousePolicy.deleteMany();
    await expect(dispense()).rejects.toThrow();
    await noEffects();
  });
  it('rejects disabled sources, expired batches and insufficient quantity', async () => {
    await db.warehouse.update({
      where: { id: warehouseId },
      data: { isActive: false },
    });
    await expect(dispense()).rejects.toThrow();
    await db.warehouse.update({
      where: { id: warehouseId },
      data: { isActive: true },
    });
    await db.productStock.updateMany({
      data: { expiryDate: new Date(Date.now() - 86400000) },
    });
    await expect(dispense()).rejects.toThrow();
    await noEffects();
  });
  it('rejects inconsistent product and warehouse totals', async () => {
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: 2 },
    });
    await expect(dispense()).rejects.toThrow();
    await noEffects();
  });
  it('rolls back consumption and charging when one of the required batches has been recalled', async () => {
    const stock = await db.productStock.findFirstOrThrow({
      where: { hospitalId, productId },
      orderBy: { id: 'asc' },
    });
    await db.inventoryBatchRestriction.create({
      data: {
        hospitalId,
        productId,
        batchNumber: stock.batchNumber!,
        status: 'RECALLED',
        reason: 'Synthetic recall notification',
      },
    });
    await expect(dispense()).rejects.toThrow();
    await noEffects();
  });
  it('rejects a foreign case, product, actor and source assignment', async () => {
    const foreign = await db.hospital.create({
      data: { name: 'Synthetic foreign', code: 'FOREIGN' },
    });
    await expect(
      service.addConsumable({ ...input(), hospitalId: foreign.id }),
    ).rejects.toThrow();
    await db.surgeryCase.update({
      where: { id: caseId },
      data: { hospitalId: foreign.id },
    });
    await expect(dispense()).rejects.toThrow();
    await db.surgeryCase.update({
      where: { id: caseId },
      data: { hospitalId },
    });
    await db.product.update({
      where: { id: productId },
      data: { hospitalId: foreign.id },
    });
    await expect(dispense()).rejects.toThrow();
    const w = await db.warehouse.create({
      data: { hospitalId: foreign.id, name: 'Foreign' },
    });
    await expect(
      service.configureSurgerySource(hospitalId, userId, {
        warehouseId: w.id,
        reason: 'Synthetic invalid assignment',
      }),
    ).rejects.toThrow();
    await noEffects();
  });
  it('requires a surgery billing service and never falls back to pharmacy', async () => {
    await db.serviceItem.updateMany({
      data: { code: 'PHARMACY-DRUGS', type: 'PHARMACY' },
    });
    await expect(dispense()).rejects.toThrow();
    await noEffects();
  });
  it('requires an open financial period, even for zero cost', async () => {
    await db.product.update({
      where: { id: productId },
      data: { costPrice: 0 },
    });
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(dispense()).rejects.toThrow();
    await noEffects();
  });
  it('rejects a missing or inappropriate COGS account', async () => {
    await db.account.updateMany({
      where: { code: 'COGS_SUPPLIES' },
      data: { type: 'ASSET' },
    });
    await expect(dispense()).rejects.toThrow();
    await noEffects();
  });
  it.each(['AccountingEntry', 'EncounterCharge', 'AuditLog'])(
    'rolls back all quantities, versions and documents when %s fails',
    async (table) => {
      const before = await state();
      await db.$executeRawUnsafe(
        `CREATE FUNCTION repair_surgery_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`,
      );
      try {
        await db.$executeRawUnsafe(
          `CREATE TRIGGER repair_surgery_failure BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION repair_surgery_failure()`,
        );
        await expect(dispense()).rejects.toThrow();
        expect(await state()).toBe(before);
        await noEffects();
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS repair_surgery_failure ON "${table}"`,
        );
        await db.$executeRawUnsafe('DROP FUNCTION repair_surgery_failure()');
      }
    },
  );
  it('guards source changes with a dedicated permission and validates input', async () => {
    await request(app.getHttpServer())
      .put('/surgery/source-policy')
      .set('Authorization', `Bearer ${token}`)
      .send({ warehouseId, reason: 'Synthetic configuration' })
      .expect(403);
    await request(app.getHttpServer())
      .put('/surgery/source-policy')
      .set('Authorization', `Bearer ${sourceToken}`)
      .send({ warehouseId, reason: 'short' })
      .expect(400);
    await request(app.getHttpServer())
      .put('/surgery/source-policy')
      .set('Authorization', `Bearer ${sourceToken}`)
      .send({ warehouseId, reason: 'Synthetic configuration' })
      .expect(200);
    expect(
      await db.auditLog.count({
        where: { action: 'CONFIGURE_SURGERY_WAREHOUSE' },
      }),
    ).toBe(1);
  });
  it('enforces the HTTP quantity and identity contract', async () => {
    for (const body of [
      { productId, quantity: 1, requestId: randomUUID() },
      { productId, quantity: '0', requestId: randomUUID() },
      { productId, quantity: '0.0001', requestId: randomUUID() },
      { productId, quantity: '1', requestId: 'bad' },
    ])
      await request(app.getHttpServer())
        .post(`/surgery/cases/${caseId}/consumables`)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(400);
    await noEffects();
    await request(app.getHttpServer())
      .post(`/surgery/cases/${caseId}/consumables`)
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: '1.000', requestId: randomUUID() })
      .expect(201);
  });
  it('keeps posted snapshots immutable and prevents duplicate source charges', async () => {
    const item = await dispense();
    await expect(
      db.surgeryConsumable.update({
        where: { id: item.id },
        data: { totalPrice: 99 },
      }),
    ).rejects.toThrow();
    await expect(
      db.surgeryConsumable.delete({ where: { id: item.id } }),
    ).rejects.toThrow();
    const charge = await db.encounterCharge.findFirstOrThrow();
    await expect(
      db.encounterCharge.create({
        data: {
          hospitalId,
          encounterId,
          serviceItemId: charge.serviceItemId,
          sourceType: 'SURGERY_CONSUMABLE',
          sourceId: item.id,
          quantity: 1,
          unitPrice: 3,
          totalAmount: 3,
        },
      }),
    ).rejects.toThrow();
  });
  it('returns exact Money previews and a safe team projection', async () => {
    await dispense('0.500');
    await db.surgeryTeam.create({
      data: {
        surgeryCaseId: caseId,
        userId,
        role: 'SURGEON',
        commissionAmount: '999999999999999.999',
      },
    });
    const detail = await service.getCaseDetails(hospitalId, caseId);
    expect(detail?.financialPreview.consumables).toBe('1.666');
    expect(detail?.financialPreview.teamCommissions).toBe(
      '999999999999999.999',
    );
    expect(Object.keys(detail!.team[0].user).sort()).toEqual([
      'fullName',
      'id',
    ]);
  });
  it('posts zero-cost supplies without inventing a journal amount', async () => {
    await db.product.update({
      where: { id: productId },
      data: { costPrice: 0, sellPrice: 0 },
    });
    const item = await dispense();
    expect(item.totalCost?.toString()).toBe('0');
    expect(await db.accountingEntry.count()).toBe(0);
    expect(await db.encounterCharge.count()).toBe(1);
    expect(
      await db.auditLog.count({
        where: { action: 'DISPENSE_SURGERY_CONSUMABLE' },
      }),
    ).toBe(1);
  });
  it('retains the rounding remainder until final WAC removal', async () => {
    await db.product.update({
      where: { id: productId },
      data: { costPrice: '0.001' },
    });
    const a = await dispense('0.500');
    const b = await dispense('0.500');
    expect(a.totalCost?.toString()).toBe('0.001');
    expect(b.totalCost?.toString()).toBe('0');
    expect(Money.toDbString(Money.sumDecimal(a.totalCost, b.totalCost))).toBe(
      '0.001',
    );
  });
  it('does not change source when mandatory configuration audit fails', async () => {
    const other = await db.warehouse.create({
      data: { hospitalId, name: 'Other source' },
    });
    await db.$executeRawUnsafe(
      `CREATE FUNCTION repair_surgery_source_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        `CREATE TRIGGER repair_surgery_source_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION repair_surgery_source_failure()`,
      );
      await expect(
        service.configureSurgerySource(hospitalId, userId, {
          warehouseId: other.id,
          reason: 'Synthetic source change',
        }),
      ).rejects.toThrow();
      expect(
        (
          await db.surgeryWarehousePolicy.findUniqueOrThrow({
            where: { hospitalId },
          })
        ).warehouseId,
      ).toBe(warehouseId);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS repair_surgery_source_failure ON "AuditLog"',
      );
      await db.$executeRawUnsafe(
        'DROP FUNCTION repair_surgery_source_failure()',
      );
    }
  });
});
