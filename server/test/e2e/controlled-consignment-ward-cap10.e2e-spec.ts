import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('CAP10 Controlled Substances, Consignment Stock & Ward Stock Returns (Migration #76)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let auth: AuthHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    db = app.get(PrismaService);
    auth = new AuthHelper(db, app.get(JwtService));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('enforces 4-eyes narcotics register + SHA-256 chain, consignment consumption Money math & supplier return, ward return restock safety, and tenant isolation', async () => {
    const pharmacist = await auth.createTestUser('cap10-pharm', 'Pass123!', {
      permissions: [
        'inventory:view',
        'inventory:manage',
        'pharmacy:view',
        'pharmacy:manage',
      ],
    });
    const hospitalA = pharmacist.user.hospitalId;

    const nurse = await auth.createTestUser('cap10-nurse', 'Pass123!', {
      hospitalId: hospitalA,
      permissions: [
        'inventory:view',
        'inventory:manage',
        'pharmacy:view',
        'pharmacy:manage',
      ],
    });

    const foreignHospital = await db.hospital.create({
      data: { code: 'HOSP-CAP10-B', name: 'Foreign Pharmacy Hospital' },
    });
    const foreignUser = await auth.createTestUser('cap10-foreign', 'Pass123!', {
      hospitalId: foreignHospital.id,
      permissions: [
        'inventory:view',
        'inventory:manage',
        'pharmacy:view',
        'pharmacy:manage',
      ],
    });

    const warehouse = await db.warehouse.create({
      data: {
        hospitalId: hospitalA,
        code: 'PHARM-MAIN',
        name: 'Main Pharmacy',
      },
    });
    const supplier = await db.supplier.create({
      data: {
        hospitalId: hospitalA,
        code: 'SUP-IMPLANT',
        name: 'Ortho Consignment Supplier',
      },
    });
    const morphine = await db.product.create({
      data: {
        hospitalId: hospitalA,
        code: 'MOR-10MG',
        name: 'Morphine Sulfate 10mg/mL Ampoule',
        isControlled: true,
        controlledSchedule: 'SCHEDULE_II',
        costPrice: '12.5000',
        sellPrice: '20.0000',
        stockOnHand: '0.000',
      },
    });
    const stent = await db.product.create({
      data: {
        hospitalId: hospitalA,
        code: 'STENT-DES',
        name: 'Drug-Eluting Coronary Stent',
        type: 'SUPPLY',
        isControlled: false,
        costPrice: '1500.0000',
        sellPrice: '2200.0000',
        stockOnHand: '0.000',
      },
    });
    const antibiotic = await db.product.create({
      data: {
        hospitalId: hospitalA,
        code: 'CEFT-1G',
        name: 'Ceftriaxone 1g Vial',
        isControlled: false,
        costPrice: '8.2500',
        sellPrice: '15.0000',
        stockOnHand: '50.000',
      },
    });
    const patient = await db.patient.create({
      data: {
        hospitalId: hospitalA,
        mrn: 'CAP10-P1',
        fullName: 'Khaled Inpatient',
        gender: 'MALE',
      },
    });
    const encounter = await db.encounter.create({
      data: {
        hospitalId: hospitalA,
        patientId: patient.id,
        type: 'IPD',
        status: 'OPEN',
      },
    });

    // 1. Controlled Substance (Narcotics) Double-Sign Register
    // Self-witnessing MUST be blocked (409)
    await request(app.getHttpServer())
      .post('/inventory/governance/controlled-logs')
      .auth(pharmacist.accessToken, { type: 'bearer' })
      .send({
        warehouseId: warehouse.id,
        productId: morphine.id,
        batchNumber: 'MOR-B1',
        transactionType: 'RECEIPT',
        quantity: 20,
        witnessedById: pharmacist.user.id,
        reason: 'Self witness must fail',
      })
      .expect(409);

    // Non-controlled product MUST be rejected (400)
    await request(app.getHttpServer())
      .post('/inventory/governance/controlled-logs')
      .auth(pharmacist.accessToken, { type: 'bearer' })
      .send({
        warehouseId: warehouse.id,
        productId: antibiotic.id,
        batchNumber: 'CEF-B1',
        transactionType: 'RECEIPT',
        quantity: 10,
        witnessedById: nurse.user.id,
        reason: 'Not controlled',
      })
      .expect(400);

    // RECEIPT of 20 ampoules with independent witness
    const receiptLog = await request(app.getHttpServer())
      .post('/inventory/governance/controlled-logs')
      .auth(pharmacist.accessToken, { type: 'bearer' })
      .send({
        warehouseId: warehouse.id,
        productId: morphine.id,
        batchNumber: 'MOR-B1',
        transactionType: 'RECEIPT',
        quantity: 20,
        witnessedById: nurse.user.id,
        reason: 'Initial vault receipt from Ministry of Health narcotics store',
      })
      .expect(201);
    const firstLogId = (receiptLog.body as { id: number }).id;

    // DISPENSE 1.5 ampoules + 0.5 wasted = -2.000 -> balance 18.000
    await request(app.getHttpServer())
      .post('/inventory/governance/controlled-logs')
      .auth(nurse.accessToken, { type: 'bearer' })
      .send({
        warehouseId: warehouse.id,
        productId: morphine.id,
        batchNumber: 'MOR-B1',
        transactionType: 'DISPENSE',
        quantity: 1.5,
        wastedQuantity: 0.5,
        patientId: patient.id,
        encounterId: encounter.id,
        witnessedById: pharmacist.user.id,
        reason: 'Post-op pain dose 15mg administered; 5mg wasted with witness',
      })
      .expect(201);

    // Over-dispensing (> 18.000) MUST be blocked (409)
    await request(app.getHttpServer())
      .post('/inventory/governance/controlled-logs')
      .auth(nurse.accessToken, { type: 'bearer' })
      .send({
        warehouseId: warehouse.id,
        productId: morphine.id,
        batchNumber: 'MOR-B1',
        transactionType: 'DISPENSE',
        quantity: 25,
        patientId: patient.id,
        witnessedById: pharmacist.user.id,
        reason: 'Exceeds balance',
      })
      .expect(409);

    // Verify cryptographic SHA-256 chain integrity
    const chainRes = await request(app.getHttpServer())
      .get(
        `/inventory/governance/controlled-logs/verify?warehouseId=${warehouse.id}&productId=${morphine.id}&batchNumber=MOR-B1`,
      )
      .auth(pharmacist.accessToken, { type: 'bearer' })
      .expect(200);
    expect(chainRes.body).toMatchObject({
      valid: true,
      count: 2,
      currentBalance: '18.000',
    });

    // PostgreSQL trigger blocks UPDATE & DELETE on ControlledSubstanceLog
    await expect(
      db.$executeRaw`DELETE FROM "ControlledSubstanceLog" WHERE id = ${firstLogId}`,
    ).rejects.toThrow(/append-only/i);

    // 2. Consignment Stock Lifecycle (Receive -> Consume with Money -> Return Unused)
    const consRes = await request(app.getHttpServer())
      .post('/inventory/governance/consignments')
      .auth(pharmacist.accessToken, { type: 'bearer' })
      .send({
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        productId: stent.id,
        batchNumber: 'STENT-LOT-99',
        serialNumber: 'SN-88210',
        expiryDate: '2028-12-31T00:00:00Z',
        quantityReceived: 5,
        agreedUnitPrice: 1250.3335,
      })
      .expect(201);
    const consignmentId = (consRes.body as { id: number }).id;

    // Consume 2 stents for patient encounter -> totalAmount = 2 * 1250.3335 = 2500.667
    const consumeRes = await request(app.getHttpServer())
      .post(`/inventory/governance/consignments/${consignmentId}/consume`)
      .auth(nurse.accessToken, { type: 'bearer' })
      .send({
        encounterId: encounter.id,
        quantity: 2,
        witnessedById: pharmacist.user.id,
        notes: 'LAD angioplasty implantation',
      })
      .expect(201);
    expect(consumeRes.body).toMatchObject({
      consumption: {
        quantity: '2',
        unitPrice: '1250.3335',
        totalAmount: '2500.667',
        supplierBillStatus: 'PENDING_BILLING',
      },
      receipt: {
        quantityConsumed: '2',
        status: 'PARTIALLY_CONSUMED',
      },
    });

    // Return remaining 3 stents to supplier -> FULLY_CONSUMED (all 5 accounted for)
    const retSupRes = await request(app.getHttpServer())
      .post(
        `/inventory/governance/consignments/${consignmentId}/return-supplier`,
      )
      .auth(pharmacist.accessToken, { type: 'bearer' })
      .send({
        quantity: 3,
        reason: 'Unused consignment items returned at contract end',
      })
      .expect(201);
    expect(retSupRes.body).toMatchObject({
      quantityReturned: '3',
      status: 'FULLY_CONSUMED',
    });

    // Consuming more than available is blocked (409)
    await request(app.getHttpServer())
      .post(`/inventory/governance/consignments/${consignmentId}/consume`)
      .auth(nurse.accessToken, { type: 'bearer' })
      .send({ encounterId: encounter.id, quantity: 1 })
      .expect(409);

    // 3. Ward Stock Return (Seal & Cold-Chain Gate + Pharmacist 4-Eyes Restock)
    // Broken seal return cannot be approved for restock (409)
    const brokenRetRes = await request(app.getHttpServer())
      .post('/inventory/governance/ward-returns')
      .auth(nurse.accessToken, { type: 'bearer' })
      .send({
        warehouseId: warehouse.id,
        productId: antibiotic.id,
        batchNumber: 'CEF-01',
        expiryDate: '2028-01-01T00:00:00Z',
        quantity: 4,
        reason: 'Patient discharged early',
        sealIntact: false,
        coldChainMaintained: true,
      })
      .expect(201);
    const brokenRetId = (brokenRetRes.body as { id: number }).id;

    await request(app.getHttpServer())
      .post(`/inventory/governance/ward-returns/${brokenRetId}/review`)
      .auth(pharmacist.accessToken, { type: 'bearer' })
      .send({ decision: 'APPROVE_RESTOCK' })
      .expect(409);

    // Reject to destroy succeeds
    await request(app.getHttpServer())
      .post(`/inventory/governance/ward-returns/${brokenRetId}/review`)
      .auth(pharmacist.accessToken, { type: 'bearer' })
      .send({
        decision: 'REJECT_DESTROY',
        reviewNotes: 'Seal broken; routed to pharmaceutical waste',
      })
      .expect(201);

    // Intact return: self-approval by nurse blocked (409), pharmacist approval restocks atomically (+6 -> 56.000)
    const intactRetRes = await request(app.getHttpServer())
      .post('/inventory/governance/ward-returns')
      .auth(nurse.accessToken, { type: 'bearer' })
      .send({
        warehouseId: warehouse.id,
        productId: antibiotic.id,
        batchNumber: 'CEF-02',
        expiryDate: '2028-06-01T00:00:00Z',
        quantity: 6,
        reason: 'Therapy switched to oral antibiotic',
        sealIntact: true,
        coldChainMaintained: true,
      })
      .expect(201);
    const intactRetId = (intactRetRes.body as { id: number }).id;

    await request(app.getHttpServer())
      .post(`/inventory/governance/ward-returns/${intactRetId}/review`)
      .auth(nurse.accessToken, { type: 'bearer' })
      .send({ decision: 'APPROVE_RESTOCK' })
      .expect(409);

    const approvedRet = await request(app.getHttpServer())
      .post(`/inventory/governance/ward-returns/${intactRetId}/review`)
      .auth(pharmacist.accessToken, { type: 'bearer' })
      .send({
        decision: 'APPROVE_RESTOCK',
        reviewNotes: 'Seal intact, expiry valid, restocked to main pharmacy',
      })
      .expect(201);
    expect(approvedRet.body).toMatchObject({ status: 'APPROVED_RESTOCKED' });

    const updatedProduct = await db.product.findUniqueOrThrow({
      where: { id: antibiotic.id },
    });
    expect(updatedProduct.stockOnHand.toFixed(3)).toBe('56.000');

    // Finalized WardStockReturn cannot be deleted or tampered with
    await expect(
      db.$executeRaw`UPDATE "WardStockReturn" SET status = 'PENDING_PHARMACIST' WHERE id = ${intactRetId}`,
    ).rejects.toThrow(/immutable/i);

    // 4. Cross-Tenant Isolation: foreign hospital gets 404 on Hospital A consignment/ward-return
    await request(app.getHttpServer())
      .post(`/inventory/governance/consignments/${consignmentId}/consume`)
      .auth(foreignUser.accessToken, { type: 'bearer' })
      .send({ encounterId: encounter.id, quantity: 1 })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/inventory/governance/ward-returns/${intactRetId}/review`)
      .auth(foreignUser.accessToken, { type: 'bearer' })
      .send({ decision: 'REJECT_DESTROY' })
      .expect(404);
  });
});
