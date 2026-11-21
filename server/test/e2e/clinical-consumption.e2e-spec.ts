import { CashierService } from '../../src/cashier/cashier.service';
import { seedFinancialAccounts } from '../financial-fixture';
import { LabService } from '../../src/labs/labs.service';
import { RadiologyService } from '../../src/radiology/radiology.service';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OrdersService } from '../../src/orders/orders.service';
import { InventoryAutoDepletionListener } from '../../src/inventory/inventory-auto-depletion.listener';
import { AuthHelper } from '../auth-helper';
import { JwtService } from '@nestjs/jwt';
import { resetDatabase } from '../db-reset';
import { InventoryService } from '../../src/inventory/inventory.service';

describe('Atomic clinical completion and durable consumption intent', () => {
  let app: INestApplication;
  let db: PrismaService;
  let orders: OrdersService;
  let hospitalId: number;
  let userId: number;
  let encounterId: number;
  let serviceId: number;
  let productId: number;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    orders = app.get(OrdersService);
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    const actor = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'clinical-intent',
      'synthetic',
    );
    hospitalId = actor.user.hospitalId;
    userId = actor.user.id;
    const patient = await db.patient.create({
      data: { hospitalId, mrn: 'INTENT-P', fullName: 'Synthetic patient' },
    });
    encounterId = (
      await db.encounter.create({
        data: { hospitalId, patientId: patient.id, type: 'OPD' },
      })
    ).id;
    serviceId = (
      await db.serviceItem.create({
        data: {
          hospitalId,
          name: 'Synthetic clinical service',
          type: 'OTHER',
          defaultPrice: 0,
        },
      })
    ).id;
    const warehouse = await db.warehouse.create({
      data: { hospitalId, name: 'Synthetic source' },
    });
    await db.consumptionWarehousePolicy.create({
      data: { hospitalId, warehouseId: warehouse.id, updatedById: userId },
    });
    const product = await db.product.create({
      data: {
        hospitalId,
        code: 'INTENT-MATERIAL',
        name: 'Synthetic material',
        stockOnHand: 2,
        costPrice: 0,
      },
    });
    productId = product.id;
    await db.productStock.create({
      data: {
        hospitalId,
        warehouseId: warehouse.id,
        productId,
        batchNumber: 'INTENT-BATCH',
        quantity: 2,
        unitCost: 0,
      },
    });
    await db.serviceItemProduct.create({
      data: { serviceItemId: serviceId, productId, quantity: 1 },
    });
  });
  const fixture = async (kind: 'LAB' | 'RADIOLOGY', primary = false) => {
    if (kind === 'LAB') {
      const test = await db.labTest.create({
        data: {
          hospitalId,
          code: 'INTENT-LAB',
          name: 'Synthetic test',
          serviceItemId: serviceId,
        },
      });
      const result = await orders.createLabOrder({
        hospitalId,
        encounterId,
        orderedById: userId,
        testId: test.id,
      });
      return {
        parent: result.order.id,
        id: result.labOrder.id,
        complete: (branch = hospitalId) =>
          primary
            ? app.get(LabService).completeOrder({
                hospitalId: branch,
                labOrderId: result.labOrder.id,
                performedById: userId,
                resultValue: 'Synthetic result',
              })
            : orders.updateLabResult({
                hospitalId: branch,
                labOrderId: result.labOrder.id,
                resultStatus: 'COMPLETED',
                resultValue: 'Synthetic result',
                userId,
              }),
        status: async () =>
          (
            await db.labOrder.findUniqueOrThrow({
              where: { id: result.labOrder.id },
            })
          ).resultStatus,
      };
    }
    const study = await db.radiologyStudy.create({
      data: {
        hospitalId,
        code: 'INTENT-RAD',
        name: 'Synthetic study',
        serviceItemId: serviceId,
      },
    });
    const result = await orders.createRadiologyOrder({
      hospitalId,
      encounterId,
      orderedById: userId,
      studyId: study.id,
    });
    await db.order.update({
      where: { id: result.order.id },
      data: { paymentStatus: 'WAIVED' },
    });
    return {
      parent: result.order.id,
      id: result.radiologyOrder.id,
      complete: (branch = hospitalId) =>
        primary
          ? app.get(RadiologyService).completeOrderWithReport({
              hospitalId: branch,
              radiologyOrderId: result.radiologyOrder.id,
              reportedById: userId,
              reportText: 'Synthetic report',
            })
          : orders.updateRadiologyReport({
              hospitalId: branch,
              radiologyOrderId: result.radiologyOrder.id,
              status: 'COMPLETED',
              reportText: 'Synthetic report',
              userId,
            }),
      status: async () =>
        (
          await db.radiologyOrder.findUniqueOrThrow({
            where: { id: result.radiologyOrder.id },
          })
        ).status,
    };
  };
  it('releases an x-ray from the cashier only after settlement and rejects cancelled work', async () => {
    await seedFinancialAccounts(db, hospitalId);
    const year = new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1) - 1);
    await db.financialYear.create({
      data: {
        hospitalId,
        code: 'XRAY-YEAR',
        name: String(year),
        startDate: start,
        endDate: end,
        status: 'OPEN',
        isCurrent: true,
        periods: {
          create: {
            periodCode: 'XRAY-P',
            periodIndex: 1,
            monthStartDate: start,
            monthEndDate: end,
            numberOfDays: 365,
            isOpen: true,
          },
        },
      },
    });
    await db.serviceItem.update({
      where: { id: serviceId },
      data: { type: 'RADIOLOGY', defaultPrice: '60.125' },
    });
    const study = await db.radiologyStudy.create({
      data: {
        hospitalId,
        code: 'XRAY-PAY-GATE',
        name: 'Synthetic x-ray',
        modality: 'DX',
        serviceItemId: serviceId,
      },
    });
    const { order, radiologyOrder: examination } =
      await orders.createRadiologyOrder({
        hospitalId,
        encounterId,
        orderedById: userId,
        studyId: study.id,
      });
    const radiology = app.get(RadiologyService);
    const charge = await db.encounterCharge.findFirstOrThrow({
      where: {
        hospitalId,
        sourceType: 'RADIOLOGY_ORDER',
        sourceId: examination.id,
      },
    });
    expect(charge.invoiceId).not.toBeNull();
    expect(await radiology.getWorklist(hospitalId)).toEqual([]);
    await expect(
      radiology.startProcessing(hospitalId, examination.id, userId),
    ).rejects.toThrow('الخزينة');
    await expect(
      radiology.completeOrderWithReport({
        hospitalId,
        radiologyOrderId: examination.id,
        reportedById: userId,
      }),
    ).rejects.toThrow('الخزينة');
    await expect(
      orders.updateRadiologyReport({
        hospitalId,
        radiologyOrderId: examination.id,
        status: 'COMPLETED',
      }),
    ).rejects.toThrow('الخزينة');
    const cashier = app.get(CashierService);
    const payment = {
      hospitalId,
      invoiceId: charge.invoiceId!,
      method: 'TRANSFER' as const,
      userId,
    };
    await cashier.recordPayment({ ...payment, amount: 30 });
    expect(await radiology.getWorklist(hospitalId)).toEqual([]);
    await expect(
      radiology.startProcessing(hospitalId, examination.id, userId),
    ).rejects.toThrow('الخزينة');
    await cashier.recordPayment({ ...payment, amount: 30.125 });
    expect(await radiology.getWorklist(hospitalId)).toEqual([
      expect.objectContaining({ id: examination.id }),
    ]);
    expect(
      (await radiology.startProcessing(hospitalId, examination.id, userId))
        .status,
    ).toBe('IN_PROGRESS');
    await db.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    });
    expect(await radiology.getWorklist(hospitalId)).toEqual([]);
    await expect(
      radiology.completeOrderWithReport({
        hospitalId,
        radiologyOrderId: examination.id,
        reportedById: userId,
      }),
    ).rejects.toThrow('ملغى');
  });
  it('keeps an empty material snapshot empty after mappings are added later', async () => {
    await db.serviceItemProduct.deleteMany({
      where: { serviceItemId: serviceId },
    });
    const f = await fixture('LAB');
    await f.complete();
    await db.serviceItemProduct.create({
      data: { serviceItemId: serviceId, productId, quantity: 2 },
    });
    await app.get(InventoryAutoDepletionListener).retryPending();
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('2');
    expect(
      (await db.serviceMaterialConsumption.findFirstOrThrow()).status,
    ).toBe('COMPLETED');
  });
  it.each(['LAB', 'RADIOLOGY'] as const)(
    'traces a recalled material to its %s order and encounter',
    async (kind) => {
      const f = await fixture(kind);
      await f.complete();
      await app.get(InventoryAutoDepletionListener).retryPending();
      const batch = await db.productStock.findFirstOrThrow({
        where: { hospitalId, productId, batchNumber: 'INTENT-BATCH' },
      });
      const inventory = app.get(InventoryService);
      await inventory.changeBatchRestriction(
        hospitalId,
        userId,
        batch.id,
        'RECALLED',
        'Synthetic clinical material recall',
      );
      expect(
        await inventory.recallFollowup(hospitalId, userId, batch.id, true),
      ).toMatchObject({
        movements: [
          {
            referenceType: `${kind}_ORDER`,
            referenceId: f.id,
            linked: true,
            encounterId,
            mrn: 'INTENT-P',
          },
        ],
      });
    },
  );
  it('keeps automatic depletion pending for review when all material is quarantined', async () => {
    await db.inventoryBatchRestriction.create({
      data: {
        hospitalId,
        productId,
        batchNumber: 'INTENT-BATCH',
        status: 'QUARANTINED',
        reason: 'Synthetic quality hold',
      },
    });
    const f = await fixture('LAB');
    await f.complete();
    await app.get(InventoryAutoDepletionListener).retryPending();
    expect(
      await db.serviceMaterialConsumption.findFirstOrThrow(),
    ).toMatchObject({ status: 'FAILED' });
    expect(await db.stockTransaction.count()).toBe(0);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('2');
  });
  for (const primary of [false, true])
    for (const kind of ['LAB', 'RADIOLOGY'] as const) {
      it(`${primary ? 'Primary' : 'OrdersService'} ${kind}: persists one intent under concurrent completion and processes it after commit`, async () => {
        const f = await fixture(kind, primary);
        await Promise.all([f.complete(), f.complete()]);
        expect(await f.status()).toBe('COMPLETED');
        expect(
          (await db.order.findUniqueOrThrow({ where: { id: f.parent } }))
            .status,
        ).toBe('COMPLETED');
        expect(await db.serviceMaterialConsumption.count()).toBe(1);
        expect(
          (await db.serviceMaterialConsumption.findFirstOrThrow()).status,
        ).toBe('PENDING');
        if (kind === 'LAB')
          await db.serviceItemProduct.updateMany({
            where: { serviceItemId: serviceId },
            data: { quantity: 2 },
          });
        else
          await db.serviceItemProduct.deleteMany({
            where: { serviceItemId: serviceId },
          });
        await app.get(InventoryAutoDepletionListener).retryPending();
        expect(
          (
            await db.product.findUniqueOrThrow({ where: { id: productId } })
          ).stockOnHand.toString(),
        ).toBe('1');
        expect(
          (await db.serviceMaterialConsumption.findFirstOrThrow()).status,
        ).toBe('COMPLETED');
        const otherService = await db.serviceItem.create({
          data: {
            hospitalId,
            name: 'Remapped synthetic service',
            type: 'OTHER',
            defaultPrice: 0,
          },
        });
        if (kind === 'LAB')
          await db.labTest.updateMany({
            where: { hospitalId },
            data: { serviceItemId: otherService.id },
          });
        else
          await db.radiologyStudy.updateMany({
            where: { hospitalId },
            data: { serviceItemId: otherService.id },
          });
        await f.complete();
        const snapshot = await db.serviceMaterialConsumption.findFirstOrThrow();
        await expect(
          db.serviceMaterialConsumption.update({
            where: { id: snapshot.id },
            data: { materialsSnapshot: [] },
          }),
        ).rejects.toThrow();
        expect(
          (
            await db.product.findUniqueOrThrow({ where: { id: productId } })
          ).stockOnHand.toString(),
        ).toBe('1');
        expect(await db.serviceMaterialConsumption.count()).toBe(1);
      });
      it(`${primary ? 'Primary' : 'OrdersService'} ${kind}: rolls back clinical completion if intent persistence fails`, async () => {
        const f = await fixture(kind, primary);
        await db.$executeRawUnsafe(
          `CREATE FUNCTION repair_intent_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic intent failure'; END $$`,
        );
        try {
          await db.$executeRawUnsafe(
            'CREATE TRIGGER repair_intent_failure BEFORE INSERT ON "ServiceMaterialConsumption" FOR EACH ROW EXECUTE FUNCTION repair_intent_failure()',
          );
          await expect(f.complete()).rejects.toThrow();
          expect(await f.status()).toBe('PENDING');
          expect(
            (await db.order.findUniqueOrThrow({ where: { id: f.parent } }))
              .status,
          ).toBe('NEW');
          expect(await db.serviceMaterialConsumption.count()).toBe(0);
        } finally {
          await db.$executeRawUnsafe(
            'DROP TRIGGER IF EXISTS repair_intent_failure ON "ServiceMaterialConsumption"',
          );
          await db.$executeRawUnsafe('DROP FUNCTION repair_intent_failure()');
        }
      });
      it(`${primary ? 'Primary' : 'OrdersService'} ${kind}: rejects completion from another branch`, async () => {
        const f = await fixture(kind, primary);
        const other = await db.hospital.create({
          data: { code: 'INTENT-FOREIGN', name: 'Synthetic foreign' },
        });
        await expect(f.complete(other.id)).rejects.toThrow();
        expect(await f.status()).toBe('PENDING');
        expect(await db.serviceMaterialConsumption.count()).toBe(0);
      });
    }
});
