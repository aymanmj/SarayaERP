// server/test/e2e/cap08-drg-billing-cap10-consignment-ap.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { Money } from '../../src/common/utils/money.util';

describe('Phase 6 Batch 26 — CAP08 DRG Automated Discharge Invoicing & CAP10 Consignment Supplier AP Billing (Migration #80)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let auth: AuthHelper;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    db = app.get(PrismaService);
    auth = new AuthHelper(db, app.get(JwtService));
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('closes CAP08 DRG discharge invoicing with patient/insurance split + balanced GL and CAP10 consignment supplier AP billing + GL, with trigger immutability & tenant isolation', async () => {
    const admin = await auth.createTestUser('b26-admin', 'synthetic', {
      permissions: [
        'surgery:view',
        'surgery:manage',
        'billing:view',
        'billing:manage',
        'inventory:view',
        'inventory:manage',
        'accounting:view',
        'accounting:manage',
        'purchases:manage',
      ],
    });
    const hospitalId = admin.user.hospitalId;

    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_B26_OTHER_${Date.now()}`,
        name: 'Other Hospital B26',
        isActive: true,
      },
    });
    const foreignUser = await auth.createTestUser('b26-foreign', 'synthetic', {
      hospitalId: otherHospital.id,
      permissions: [
        'surgery:manage',
        'billing:manage',
        'inventory:manage',
        'accounting:manage',
      ],
    });

    // 1. Setup Open Financial Year/Period & Required Chart of Accounts + System Mappings
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const yearEnd = new Date(
      Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59),
    );
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59),
    );

    const fy = await db.financialYear.create({
      data: {
        hospitalId,
        name: `FY ${now.getUTCFullYear()}`,
        code: `FY-${now.getUTCFullYear()}`,
        startDate: yearStart,
        endDate: yearEnd,
        status: 'OPEN',
        isCurrent: true,
      },
    });
    await db.financialPeriod.create({
      data: {
        financialYearId: fy.id,
        periodIndex: now.getUTCMonth() + 1,
        periodCode: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
        monthStartDate: monthStart,
        monthEndDate: monthEnd,
        numberOfDays: 30,
        isOpen: true,
      },
    });

    const arPatient = await db.account.create({
      data: {
        hospitalId,
        code: '120100',
        name: 'ذمم المرضى',
        type: 'ASSET',
        isActive: true,
      },
    });
    const arInsurance = await db.account.create({
      data: {
        hospitalId,
        code: '120200',
        name: 'ذمم شركات التأمين',
        type: 'ASSET',
        isActive: true,
      },
    });
    const apSuppliers = await db.account.create({
      data: {
        hospitalId,
        code: '200100',
        name: 'دائنون - الموردون',
        type: 'LIABILITY',
        isActive: true,
      },
    });
    const revSurgery = await db.account.create({
      data: {
        hospitalId,
        code: '400400',
        name: 'إيرادات العمليات الجراحية',
        type: 'REVENUE',
        isActive: true,
      },
    });
    const revInpatient = await db.account.create({
      data: {
        hospitalId,
        code: '400200',
        name: 'إيرادات الإيواء',
        type: 'REVENUE',
        isActive: true,
      },
    });
    const revRadiology = await db.account.create({
      data: {
        hospitalId,
        code: '400600',
        name: 'إيرادات الأشعة',
        type: 'REVENUE',
        isActive: true,
      },
    });
    const cogsSupplies = await db.account.create({
      data: {
        hospitalId,
        code: '500200',
        name: 'تكلفة المستلزمات الطبية',
        type: 'EXPENSE',
        isActive: true,
      },
    });
    const bankMain = await db.account.create({
      data: {
        hospitalId,
        code: '101200',
        name: 'البنك الرئيسي',
        type: 'ASSET',
        isActive: true,
      },
    });

    await db.systemAccountMapping.createMany({
      data: [
        { hospitalId, key: 'RECEIVABLE_PATIENTS', accountId: arPatient.id },
        { hospitalId, key: 'RECEIVABLE_INSURANCE', accountId: arInsurance.id },
        { hospitalId, key: 'PAYABLE_SUPPLIERS', accountId: apSuppliers.id },
        { hospitalId, key: 'REVENUE_SURGERY', accountId: revSurgery.id },
        { hospitalId, key: 'REVENUE_INPATIENT', accountId: revInpatient.id },
        { hospitalId, key: 'REVENUE_RADIOLOGY', accountId: revRadiology.id },
        { hospitalId, key: 'COGS_SUPPLIES', accountId: cogsSupplies.id },
        { hospitalId, key: 'BANK_MAIN', accountId: bankMain.id },
      ],
    });

    // =========================================================================
    // PART A: CAP08 DRG Surgical Package -> Automated Discharge Invoice + Split
    // =========================================================================
    const insurer = await db.insuranceProvider.create({
      data: {
        hospitalId,
        name: 'شركة التكافل الصحي الوطني',
        code: 'INS-B26',
        isActive: true,
      },
    });
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-B26-${Date.now()}`,
        fullName: 'مريض حزمة جراحية متكاملة',
        gender: 'MALE',
      },
    });
    const encounter = await db.encounter.create({
      data: {
        hospitalId,
        patientId: patient.id,
        type: 'IPD',
        status: 'OPEN',
      },
    });

    const svcSurgery = await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'SVC-B26-SURG',
        name: 'عملية منظار',
        type: 'SURGERY',
        defaultPrice: '2200.0000',
      },
    });
    const svcRoom = await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'SVC-B26-ROOM',
        name: 'إيواء جناح',
        type: 'BED',
        defaultPrice: '400.0000',
      },
    });
    const svcRad = await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'SVC-B26-RAD',
        name: 'أشعة مقطعية',
        type: 'RADIOLOGY',
        defaultPrice: '450.0000',
      },
    });

    await db.encounterCharge.createMany({
      data: [
        {
          hospitalId,
          encounterId: encounter.id,
          serviceItemId: svcSurgery.id,
          sourceType: 'SURGERY',
          quantity: 1,
          unitPrice: '2200.0000',
          totalAmount: '2200.000',
        },
        {
          hospitalId,
          encounterId: encounter.id,
          serviceItemId: svcRoom.id,
          sourceType: 'BED',
          quantity: 2,
          unitPrice: '400.0000',
          totalAmount: '800.000',
        },
        {
          hospitalId,
          encounterId: encounter.id,
          serviceItemId: svcRad.id,
          sourceType: 'RADIOLOGY_ORDER',
          quantity: 1,
          unitPrice: '450.0000',
          totalAmount: '450.000',
        },
      ],
    });

    const pkgRes = await request(app.getHttpServer())
      .post('/surgery/packages')
      .auth(admin.accessToken, { type: 'bearer' })
      .send({
        code: 'PKG-B26-01',
        name: 'حزمة جراحة المرارة بالمنظار',
        drgCode: 'DRG-418',
        packagePrice: 3500,
        includedStayDays: 2,
        inclusions: [
          { category: 'SURGERY', coverageMode: 'INCLUDED_UNLIMITED' },
          {
            category: 'ROOM',
            coverageMode: 'INCLUDED_CAPPED',
            capAmount: 600,
          },
          { category: 'RADIOLOGY', coverageMode: 'EXCLUDED' },
        ],
      })
      .expect(201);
    const pkgId = (pkgRes.body as { id: number }).id;

    const enrollRes = await request(app.getHttpServer())
      .post('/surgery/packages/enrollments')
      .auth(admin.accessToken, { type: 'bearer' })
      .send({ encounterId: encounter.id, packageId: pkgId })
      .expect(201);
    const enrollmentId = (enrollRes.body as { id: number }).id;

    // Cannot invoice before settlement
    await request(app.getHttpServer())
      .post(`/surgery/packages/enrollments/${enrollmentId}/generate-invoice`)
      .auth(admin.accessToken, { type: 'bearer' })
      .send({})
      .expect(409);

    // Settle enrollment (overage = 200 ROOM + 450 RADIOLOGY = 650; netBillable = 4150)
    await request(app.getHttpServer())
      .post(`/surgery/packages/enrollments/${enrollmentId}/settle`)
      .auth(admin.accessToken, { type: 'bearer' })
      .send({ notes: 'Settled prior to discharge billing' })
      .expect(201);

    // Cross-tenant invoice generation blocked (404)
    await request(app.getHttpServer())
      .post(`/surgery/packages/enrollments/${enrollmentId}/generate-invoice`)
      .auth(foreignUser.accessToken, { type: 'bearer' })
      .send({})
      .expect(404);

    // Generate DRG Discharge Invoice: 80% insurance on 3500 base = 2800.000; patient = 1350.000
    const invRes = await request(app.getHttpServer())
      .post(`/surgery/packages/enrollments/${enrollmentId}/generate-invoice`)
      .auth(admin.accessToken, { type: 'bearer' })
      .send({
        insuranceProviderId: insurer.id,
        insuranceCoveragePercent: 80,
        coverOverage: false,
      })
      .expect(201);

    const invBody = invRes.body as {
      invoice: {
        id: number;
        status: string;
        totalAmount: string;
        insuranceShare: string;
        patientShare: string;
        claimStatus: string;
      };
      accountingEntryId: number;
      split: {
        netBillableTotal: string;
        insuranceShare: string;
        patientShare: string;
      };
    };

    expect(invBody.invoice.status).toBe('ISSUED');
    expect(Money.toDbString(invBody.invoice.totalAmount)).toBe('4150.000');
    expect(Money.toDbString(invBody.invoice.insuranceShare)).toBe('2800.000');
    expect(Money.toDbString(invBody.invoice.patientShare)).toBe('1350.000');
    expect(invBody.invoice.claimStatus).toBe('PENDING');

    // All encounter charges are now linked to this invoice (0 unbilled -> prevents double-billing)
    const remainingUnbilled = await db.encounterCharge.count({
      where: { encounterId: encounter.id, invoiceId: null },
    });
    expect(remainingUnbilled).toBe(0);

    // Verify balanced DRG GL AccountingEntry
    const drgGl = await db.accountingEntry.findUniqueOrThrow({
      where: { id: invBody.accountingEntryId },
      include: { lines: true },
    });
    const drgDebit = Money.toDbString(
      Money.sumPosted(...drgGl.lines.map((l) => l.debit)),
    );
    const drgCredit = Money.toDbString(
      Money.sumPosted(...drgGl.lines.map((l) => l.credit)),
    );
    expect(drgDebit).toBe('4150.000');
    expect(drgCredit).toBe('4150.000');

    // Duplicate invoice generation blocked (409)
    await request(app.getHttpServer())
      .post(`/surgery/packages/enrollments/${enrollmentId}/generate-invoice`)
      .auth(admin.accessToken, { type: 'bearer' })
      .send({})
      .expect(409);

    // PostgreSQL immutability trigger blocks post-invoicing mutation
    await expect(
      db.$executeRaw`UPDATE "EncounterPackageEnrollment" SET "patientShare" = 0 WHERE "id" = ${enrollmentId}`,
    ).rejects.toThrow(/immutable/i);

    // =========================================================================
    // PART B: CAP10 Consignment Consumption -> Automated Supplier AP Invoice + GL
    // =========================================================================
    const supplier = await db.supplier.create({
      data: {
        hospitalId,
        code: 'SUP-B26-01',
        name: 'شركة الدعامات القلبية الدولية',
        isActive: true,
      },
    });
    const warehouse = await db.warehouse.create({
      data: {
        hospitalId,
        name: 'مخزن القسطرة والعمليات',
        isActive: true,
      },
    });
    const product = await db.product.create({
      data: {
        hospitalId,
        code: 'STENT-B26',
        name: 'دعامة شريانية أمانة',
        type: 'SUPPLY',
        isActive: true,
      },
    });

    const recRes = await request(app.getHttpServer())
      .post('/inventory/governance/consignments')
      .auth(admin.accessToken, { type: 'bearer' })
      .send({
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        productId: product.id,
        batchNumber: 'ST-2026-99',
        quantityReceived: 5,
        agreedUnitPrice: 1250.3335,
      })
      .expect(201);
    const receiptId = (recRes.body as { id: number }).id;

    // Consume 2 stents (each 1.000 * 1250.3335 -> 1250.334 via ROUND_HALF_EVEN; total = 2500.668)
    const c1 = await request(app.getHttpServer())
      .post(`/inventory/governance/consignments/${receiptId}/consume`)
      .auth(admin.accessToken, { type: 'bearer' })
      .send({ encounterId: encounter.id, quantity: 1 })
      .expect(201);
    const c2 = await request(app.getHttpServer())
      .post(`/inventory/governance/consignments/${receiptId}/consume`)
      .auth(admin.accessToken, { type: 'bearer' })
      .send({ encounterId: encounter.id, quantity: 1 })
      .expect(201);

    const cid1 = (c1.body as { consumption: { id: number } }).consumption.id;
    const cid2 = (c2.body as { consumption: { id: number } }).consumption.id;

    // Verify pending-billing list returns both
    const pendingBefore = await request(app.getHttpServer())
      .get(
        `/inventory/governance/consignments/pending-billing?supplierId=${supplier.id}`,
      )
      .auth(admin.accessToken, { type: 'bearer' })
      .expect(200);
    expect((pendingBefore.body as unknown[]).length).toBe(2);

    // Cross-tenant supplier billing rejected (404)
    await request(app.getHttpServer())
      .post('/inventory/governance/consignments/generate-supplier-invoice')
      .auth(foreignUser.accessToken, { type: 'bearer' })
      .send({ supplierId: supplier.id, consumptionIds: [cid1, cid2] })
      .expect(404);

    // Generate Supplier PurchaseInvoice + GL Entry atomically
    const apRes = await request(app.getHttpServer())
      .post('/inventory/governance/consignments/generate-supplier-invoice')
      .auth(admin.accessToken, { type: 'bearer' })
      .send({
        supplierId: supplier.id,
        consumptionIds: [cid1, cid2],
        invoiceNumber: 'CONS-SUP-2026-001',
      })
      .expect(201);

    const apBody = apRes.body as {
      purchaseInvoice: {
        id: number;
        status: string;
        netAmount: string;
        accountingEntryId: number | null;
        lines: unknown[];
      };
      billedConsumptionIds: number[];
    };

    expect(apBody.purchaseInvoice.status).toBe('APPROVED');
    expect(Money.toDbString(apBody.purchaseInvoice.netAmount)).toBe('2500.668');
    expect(apBody.purchaseInvoice.lines.length).toBe(2);
    expect(apBody.purchaseInvoice.accountingEntryId).toBeTruthy();
    expect(apBody.billedConsumptionIds).toEqual([cid1, cid2]);

    // Verify balanced AP GL Entry (Debit COGS 2500.668 = Credit AP Suppliers 2500.668)
    const apGl = await db.accountingEntry.findUniqueOrThrow({
      where: { id: apBody.purchaseInvoice.accountingEntryId! },
      include: { lines: true },
    });
    const apDebit = Money.toDbString(
      Money.sumPosted(...apGl.lines.map((l) => l.debit)),
    );
    const apCredit = Money.toDbString(
      Money.sumPosted(...apGl.lines.map((l) => l.credit)),
    );
    expect(apDebit).toBe('2500.668');
    expect(apCredit).toBe('2500.668');

    // Pending billing is now empty & re-billing rejected (409)
    const pendingAfter = await request(app.getHttpServer())
      .get(
        `/inventory/governance/consignments/pending-billing?supplierId=${supplier.id}`,
      )
      .auth(admin.accessToken, { type: 'bearer' })
      .expect(200);
    expect((pendingAfter.body as unknown[]).length).toBe(0);

    await request(app.getHttpServer())
      .post('/inventory/governance/consignments/generate-supplier-invoice')
      .auth(admin.accessToken, { type: 'bearer' })
      .send({ supplierId: supplier.id, consumptionIds: [cid1] })
      .expect(409);

    // Partial supplier payment leaves consignments in BILLED state
    const partialPayRes = await request(app.getHttpServer())
      .post(`/purchases/invoices/${apBody.purchaseInvoice.id}/payments`)
      .auth(admin.accessToken, { type: 'bearer' })
      .send({
        supplierId: supplier.id,
        amount: 1000,
        method: 'TRANSFER',
        reference: 'WIRE-CAP10-PART-1',
      })
      .expect(201);
    const partialPayBody = partialPayRes.body as {
      invoice: { status: string };
      settledConsignmentsCount: number;
    };
    expect(partialPayBody.invoice.status).toBe('PARTIALLY_PAID');
    expect(partialPayBody.settledConsignmentsCount).toBe(0);

    const midConsumptions = await db.consignmentConsumption.findMany({
      where: { id: { in: [cid1, cid2] } },
      select: { supplierBillStatus: true },
    });
    expect(midConsumptions.map((c) => c.supplierBillStatus)).toEqual([
      'BILLED',
      'BILLED',
    ]);

    // Full settlement payment atomically promotes BILLED -> SETTLED + chained audit
    const finalPayRes = await request(app.getHttpServer())
      .post(`/purchases/invoices/${apBody.purchaseInvoice.id}/payments`)
      .auth(admin.accessToken, { type: 'bearer' })
      .send({
        supplierId: supplier.id,
        amount: 1500.668,
        method: 'TRANSFER',
        reference: 'WIRE-CAP10-FINAL-2',
      })
      .expect(201);
    const finalPayBody = finalPayRes.body as {
      invoice: { status: string };
      settledConsignmentsCount: number;
    };
    expect(finalPayBody.invoice.status).toBe('PAID');
    expect(finalPayBody.settledConsignmentsCount).toBe(2);

    const settledConsumptions = await db.consignmentConsumption.findMany({
      where: { id: { in: [cid1, cid2] } },
      select: { supplierBillStatus: true },
    });
    expect(settledConsumptions.map((c) => c.supplierBillStatus)).toEqual([
      'SETTLED',
      'SETTLED',
    ]);

    const settleAudit = await db.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'CONSIGNMENT_CONSUMPTIONS_AUTO_SETTLED',
        entityId: apBody.purchaseInvoice.id,
      },
    });
    expect(settleAudit).toBeTruthy();
    expect(settleAudit?.hash).toBeTruthy();

    // PostgreSQL trigger blocks unbilling a billed/settled consignment consumption
    await expect(
      db.$executeRaw`UPDATE "ConsignmentConsumption" SET "supplierBillStatus" = 'PENDING_BILLING' WHERE "id" = ${cid1}`,
    ).rejects.toThrow(/cannot be unbilled/i);
  });
});
