import { responseBody } from '../http-response';
type TestResponse = {
  id: number;
  code: string;
  type: string;
  costPrice: string;
  sellPrice: string;
  totalProducts: number;
  totalValue: number;
  totalValueText: string;
  lowStockCount: number;
};
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Inventory master data, UOM tenant isolation, warehouse lifecycle, valuation dashboard & procurement order integrity (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let token: string;
  let otherToken: string;
  let hospitalId: number;
  let otherHospitalId: number;
  let warehouseId: number;
  let supplierId: number;
  let boxUomId: number;
  let tabUomId: number;

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
    const auth = new AuthHelper(db, app.get(JwtService));
    const actor = await auth.createTestUser('inv-master-actor', 'synthetic', {
      permissions: ['inventory:view', 'inventory:manage'],
    });
    hospitalId = actor.user.hospitalId;
    token = actor.accessToken;

    const otherHospital = await db.hospital.create({
      data: {
        code: 'OTHER_HOSP_MASTER',
        name: 'Other Hospital Master Test',
        isActive: true,
      },
    });
    const otherActor = await auth.createTestUser(
      'inv-master-other-actor',
      'synthetic',
      {
        hospitalId: otherHospital.id,
        permissions: ['inventory:view', 'inventory:manage'],
      },
    );
    otherHospitalId = otherActor.user.hospitalId;
    otherToken = otherActor.accessToken;

    warehouseId = (
      await db.warehouse.create({
        data: {
          hospitalId,
          code: 'WH-MASTER-1',
          name: 'Master Main Warehouse',
          isActive: true,
        },
      })
    ).id;

    supplierId = (
      await db.supplier.create({
        data: {
          hospitalId,
          code: 'SUP-MASTER-1',
          name: 'Master Medical Supplier',
          isActive: true,
        },
      })
    ).id;

    tabUomId = (
      await db.unitOfMeasure.create({
        data: {
          hospitalId,
          name: 'Tablet',
          code: 'TAB',
          isActive: true,
        },
      })
    ).id;

    boxUomId = (
      await db.unitOfMeasure.create({
        data: {
          hospitalId,
          name: 'Box of 10',
          code: 'BOX10',
          isActive: true,
        },
      })
    ).id;
  });

  it('enforces WAC-only category valuation, account type/tenant ownership, and product master data invariants', async () => {
    const assetAccount = await db.account.create({
      data: {
        hospitalId,
        code: '1300-INV',
        name: 'Inventory Asset',
        type: 'ASSET',
        isActive: true,
      },
    });
    const expenseAccount = await db.account.create({
      data: {
        hospitalId,
        code: '5100-EXP',
        name: 'Medical Supplies Expense',
        type: 'EXPENSE',
        isActive: true,
      },
    });
    const foreignAccount = await db.account.create({
      data: {
        hospitalId: otherHospitalId,
        code: '1300-FOREIGN',
        name: 'Foreign Asset',
        type: 'ASSET',
        isActive: true,
      },
    });

    const fifoRes = await request(app.getHttpServer())
      .post('/inventory/master-data/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Unsupported FIFO Category',
        valuationMethod: 'FIFO',
      });
    expect(fifoRes.status).toBe(400);

    const wrongTypeRes = await request(app.getHttpServer())
      .post('/inventory/master-data/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Wrong Account Type Category',
        inventoryAccountId: expenseAccount.id,
      });
    expect(wrongTypeRes.status).toBe(400);

    const crossTenantCatRes = await request(app.getHttpServer())
      .post('/inventory/master-data/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Cross Tenant Category',
        inventoryAccountId: foreignAccount.id,
      });
    expect(crossTenantCatRes.status).toBe(400);

    const validCatRes = await request(app.getHttpServer())
      .post('/inventory/master-data/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Clinical Consumables',
        code: 'cat-clin-01',
        valuationMethod: 'WEIGHTED_AVERAGE',
        inventoryAccountId: assetAccount.id,
        expenseAccountId: expenseAccount.id,
      });
    expect(validCatRes.status).toBe(201);
    expect(responseBody<TestResponse>(validCatRes).code).toBe('CAT-CLIN-01');

    const badMinMaxRes = await request(app.getHttpServer())
      .post('/inventory/master-data/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'PRD-BAD-MINMAX',
        name: 'Invalid Min Max Product',
        type: 'SUPPLY',
        minStock: 50,
        maxStock: 10,
      });
    expect(badMinMaxRes.status).toBe(400);

    const productRes = await request(app.getHttpServer())
      .post('/inventory/master-data/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: ' prd-cons-01 ',
        name: 'Sterile Gauze Roll',
        type: 'CONSUMABLE',
        categoryId: responseBody<TestResponse>(validCatRes).id,
        baseUomId: tabUomId,
        expenseAccountId: expenseAccount.id,
        costPrice: 12.345,
        sellPrice: 18.5,
        minStock: 15,
        maxStock: 150,
      });
    expect(productRes.status).toBe(201);
    expect(responseBody<TestResponse>(productRes).code).toBe('PRD-CONS-01');
    expect(responseBody<TestResponse>(productRes).type).toBe('SUPPLY');
    expect(Number(responseBody<TestResponse>(productRes).costPrice)).toBe(
      12.345,
    );
    expect(Number(responseBody<TestResponse>(productRes).sellPrice)).toBe(18.5);
  });

  it('enforces tenant isolation, base UOM conversionRate=1, single defaults, and historical reference protection on ProductUOM and UnitOfMeasure', async () => {
    const product = await db.product.create({
      data: {
        hospitalId,
        code: 'PRD-UOM-1',
        name: 'Amoxicillin 500mg',
        type: 'DRUG',
        baseUomId: tabUomId,
        costPrice: 0.5,
        sellPrice: 1,
      },
    });

    const crossTenantAdd = await request(app.getHttpServer())
      .post(`/inventory/products/${product.id}/uoms`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        uomId: boxUomId,
        conversionRate: 10,
      });
    expect(crossTenantAdd.status).toBe(404);

    const invalidBaseRate = await request(app.getHttpServer())
      .post(`/inventory/products/${product.id}/uoms`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        uomId: tabUomId,
        conversionRate: 5,
      });
    expect(invalidBaseRate.status).toBe(400);

    const baseLinkRes = await request(app.getHttpServer())
      .post(`/inventory/products/${product.id}/uoms`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        uomId: tabUomId,
        conversionRate: 1,
        isPurchasingUOM: true,
        isIssuingUOM: true,
      });
    expect(baseLinkRes.status).toBe(201);

    const boxLinkRes = await request(app.getHttpServer())
      .post(`/inventory/products/${product.id}/uoms`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        uomId: boxUomId,
        conversionRate: 10,
        isPurchasingUOM: true,
      });
    expect(boxLinkRes.status).toBe(201);

    const links = await db.productUOM.findMany({
      where: { productId: product.id },
      orderBy: { uomId: 'asc' },
    });
    const tabLink = links.find((l) => l.uomId === tabUomId)!;
    const boxLink = links.find((l) => l.uomId === boxUomId)!;
    expect(tabLink.isPurchasingUOM).toBe(false);
    expect(boxLink.isPurchasingUOM).toBe(true);

    // Create a PO referencing boxUomId to lock its conversion factor
    const poRes = await request(app.getHttpServer())
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        items: [
          {
            productId: product.id,
            uomId: boxUomId,
            quantity: 3,
            unitPrice: 5,
          },
        ],
      });
    expect(poRes.status).toBe(201);

    const mutateReferencedRate = await request(app.getHttpServer())
      .post(`/inventory/products/${product.id}/uoms`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        uomId: boxUomId,
        conversionRate: 20,
      });
    expect(mutateReferencedRate.status).toBe(409);

    const deleteReferencedProductUom = await request(app.getHttpServer())
      .delete(`/inventory/products/${product.id}/uoms/${boxUomId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteReferencedProductUom.status).toBe(409);

    const deactivateBaseUom = await request(app.getHttpServer())
      .put(`/inventory/master-data/uoms/${tabUomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    expect(deactivateBaseUom.status).toBe(409);

    const deleteBaseUom = await request(app.getHttpServer())
      .delete(`/inventory/master-data/uoms/${tabUomId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteBaseUom.status).toBe(409);

    const missingUomDelete = await request(app.getHttpServer())
      .delete('/inventory/master-data/uoms/999999')
      .set('Authorization', `Bearer ${token}`);
    expect(missingUomDelete.status).toBe(404);
  });

  it('prevents deactivating a warehouse holding positive stock or configured as a hospital policy, and computes exact Money WAC valuation on the dashboard', async () => {
    const productA = await db.product.create({
      data: {
        hospitalId,
        code: 'VAL-PRD-A',
        name: 'Valuation Product A',
        type: 'DRUG',
        stockOnHand: 3,
        costPrice: 1.005,
        sellPrice: 2,
        minStock: 5,
      },
    });
    const productB = await db.product.create({
      data: {
        hospitalId,
        code: 'VAL-PRD-B',
        name: 'Valuation Product B',
        type: 'SUPPLY',
        stockOnHand: 10,
        costPrice: 2.5,
        sellPrice: 4,
        minStock: 5,
      },
    });
    const deletedProduct = await db.product.create({
      data: {
        hospitalId,
        code: 'VAL-PRD-DEL',
        name: 'Soft Deleted Product',
        type: 'SUPPLY',
        stockOnHand: 100,
        costPrice: 50,
        sellPrice: 75,
        isDeleted: true,
      },
    });

    await db.productStock.createMany({
      data: [
        {
          hospitalId,
          warehouseId,
          productId: productA.id,
          batchNumber: 'BATCH-A1',
          quantity: 3,
          unitCost: 1.005,
          minStock: 5,
        },
        {
          hospitalId,
          warehouseId,
          productId: productB.id,
          batchNumber: 'BATCH-B1',
          quantity: 10,
          unitCost: 2.5,
          minStock: 5,
        },
        {
          hospitalId,
          warehouseId,
          productId: deletedProduct.id,
          batchNumber: 'BATCH-DEL',
          quantity: 100,
          unitCost: 50,
        },
      ],
    });

    const deactivateWithStockRes = await request(app.getHttpServer())
      .put(`/warehouses/${warehouseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    expect(deactivateWithStockRes.status).toBe(409);

    const statsRes = await request(app.getHttpServer())
      .get(`/inventory/counts/dashboard/stats?warehouseId=${warehouseId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(statsRes.status).toBe(200);
    // Product A: 3 * 1.005 = 3.015 (3dp LYD)
    // Product B: 10 * 2.500 = 25.000
    // Total = 28.015 (soft-deleted product excluded)
    expect(responseBody<TestResponse>(statsRes).totalProducts).toBe(2);
    expect(responseBody<TestResponse>(statsRes).totalValue).toBe(28.015);
    expect(responseBody<TestResponse>(statsRes).totalValueText).toBe('28.015');
    expect(responseBody<TestResponse>(statsRes).lowStockCount).toBe(1);

    const foreignStatsRes = await request(app.getHttpServer())
      .get(`/inventory/counts/dashboard/stats?warehouseId=${warehouseId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(foreignStatsRes.status).toBe(404);

    const alerts = await app
      .get(InventoryService)
      .monitorStockLevels(hospitalId);
    expect(alerts.lowStock).toHaveLength(1);
    expect(alerts.lowStock[0].productId).toBe(productA.id);
  });

  it('rejects unlinked UOMs in PR/PO creation and serializes concurrent createPOFromPR requests to prevent duplicate purchase orders', async () => {
    const unlinkedUom = await db.unitOfMeasure.create({
      data: {
        hospitalId,
        name: 'Pallet',
        code: 'PAL',
        isActive: true,
      },
    });
    const product = await db.product.create({
      data: {
        hospitalId,
        code: 'PR-PO-PRD-1',
        name: 'IV Saline 500ml',
        type: 'SUPPLY',
        baseUomId: tabUomId,
        costPrice: 1.25,
        sellPrice: 2.5,
      },
    });

    const badPrRes = await request(app.getHttpServer())
      .post('/procurement/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productId: product.id,
            uomId: unlinkedUom.id,
            quantity: 5,
          },
        ],
      });
    expect(badPrRes.status).toBe(400);

    const validPrRes = await request(app.getHttpServer())
      .post('/procurement/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productId: product.id,
            uomId: tabUomId,
            quantity: 8,
          },
        ],
      });
    expect(validPrRes.status).toBe(201);
    const prId = responseBody<TestResponse>(validPrRes).id;

    const [poA, poB] = await Promise.all([
      request(app.getHttpServer())
        .post('/procurement/orders/from-pr')
        .set('Authorization', `Bearer ${token}`)
        .send({ prId, supplierId }),
      request(app.getHttpServer())
        .post('/procurement/orders/from-pr')
        .set('Authorization', `Bearer ${token}`)
        .send({ prId, supplierId }),
    ]);

    expect([poA.status, poB.status].sort()).toEqual([201, 409]);

    const poCount = await db.purchaseOrder.count({
      where: { hospitalId },
    });
    expect(poCount).toBe(1);
  });
});
