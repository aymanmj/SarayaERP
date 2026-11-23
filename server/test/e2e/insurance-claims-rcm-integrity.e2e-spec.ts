import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { responseBody } from '../http-response';
type TestResponse = {
  id: number;
  isActive: boolean;
  claimedAmount: string;
  status: string;
  paidAmount: string;
  adjustmentAmount: string;
  defaultCopayRate: string;
  patientCopayRate: string;
  maxCopayAmount: string;
  maxCoverageAmount: string;
  totals: { claimed: string; paid: string };
  totalDenials: number;
  totalDeniedAmount: string;
};
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccountingService } from '../../src/accounting/accounting.service';
import { InsuranceCalculationService } from '../../src/insurance/insurance-calculation.service';
import { ClaimService } from '../../src/rcm/claim.service';
import { Money } from '../../src/common/utils/money.util';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Insurance Providers, Policies, Plans, Coverage Calculation, Pre-Auth, Claims Settlement & RCM Integrity (FLOW03 / FLOW04 / SEC03 / OPS03 / FIN02)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let auth: AuthHelper;
  let calcService: InsuranceCalculationService;
  let accountingService: AccountingService;
  let hospitalId: number;
  let otherHospitalId: number;
  let adminUserId: number;
  let adminToken: string;
  let otherToken: string;
  let attachmentRoot = '';

  beforeAll(async () => {
    attachmentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saraya-preauth-'));
    process.env.INSURANCE_ATTACHMENT_ROOT = attachmentRoot;
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    db = app.get(PrismaService);
    calcService = app.get(InsuranceCalculationService);
    accountingService = app.get(AccountingService);
  });

  afterAll(async () => {
    if (db) {
      await db
        .$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS trg_fail_insurance_claim_audit ON "AuditLog"`,
        )
        .catch(() => undefined);
      await db
        .$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS fail_insurance_claim_audit()`,
        )
        .catch(() => undefined);
    }
    if (app) await app.close();
    delete process.env.INSURANCE_ATTACHMENT_ROOT;
    if (attachmentRoot) {
      fs.rmSync(attachmentRoot, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await db
      .$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS trg_fail_insurance_claim_audit ON "AuditLog"`,
      )
      .catch(() => undefined);
    await db
      .$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_insurance_claim_audit()`)
      .catch(() => undefined);
    await resetDatabase(db);

    auth = new AuthHelper(db, app.get(JwtService));
    const admin = await auth.createTestUser(
      'insurance-rcm-admin',
      'synthetic',
      {
        permissions: [
          'insurance:view',
          'insurance:manage',
          'claims:create',
          'claims:read',
          'claims:update',
        ],
      },
    );
    hospitalId = admin.user.hospitalId;
    adminUserId = admin.user.id;
    adminToken = admin.accessToken;

    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_OTHER_INS_${Date.now()}`,
        name: 'Other Insurance Hospital',
        isActive: true,
      },
    });
    otherHospitalId = otherHospital.id;

    const otherAdmin = await auth.createTestUser(
      'other-insurance-admin',
      'synthetic',
      {
        hospitalId: otherHospitalId,
        permissions: [
          'insurance:view',
          'insurance:manage',
          'claims:create',
          'claims:read',
          'claims:update',
        ],
      },
    );
    otherToken = otherAdmin.accessToken;

    // Seed open financial year & covering period for current date
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0));
    const yearEnd = new Date(
      Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999),
    );
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
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

    await accountingService.ensureDefaultAccountsForHospital(hospitalId);
  });

  it('enforces tenant isolation, copay normalization, pre-auth expiration, and Money precision across providers, plans, policies, and coverage calculation', async () => {
    // 1. Create Insurance Provider
    const provRes = await request(app.getHttpServer())
      .post('/insurance/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'شركة السرايا للتأمين الطبي',
        code: `INS-SAR-${Date.now()}`,
        phone: '0910001122',
        email: 'claims@saraya-ins.ly',
      })
      .expect(201);

    const providerId = responseBody<TestResponse>(provRes).id;

    // Cross-tenant access to provider details, policy creation, plan creation, update, and delete must fail (404)
    await request(app.getHttpServer())
      .get(`/insurance/providers/${providerId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/insurance/providers/${providerId}/plans`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Cross-Tenant Plan', defaultCopayRate: 10 })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/insurance/providers/${providerId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Hijacked Provider' })
      .expect(404);

    // 2. Create Insurance Plan with percentage input (20 -> normalized to 0.2000) and maxCopayAmount = 45.000
    const planRes = await request(app.getHttpServer())
      .post(`/insurance/providers/${providerId}/plans`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'الخطة الذهبية 2026',
        defaultCopayRate: 20,
        maxCopayAmount: 45,
      })
      .expect(201);

    const planId = responseBody<TestResponse>(planRes).id;
    expect(
      Money.toFixed(responseBody<TestResponse>(planRes).defaultCopayRate, 4),
    ).toBe('0.2000');
    expect(
      Money.toDbString(responseBody<TestResponse>(planRes).maxCopayAmount),
    ).toBe('45.000');

    // Reject invalid copay rate (> 100%)
    await request(app.getHttpServer())
      .post(`/insurance/providers/${providerId}/plans`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Invalid Copay Plan',
        defaultCopayRate: 150,
      })
      .expect(400);

    // Cross-tenant getPlan must fail (404)
    await request(app.getHttpServer())
      .get(`/insurance/plans/${planId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    // 3. Create Insurance Policy linked to Plan
    const now = new Date();
    const startDate = new Date(now.getTime() - 7 * 86400000).toISOString();
    const endDate = new Date(now.getTime() + 90 * 86400000).toISOString();

    // Reject policy where endDate < startDate
    await request(app.getHttpServer())
      .post(`/insurance/providers/${providerId}/policies`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Invalid Dates Policy',
        policyNumber: 'POL-INVALID',
        startDate: endDate,
        endDate: startDate,
        patientCopayRate: 15,
      })
      .expect(400);

    for (const terms of [
      { releaseCoverageOnPartialDispense: true },
      {
        releaseCoverageOnPartialDispense: 'true',
        maxCoverageAmount: '10000.000',
      },
    ]) {
      await request(app.getHttpServer())
        .post(`/insurance/providers/${providerId}/policies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Invalid coverage release terms', ...terms })
        .expect(400);
    }

    const policyRes = await request(app.getHttpServer())
      .post(`/insurance/providers/${providerId}/policies`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'بوليصة الشركات الكبرى',
        policyNumber: 'POL-GOLD-2026',
        startDate,
        endDate,
        planId,
        patientCopayRate: 15,
        maxCoverageAmount: 10000,
        releaseCoverageOnPartialDispense: true,
      })
      .expect(201);

    const policyId = responseBody<TestResponse>(policyRes).id;
    expect(responseBody<TestResponse>(policyRes)).toMatchObject({
      releaseCoverageOnPartialDispense: true,
    });
    expect(
      Money.toFixed(responseBody<TestResponse>(policyRes).patientCopayRate, 4),
    ).toBe('0.1500');
    expect(
      Money.toDbString(responseBody<TestResponse>(policyRes).maxCoverageAmount),
    ).toBe('10000.000');

    // 4. Create ServiceItem and CoverageRule requiring pre-auth with 25% copay
    const serviceCategory = await db.serviceCategory.create({
      data: {
        hospitalId,
        name: 'أشعة تشخيصية متقدمة',
        code: `CAT-MRI-${Date.now()}`,
      },
    });

    const serviceItem = await db.serviceItem.create({
      data: {
        hospitalId,
        categoryId: serviceCategory.id,
        code: `SRV-MRI-${Date.now()}`,
        name: 'رنين مغناطيسي للدماغ',
        type: 'RADIOLOGY',
        defaultPrice: '200.000',
        isActive: true,
        isBillable: true,
      },
    });

    // Cross-tenant rule addition must fail (404)
    await request(app.getHttpServer())
      .post(`/insurance/plans/${planId}/rules`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        serviceItemId: serviceItem.id,
        ruleType: 'INCLUSION',
        copayType: 'PERCENTAGE',
        copayValue: 25,
        requiresApproval: true,
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/insurance/plans/${planId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        serviceItemId: serviceItem.id,
        ruleType: 'INCLUSION',
        copayType: 'PERCENTAGE',
        copayValue: 25,
        requiresApproval: true,
      })
      .expect(201);

    // 5. Create Patient with Policy and test CoverageCalculationService
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-INS-${Date.now()}`,
        fullName: 'سالم الفيتوري',
        gender: 'MALE',
        dateOfBirth: new Date('1988-05-15T00:00:00.000Z'),
        insurancePolicyId: policyId,
        insuranceMemberId: 'MEM-2026-7788',
      },
    });

    // 5a. Without Pre-Auth: requiresPreAuth = true, 25% of 200 = 50 -> capped by maxCopayAmount (45.000) -> patientShare = 45, insuranceShare = 155
    const covNoAuth = await calcService.calculateCoverage(
      patient.id,
      serviceItem.id,
      200,
    );
    expect(covNoAuth.covered).toBe(true);
    expect(covNoAuth.patientShare).toBe(45);
    expect(covNoAuth.insuranceShare).toBe(155);
    expect(covNoAuth.requiresPreAuth).toBe(true);
    expect(covNoAuth.preAuthCode).toBeUndefined();

    // 5b. Create Pre-Auth and approve it with an EXPIRED date -> must still require pre-auth!
    const preAuthRes = await request(app.getHttpServer())
      .post('/insurance/pre-auth')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        patientId: patient.id,
        policyId,
        serviceItemId: serviceItem.id,
        requestedAmount: 155,
        notes: 'طلب موافقة رنين مغناطيسي',
      })
      .expect(201);

    const preAuthId = responseBody<TestResponse>(preAuthRes).id;

    // Cross-tenant updatePreAuth must fail (404)
    await request(app.getHttpServer())
      .patch(`/insurance/pre-auth/${preAuthId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ status: 'APPROVED', authCode: 'HACK-AUTH' })
      .expect(404);

    // Approve with expired date (yesterday)
    await request(app.getHttpServer())
      .patch(`/insurance/pre-auth/${preAuthId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'APPROVED',
        authCode: 'AUTH-EXPIRED-001',
        approvedAmount: 155,
        expiresAt: new Date(now.getTime() - 86400000).toISOString(),
      })
      .expect(200);

    const covExpiredAuth = await calcService.calculateCoverage(
      patient.id,
      serviceItem.id,
      200,
    );
    expect(covExpiredAuth.requiresPreAuth).toBe(true);
    expect(covExpiredAuth.preAuthCode).toBeUndefined();

    // 5c. Update Pre-Auth with valid future expiration -> requiresPreAuth = false & preAuthCode returned
    await request(app.getHttpServer())
      .patch(`/insurance/pre-auth/${preAuthId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'APPROVED',
        authCode: 'AUTH-VALID-2026',
        approvedAmount: 155,
        expiresAt: new Date(now.getTime() + 14 * 86400000).toISOString(),
      })
      .expect(200);

    const covValidAuth = await calcService.calculateCoverage(
      patient.id,
      serviceItem.id,
      200,
    );
    expect(covValidAuth.covered).toBe(true);
    expect(covValidAuth.patientShare).toBe(45);
    expect(covValidAuth.insuranceShare).toBe(155);
    expect(covValidAuth.requiresPreAuth).toBe(false);
    expect(covValidAuth.preAuthCode).toBe('AUTH-VALID-2026');
  });

  it('serializes concurrent insurance claim settlements, rolls back on audit failure, protects settlement GL entry from manual reversal, and blocks soft-deleting providers with pending claims', async () => {
    const provider = await db.insuranceProvider.create({
      data: {
        hospitalId,
        code: `INS-SETTLE-${Date.now()}`,
        name: 'شركة الضمان للتأمين الصحي',
        isActive: true,
      },
    });

    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-SETTLE-${Date.now()}`,
        fullName: 'فاطمة السنوسي',
        gender: 'FEMALE',
      },
    });

    const encounter = await db.encounter.create({
      data: {
        hospitalId,
        patientId: patient.id,
        type: 'OPD',
        status: 'OPEN',
      },
    });

    // Create 2 insured invoices with 3-decimal LYD shares:
    // inv1: patient fully paid their share (45.000 / 45.000), insuranceShare = 155.125
    // inv2: patient partially paid their share (20.000 / 55.125), insuranceShare = 244.875
    // Total insurance settlement = 155.125 + 244.875 = 400.000 LYD
    const inv1 = await db.invoice.create({
      data: {
        hospitalId,
        patientId: patient.id,
        encounterId: encounter.id,
        status: 'PARTIALLY_PAID',
        totalAmount: '200.125',
        discountAmount: '0.000',
        paidAmount: '45.000',
        patientShare: '45.000',
        insuranceShare: '155.125',
        insuranceProviderId: provider.id,
        claimStatus: 'SUBMITTED',
      },
    });

    const inv2 = await db.invoice.create({
      data: {
        hospitalId,
        patientId: patient.id,
        encounterId: encounter.id,
        status: 'PARTIALLY_PAID',
        totalAmount: '300.000',
        discountAmount: '0.000',
        paidAmount: '20.000',
        patientShare: '55.125',
        insuranceShare: '244.875',
        insuranceProviderId: provider.id,
        claimStatus: 'SUBMITTED',
      },
    });

    await accountingService.recordInvoiceEntry({
      hospitalId,
      invoiceId: inv1.id,
      userId: adminUserId,
    });
    const customReceivable = await db.account.create({
      data: {
        hospitalId,
        code: 'AR-INS-SETTLE',
        name: 'Synthetic insurer ledger',
        type: 'ASSET',
      },
    });
    await db.insuranceProvider.update({
      where: { id: provider.id },
      data: { accountId: customReceivable.id },
    });
    await accountingService.recordInvoiceEntry({
      hospitalId,
      invoiceId: inv2.id,
      userId: adminUserId,
    });
    const settlementPath = '/insurance/claims/settlements';
    const payload = {
      providerId: provider.id,
      invoiceIds: [inv1.id, inv2.id],
      amount: '400.000',
      bankReference: 'BANK-SETTLE-123',
      confirmed: true,
    };
    const settle = (body = payload, token = adminToken) =>
      request(app.getHttpServer())
        .post(settlementPath)
        .auth(token, { type: 'bearer' })
        .send(body);

    await request(app.getHttpServer())
      .post('/insurance/claims/update-status')
      .auth(adminToken, { type: 'bearer' })
      .send({ invoiceIds: payload.invoiceIds, status: 'PAID' })
      .expect(400);
    await settle(payload, otherToken).expect(400);
    await settle({ ...payload, confirmed: false }).expect(400);
    await settle({ ...payload, amount: '399.999' }).expect(400);
    const secondProvider = await db.insuranceProvider.create({
      data: { hospitalId, code: 'INS-SETTLE-OTHER', name: 'Other insurer' },
    });
    const otherInvoice = await db.invoice.create({
      data: {
        hospitalId,
        patientId: patient.id,
        encounterId: encounter.id,
        status: 'ISSUED',
        totalAmount: '244.875',
        patientShare: '0.000',
        insuranceShare: '244.875',
        insuranceProviderId: secondProvider.id,
        claimStatus: 'SUBMITTED',
      },
    });
    await settle({ ...payload, invoiceIds: [inv1.id, otherInvoice.id] }).expect(
      400,
    );
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await settle().expect(400);
    await db.financialPeriod.updateMany({ data: { isOpen: true } });

    // 1. Soft-deleting provider while pending/submitted claims exist must fail (400)
    await request(app.getHttpServer())
      .delete(`/insurance/providers/${provider.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    // 2. Simulate audit failure on INSURANCE_CLAIMS_SETTLED -> must roll back GL entry and invoice updates
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_insurance_claim_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'INSURANCE_CLAIMS_SETTLED' THEN
          RAISE EXCEPTION 'Simulated insurance claim settlement audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER trg_fail_insurance_claim_audit
      BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION fail_insurance_claim_audit();
    `);

    await settle().expect(500);

    // Verify full rollback
    const postingKey = `insurance-claim-settlement:${hospitalId}:${inv1.id},${inv2.id}`;
    const rolledBackEntry = await db.accountingEntry.findFirst({
      where: { hospitalId, postingKey },
    });
    expect(rolledBackEntry).toBeNull();
    expect(await db.insuranceSettlement.count()).toBe(0);

    const checkInv1Before = await db.invoice.findUniqueOrThrow({
      where: { id: inv1.id },
    });
    expect(checkInv1Before.claimStatus).toBe('SUBMITTED');

    // Remove failure trigger
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS trg_fail_insurance_claim_audit ON "AuditLog"`,
    );
    await db.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS fail_insurance_claim_audit()`,
    );

    // 3. Exact concurrent retries return the same posted settlement.
    const [resA, resB] = await Promise.all([
      settle({
        ...payload,
        invoiceIds: [inv2.id, inv1.id],
        bankReference: payload.bankReference.toLowerCase(),
      }).expect(201),
      settle().expect(201),
    ]);
    expect(resA.body).toEqual(resB.body);
    await settle({ ...payload, amount: '400.001' }).expect(409);
    await settle({ ...payload, bankReference: 'DIFFERENT-BANK-123' }).expect(
      400,
    );

    // Verify AccountingEntry and invoice statuses
    const entries = await db.accountingEntry.findMany({
      where: { hospitalId, postingKey },
      include: { lines: true },
    });
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.lines).toHaveLength(3);
    expect(
      entry.lines
        .find((line) => line.accountId === customReceivable.id)
        ?.credit.toFixed(3),
    ).toBe('244.875');
    const settlement = await db.insuranceSettlement.findUniqueOrThrow({
      where: { postingEntryId: entry.id },
      include: {
        allocations: {
          orderBy: { invoiceId: 'asc' },
          include: { originalReceivable: true },
        },
      },
    });
    expect(
      settlement.allocations.map((item) => [
        item.invoiceId,
        item.amount.toFixed(3),
      ]),
    ).toEqual([
      [inv1.id, '155.125'],
      [inv2.id, '244.875'],
    ]);
    expect(settlement.allocations[1].originalReceivable.accountId).toBe(
      customReceivable.id,
    );
    await expect(
      db.insuranceSettlement.update({
        where: { id: settlement.id },
        data: { bankReference: 'TAMPERED' },
      }),
    ).rejects.toThrow('history is immutable');
    await expect(
      db.invoice.update({
        where: { id: inv1.id },
        data: { claimStatus: 'SUBMITTED' },
      }),
    ).rejects.toThrow('documented correction');
    await expect(
      app.get(ClaimService).createClaim(hospitalId, inv1.id),
    ).rejects.toThrow('تسوية مثبتة');
    await expect(
      accountingService.reverseEntry(
        hospitalId,
        settlement.allocations[0].originalReceivable.entryId,
        adminUserId,
        'Synthetic reversal',
      ),
    ).rejects.toThrow('يلزم تصحيح موثق');

    const totalDebit = Money.sumPosted(...entry.lines.map((l) => l.debit));
    const totalCredit = Money.sumPosted(...entry.lines.map((l) => l.credit));
    expect(Money.toDbString(totalDebit)).toBe('400.000');
    expect(Money.toDbString(totalCredit)).toBe('400.000');

    const [updatedInv1, updatedInv2] = await Promise.all([
      db.invoice.findUniqueOrThrow({ where: { id: inv1.id } }),
      db.invoice.findUniqueOrThrow({ where: { id: inv2.id } }),
    ]);
    expect(updatedInv1.claimStatus).toBe('PAID');
    expect(updatedInv1.status).toBe('PAID');
    expect(updatedInv2.claimStatus).toBe('PAID');
    expect(updatedInv2.status).toBe('PARTIALLY_PAID');

    // 4. Manual reversal of the protected settlement entry must be rejected
    await expect(
      accountingService.reverseEntry(
        hospitalId,
        entry.id,
        adminUserId,
        'محاولة عكس يدوي غير مصرح بها',
      ),
    ).rejects.toThrow(/محمي/);

    // 5. Now that all claims for provider are settled (PAID), soft-delete succeeds
    const softDelRes = await request(app.getHttpServer())
      .delete(`/insurance/providers/${provider.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(responseBody<TestResponse>(softDelRes).isActive).toBe(false);

    const refundUrl = `${settlementPath}/${settlement.id}/refunds`;
    const reviewer = await auth.createTestUser(
      'settlement-refund-reviewer',
      'synthetic',
      {
        hospitalId,
        permissions: ['insurance:manage'],
      },
    );
    const firstAllocation = settlement.allocations[0];
    const secondAllocation = settlement.allocations[1];
    const refundRequest = {
      requestId: randomUUID(),
      reason: 'Synthetic documented bank refund',
      lines: [
        { allocationId: firstAllocation.id, amount: '155.125' },
        { allocationId: secondAllocation.id, amount: '0.125' },
      ],
    };
    const askRefund = (body = refundRequest, token = adminToken) =>
      request(app.getHttpServer())
        .post(refundUrl)
        .auth(token, { type: 'bearer' })
        .send(body);
    const approval = {
      decision: 'POST',
      note: 'Verified outgoing transfer',
      bankReference: 'BANK-REF-140',
      confirmed: true,
    };
    const reviewRefund = (
      id: number,
      body: object = approval,
      token = reviewer.accessToken,
    ) =>
      request(app.getHttpServer())
        .post(`${refundUrl}/${id}/review`)
        .auth(token, { type: 'bearer' })
        .send(body);
    await askRefund(refundRequest, otherToken).expect(404);
    await askRefund({
      ...refundRequest,
      lines: [{ allocationId: firstAllocation.id, amount: '155.126' }],
    }).expect(400);
    const [asked, repeated] = await Promise.all([
      askRefund().expect(201),
      askRefund().expect(201),
    ]);
    expect(asked.body).toEqual(repeated.body);
    const refundId = responseBody<{ id: number }>(asked).id;
    await askRefund({ ...refundRequest, requestId: randomUUID() }).expect(400);
    await reviewRefund(refundId, approval, adminToken).expect(403);
    await reviewRefund(refundId, { ...approval, confirmed: false }).expect(400);
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await reviewRefund(refundId).expect(400);
    await db.financialPeriod.updateMany({ data: { isOpen: true } });
    const [posted, retry] = await Promise.all([
      reviewRefund(refundId).expect(201),
      reviewRefund(refundId).expect(201),
    ]);
    expect(posted.body).toEqual(retry.body);
    const refund = await db.insuranceSettlementRefund.findUniqueOrThrow({
      where: { id: refundId },
      include: { postingEntry: { include: { lines: true } } },
    });
    expect(refund.amount.toFixed(3)).toBe('155.250');
    expect(
      refund.postingEntry?.lines.map((line) => [
        line.accountId,
        line.debit.toFixed(3),
        line.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [firstAllocation.originalReceivable.accountId, '155.125', '0.000'],
        [customReceivable.id, '0.125', '0.000'],
        [
          entry.lines.find((line) => line.debit.gt(0))!.accountId,
          '0.000',
          '155.250',
        ],
      ]),
    );
    await expect(
      accountingService.reverseEntry(
        hospitalId,
        refund.postingEntryId!,
        adminUserId,
        'Synthetic reversal',
      ),
    ).rejects.toThrow('محمي');
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv1.id } }),
    ).toMatchObject({
      claimStatus: 'SUBMITTED',
      status: 'PARTIALLY_PAID',
      paidAmount: inv1.paidAmount,
    });
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv2.id } }),
    ).toMatchObject({
      claimStatus: 'PARTIALLY_PAID',
      paidAmount: inv2.paidAmount,
    });

    const withdrawal = (id: number, confirmed = true) =>
      request(app.getHttpServer())
        .post(`/insurance/claims/${id}/withdrawal`)
        .auth(adminToken, { type: 'bearer' })
        .send({
          payerReference: `INSURER-WITHDRAWAL-${id}`,
          reason: 'Verified insurer confirmation',
          confirmed,
        });
    await withdrawal(inv2.id).expect(400);
    await withdrawal(inv1.id, false).expect(400);

    await db.insuranceProvider.update({
      where: { id: provider.id },
      data: { isActive: true },
    });
    await withdrawal(inv1.id).expect(201);
    const reopenedClaims = await request(app.getHttpServer())
      .get('/insurance/claims?status=PARTIALLY_PAID')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(reopenedClaims.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: inv2.id,
          settlementOutstanding: '0.125',
        }),
      ]),
    );
    await request(app.getHttpServer())
      .delete(`/insurance/providers/${provider.id}`)
      .auth(adminToken, { type: 'bearer' })
      .expect(400);
    const recollect = {
      ...payload,
      invoiceIds: [inv2.id],
      bankReference: 'BANK-RECOLLECT-141',
      amount: '0.125',
    };
    await settle({ ...recollect, amount: '0.126' }).expect(400);
    const [recollected, recollectRetry] = await Promise.all([
      settle(recollect).expect(201),
      settle(recollect).expect(201),
    ]);
    expect(recollected.body).toEqual(recollectRetry.body);
    const recollection = await db.insuranceSettlement.findUniqueOrThrow({
      where: { id: responseBody<{ id: number }>(recollected).id },
      include: {
        postingEntry: { include: { lines: true } },
        allocations: true,
      },
    });
    expect(recollection.allocations).toEqual([
      expect.objectContaining({
        invoiceId: inv2.id,
        originalReceivableId: secondAllocation.originalReceivableId,
      }),
    ]);
    expect(recollection.allocations[0].amount.toFixed(3)).toBe('0.125');
    expect(
      recollection.postingEntry.lines
        .find((line) => line.accountId === customReceivable.id)
        ?.credit.toFixed(3),
    ).toBe('0.125');
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv2.id } }),
    ).toMatchObject({ claimStatus: 'PAID', paidAmount: inv2.paidAmount });
    const paidClaims = await request(app.getHttpServer())
      .get('/insurance/claims?status=PAID')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(paidClaims.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: inv2.id,
          settlementOutstanding: '0.000',
          insuranceSettlementAllocations: [
            expect.objectContaining({ amount: '0.125' }),
            expect.objectContaining({ amount: '244.875' }),
          ],
        }),
      ]),
    );

    const remaining = {
      ...refundRequest,
      requestId: randomUUID(),
      lines: [{ allocationId: secondAllocation.id, amount: '244.750' }],
    };
    const rejectedRequest = await askRefund(remaining).expect(201);
    await reviewRefund(responseBody<{ id: number }>(rejectedRequest).id, {
      decision: 'REJECT',
      note: 'Synthetic denial',
    }).expect(201);
    const finalRequest = await askRefund({
      ...remaining,
      requestId: randomUUID(),
    }).expect(201);
    const finalId = responseBody<{ id: number }>(finalRequest).id;
    await reviewRefund(finalId, {
      ...approval,
      bankReference: approval.bankReference.toLowerCase(),
    }).expect(409);
    await reviewRefund(finalId, {
      ...approval,
      bankReference: 'BANK-REF-141',
    }).expect(201);
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv2.id } }),
    ).toMatchObject({ claimStatus: 'PARTIALLY_PAID' });
    await withdrawal(inv2.id).expect(400);
    const newRefundUrl = `${settlementPath}/${recollection.id}/refunds`;
    const refundRecollection = await request(app.getHttpServer())
      .post(newRefundUrl)
      .auth(adminToken, { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        reason: 'Refunded the second transfer',
        lines: [
          { allocationId: recollection.allocations[0].id, amount: '0.125' },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `${newRefundUrl}/${responseBody<{ id: number }>(refundRecollection).id}/review`,
      )
      .auth(reviewer.accessToken, { type: 'bearer' })
      .send({ ...approval, bankReference: 'BANK-REF-142' })
      .expect(201);
    const ledger = await request(app.getHttpServer())
      .get(refundUrl)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(ledger.body).toMatchObject({
      amount: '400.000',
      allocations: [
        { invoiceId: inv1.id, refunded: '155.125', available: '0.000' },
        { invoiceId: inv2.id, refunded: '244.875', available: '0.000' },
      ],
    });
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv2.id } }),
    ).toMatchObject({ claimStatus: 'SUBMITTED', paidAmount: inv2.paidAmount });
    const [withdrawn, withdrawalRetry] = await Promise.all([
      withdrawal(inv2.id).expect(201),
      withdrawal(inv2.id).expect(201),
    ]);
    expect(withdrawn.body).toEqual(withdrawalRetry.body);
    await settle({
      ...recollect,
      bankReference: 'BANK-RECOLLECT-BLOCKED',
      amount: '244.875',
    }).expect(400);
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv2.id } }),
    ).toMatchObject({ claimStatus: 'WITHDRAWN', paidAmount: inv2.paidAmount });
  });

  it('posts the documented partial transfer and preserves the exact balances and allocations', async () => {
    const provider = await db.insuranceProvider.create({
      data: { hospitalId, code: 'PARTIAL-INSURER', name: 'Synthetic insurer' },
    });
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: 'PARTIAL-TRANSFER',
        fullName: 'Synthetic patient',
        gender: 'FEMALE',
      },
    });
    const encounter = await db.encounter.create({
      data: { hospitalId, patientId: patient.id, type: 'OPD', status: 'OPEN' },
    });
    const issue = async (share: string) => {
      const invoice = await db.invoice.create({
        data: {
          hospitalId,
          patientId: patient.id,
          encounterId: encounter.id,
          totalAmount: share,
          insuranceShare: share,
          patientShare: '0.000',
          status: 'ISSUED',
          claimStatus: 'SUBMITTED',
          insuranceProviderId: provider.id,
        },
      });
      await accountingService.recordInvoiceEntry({
        hospitalId,
        invoiceId: invoice.id,
        userId: adminUserId,
      });
      return invoice;
    };
    const first = await issue('1.000');
    const second = await issue('0.450');
    const allocations = [
      { invoiceId: first.id, amount: '0.650' },
      { invoiceId: second.id, amount: '0.450' },
    ];
    const payload = {
      providerId: provider.id,
      invoiceIds: [first.id, second.id],
      bankReference: 'PARTIAL-TRANSFER-01',
      amount: '1.100',
      confirmed: true,
      allocations,
    };
    const settle = (body: object) =>
      request(app.getHttpServer())
        .post('/insurance/claims/settlements')
        .auth(adminToken, { type: 'bearer' })
        .send(body);
    await settle({ ...payload, allocations: undefined }).expect(400);
    await settle({ ...payload, amount: '1.101' }).expect(400);
    await settle({
      ...payload,
      allocations: [
        { ...allocations[0], amount: '0.649' },
        { ...allocations[1], amount: '0.451' },
      ],
    }).expect(400);
    await settle({
      ...payload,
      allocations: [
        { ...allocations[0], amount: '0.650' },
        { ...allocations[1], amount: '0.450', invoiceId: first.id },
      ],
    }).expect(400);
    expect(await db.insuranceSettlement.count({ where: { hospitalId } })).toBe(
      0,
    );
    const [result, replay] = await Promise.all([
      settle(payload).expect(201),
      settle({
        ...payload,
        invoiceIds: [...payload.invoiceIds].reverse(),
        allocations: [...allocations].reverse(),
      }).expect(201),
    ]);
    expect(replay.body).toEqual(result.body);
    await settle({
      ...payload,
      allocations: [
        { ...allocations[0], amount: '0.651' },
        { ...allocations[1], amount: '0.449' },
      ],
    }).expect(409);
    await settle({ ...payload, allocations: undefined }).expect(409);
    const settlement = await db.insuranceSettlement.findUniqueOrThrow({
      where: { id: responseBody<{ id: number }>(result).id },
      include: {
        allocations: { orderBy: { invoiceId: 'asc' } },
        postingEntry: { include: { lines: true } },
      },
    });
    expect(
      settlement.allocations.map((item) => [
        item.amount.toFixed(3),
        item.outstandingBefore.toFixed(3),
      ]),
    ).toEqual([
      ['0.650', '1.000'],
      ['0.450', '0.450'],
    ]);
    expect(
      Money.sumDecimal(
        ...settlement.postingEntry.lines.map((line) => line.debit),
      ).toFixed(3),
    ).toBe('1.100');
    expect(
      Money.sumDecimal(
        ...settlement.postingEntry.lines.map((line) => line.credit),
      ).toFixed(3),
    ).toBe('1.100');
    const receipt = await request(app.getHttpServer())
      .get(`/insurance/claims/settlements/${settlement.id}/refunds`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(receipt.body).toMatchObject({
      allocations: [
        {
          invoiceId: first.id,
          outstandingBefore: '1.000',
          remainingAfterReceipt: '0.350',
        },
        {
          invoiceId: second.id,
          outstandingBefore: '0.450',
          remainingAfterReceipt: '0.000',
        },
      ],
    });
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject({
      claimStatus: 'PARTIALLY_PAID',
      status: 'PARTIALLY_PAID',
      paidAmount: first.paidAmount,
    });
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: second.id } }),
    ).toMatchObject({ claimStatus: 'PAID', status: 'PAID' });
    const claims = await request(app.getHttpServer())
      .get('/insurance/claims?status=PARTIALLY_PAID')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(claims.body).toContainEqual(
      expect.objectContaining({ id: first.id, settlementOutstanding: '0.350' }),
    );
    await settle({
      ...payload,
      invoiceIds: [first.id],
      bankReference: 'PARTIAL-TRANSFER-02',
      amount: '0.350',
      allocations: undefined,
    }).expect(201);
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject({ claimStatus: 'PAID', status: 'PAID' });
    expect(await db.insuranceSettlement.count({ where: { hospitalId } })).toBe(
      2,
    );
  });

  it('records overpaid and pure unallocated remittances, applies unallocated credit to invoices, enforces 4-eyes unallocated refunds, and blocks journal reversals', async () => {
    const provider = await db.insuranceProvider.create({
      data: {
        hospitalId,
        code: 'UNALLOC-INSURER',
        name: 'Synthetic Unallocated Insurer',
      },
    });
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: 'UNALLOC-PATIENT',
        fullName: 'Synthetic patient',
        gender: 'MALE',
      },
    });
    const encounter = await db.encounter.create({
      data: { hospitalId, patientId: patient.id, type: 'OPD', status: 'OPEN' },
    });
    const reviewer = await auth.createTestUser(
      'unallocated-reviewer',
      'synthetic',
      {
        hospitalId,
        permissions: ['insurance:manage'],
      },
    );
    const issue = async (share: string) => {
      const invoice = await db.invoice.create({
        data: {
          hospitalId,
          patientId: patient.id,
          encounterId: encounter.id,
          totalAmount: share,
          insuranceShare: share,
          patientShare: '0.000',
          status: 'ISSUED',
          claimStatus: 'SUBMITTED',
          insuranceProviderId: provider.id,
        },
      });
      await accountingService.recordInvoiceEntry({
        hospitalId,
        invoiceId: invoice.id,
        userId: adminUserId,
      });
      return invoice;
    };

    const inv1 = await issue('1.000');
    const inv2 = await issue('1.000');
    const inv3 = await issue('0.500');

    const settle = (body: object, token = adminToken) =>
      request(app.getHttpServer())
        .post('/insurance/claims/settlements')
        .auth(token, { type: 'bearer' })
        .send(body);

    // 1. Overpayment without explicit unallocatedAmount must still be rejected (400)
    await settle({
      providerId: provider.id,
      invoiceIds: [inv1.id],
      amount: '1.500',
      bankReference: 'OVERPAY-REJECT-01',
      confirmed: true,
    }).expect(400);

    // Pure unallocated without unallocatedAmount must be rejected (400)
    await settle({
      providerId: provider.id,
      invoiceIds: [],
      amount: '2.000',
      bankReference: 'PURE-REJECT-01',
      confirmed: true,
    }).expect(400);

    // 2. Record overpaid remittance (1.000 allocated to inv1 + 0.500 unallocated = 1.500)
    const overpaidPayload = {
      providerId: provider.id,
      invoiceIds: [inv1.id],
      amount: '1.500',
      bankReference: 'OVERPAY-TRANSFER-01',
      confirmed: true,
      unallocatedAmount: '0.500',
    };
    const [overpaidRes, overpaidReplay] = await Promise.all([
      settle(overpaidPayload).expect(201),
      settle(overpaidPayload).expect(201),
    ]);
    expect(overpaidReplay.body).toEqual(overpaidRes.body);
    await settle({
      ...overpaidPayload,
      amount: '1.400',
      unallocatedAmount: '0.400',
    }).expect(409);

    const overpaid = responseBody<{
      id: number;
      postingEntryId: number;
      unallocatedAccountId: number;
      allocations: { id: number; invoiceId: number; amount: string }[];
    }>(overpaidRes);

    const bankAccount = await db.account.findFirstOrThrow({
      where: { hospitalId, code: '101100' },
    });
    const receivableAccount = await db.account.findFirstOrThrow({
      where: { hospitalId, code: '120200' },
    });
    const unallocatedAccount = await db.account.findFirstOrThrow({
      where: { hospitalId, code: '200600' },
    });
    expect(overpaid.unallocatedAccountId).toBe(unallocatedAccount.id);

    const overpaidEntry = await db.accountingEntry.findUniqueOrThrow({
      where: { id: overpaid.postingEntryId },
      include: { lines: true },
    });
    expect(
      overpaidEntry.lines.map((line) => [
        line.accountId,
        line.debit.toFixed(3),
        line.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [bankAccount.id, '1.500', '0.000'],
        [receivableAccount.id, '0.000', '1.000'],
        [unallocatedAccount.id, '0.000', '0.500'],
      ]),
    );
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv1.id } }),
    ).toMatchObject({ claimStatus: 'PAID', status: 'PAID' });

    // 3. Record pure unallocated remittance (2.000)
    const pureRes = await settle({
      providerId: provider.id,
      invoiceIds: [],
      amount: '2.000',
      bankReference: 'PURE-UNALLOC-01',
      confirmed: true,
      unallocatedAmount: '2.000',
    }).expect(201);
    const pure = responseBody<{ id: number; postingEntryId: number }>(pureRes);

    const pureEntry = await db.accountingEntry.findUniqueOrThrow({
      where: { id: pure.postingEntryId },
      include: { lines: true },
    });
    expect(
      pureEntry.lines.map((line) => [
        line.accountId,
        line.debit.toFixed(3),
        line.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [bankAccount.id, '2.000', '0.000'],
        [unallocatedAccount.id, '0.000', '2.000'],
      ]),
    );

    const listUnallocated = await request(app.getHttpServer())
      .get('/insurance/claims/settlements?onlyUnallocated=true')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(listUnallocated.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pure.id,
          availableUnallocated: '2.000',
        }),
        expect.objectContaining({
          id: overpaid.id,
          availableUnallocated: '0.500',
        }),
      ]),
    );
    const crossTenantList = await request(app.getHttpServer())
      .get('/insurance/claims/settlements?onlyUnallocated=true')
      .auth(otherToken, { type: 'bearer' })
      .expect(200);
    expect(crossTenantList.body).toEqual([]);

    // 4. Subsequent credit applications & tenant isolation
    const applyCredit = (
      settlementId: number,
      body: object,
      token = adminToken,
    ) =>
      request(app.getHttpServer())
        .post(`/insurance/claims/settlements/${settlementId}/apply`)
        .auth(token, { type: 'bearer' })
        .send(body);

    const apply1Req = {
      requestId: randomUUID(),
      invoiceIds: [inv2.id],
      amount: '0.600',
      allocations: [{ invoiceId: inv2.id, amount: '0.600' }],
    };
    await applyCredit(pure.id, apply1Req, otherToken).expect(404);
    await applyCredit(pure.id, {
      ...apply1Req,
      requestId: randomUUID(),
      amount: '2.001',
      allocations: undefined,
    }).expect(400);

    const [applied1, applied1Replay] = await Promise.all([
      applyCredit(pure.id, apply1Req).expect(201),
      applyCredit(pure.id, apply1Req).expect(201),
    ]);
    expect(applied1Replay.body).toEqual(applied1.body);
    await applyCredit(pure.id, {
      ...apply1Req,
      amount: '0.500',
      allocations: [{ invoiceId: inv2.id, amount: '0.500' }],
    }).expect(409);

    const app1Body = responseBody<{ id: number; postingEntryId: number }>(
      applied1,
    );
    const app1Entry = await db.accountingEntry.findUniqueOrThrow({
      where: { id: app1Body.postingEntryId },
      include: { lines: true },
    });
    expect(
      app1Entry.lines.map((line) => [
        line.accountId,
        line.debit.toFixed(3),
        line.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [unallocatedAccount.id, '0.600', '0.000'],
        [receivableAccount.id, '0.000', '0.600'],
      ]),
    );
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv2.id } }),
    ).toMatchObject({
      claimStatus: 'PARTIALLY_PAID',
      status: 'PARTIALLY_PAID',
    });

    // Second application from the SAME pure settlement finishes inv2 (0.400) + inv3 (0.500)
    await applyCredit(pure.id, {
      requestId: randomUUID(),
      invoiceIds: [inv2.id, inv3.id],
      amount: '0.900',
    }).expect(201);
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv2.id } }),
    ).toMatchObject({ claimStatus: 'PAID', status: 'PAID' });
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv3.id } }),
    ).toMatchObject({ claimStatus: 'PAID', status: 'PAID' });

    // 5. 4-eyes Maker-Checker unallocated refund & pending reservation
    const pureRefundRes = await request(app.getHttpServer())
      .post(`/insurance/claims/settlements/${pure.id}/refunds`)
      .auth(adminToken, { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        reason: 'Reserve part of pure unallocated remittance',
        unallocatedAmount: '0.300',
      })
      .expect(201);
    const reservedRefundId = responseBody<{ id: number }>(pureRefundRes).id;

    // Applying 0.300 now exceeds remaining 0.200 because 0.300 is PENDING refund
    const inv4 = await issue('0.300');
    await applyCredit(pure.id, {
      requestId: randomUUID(),
      invoiceIds: [inv4.id],
      amount: '0.300',
    }).expect(400);

    // Reject releases the 0.300 reservation cleanly
    await request(app.getHttpServer())
      .post(
        `/insurance/claims/settlements/${pure.id}/refunds/${reservedRefundId}/review`,
      )
      .auth(reviewer.accessToken, { type: 'bearer' })
      .send({
        decision: 'REJECT',
        note: 'Hold off pending final reconciliation',
      })
      .expect(201);

    // Request full remaining 0.500 unallocated refund -> Maker blocked (403) -> Reviewer POSTs
    const finalUnallocReq = await request(app.getHttpServer())
      .post(`/insurance/claims/settlements/${pure.id}/refunds`)
      .auth(adminToken, { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        reason: 'Return unused unallocated transfer balance',
        unallocatedAmount: '0.500',
      })
      .expect(201);
    const finalUnallocId = responseBody<{ id: number }>(finalUnallocReq).id;

    await request(app.getHttpServer())
      .post(
        `/insurance/claims/settlements/${pure.id}/refunds/${finalUnallocId}/review`,
      )
      .auth(adminToken, { type: 'bearer' })
      .send({
        decision: 'POST',
        note: 'Self approval must fail',
        bankReference: 'REFUND-UNALLOC-SELF',
        confirmed: true,
      })
      .expect(403);

    const postedPureRefund = await request(app.getHttpServer())
      .post(
        `/insurance/claims/settlements/${pure.id}/refunds/${finalUnallocId}/review`,
      )
      .auth(reviewer.accessToken, { type: 'bearer' })
      .send({
        decision: 'POST',
        note: 'Confirmed bank wire for unallocated excess',
        bankReference: 'REFUND-UNALLOC-01',
        confirmed: true,
      })
      .expect(201);
    const pureRefundEntryId = responseBody<{ postingEntryId: number }>(
      postedPureRefund,
    ).postingEntryId;
    const pureRefundEntry = await db.accountingEntry.findUniqueOrThrow({
      where: { id: pureRefundEntryId },
      include: { lines: true },
    });
    expect(
      pureRefundEntry.lines.map((line) => [
        line.accountId,
        line.debit.toFixed(3),
        line.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [unallocatedAccount.id, '0.500', '0.000'],
        [bankAccount.id, '0.000', '0.500'],
      ]),
    );

    const pureLedger = await request(app.getHttpServer())
      .get(`/insurance/claims/settlements/${pure.id}/refunds`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(pureLedger.body).toMatchObject({
      unallocatedAmount: '2.000',
      appliedUnallocated: '1.500',
      refundedUnallocated: '0.500',
      availableUnallocated: '0.000',
    });

    // 6. Mixed refund on overpaid settlement (allocation 0.250 on inv1 + unallocated 0.500 = 0.750)
    const mixedReq = await request(app.getHttpServer())
      .post(`/insurance/claims/settlements/${overpaid.id}/refunds`)
      .auth(adminToken, { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        reason: 'Mixed refund of allocation and unallocated excess',
        lines: [{ allocationId: overpaid.allocations[0].id, amount: '0.250' }],
        unallocatedAmount: '0.500',
      })
      .expect(201);
    const mixedId = responseBody<{ id: number }>(mixedReq).id;
    const mixedPosted = await request(app.getHttpServer())
      .post(
        `/insurance/claims/settlements/${overpaid.id}/refunds/${mixedId}/review`,
      )
      .auth(reviewer.accessToken, { type: 'bearer' })
      .send({
        decision: 'POST',
        note: 'Verified mixed refund bank transfer',
        bankReference: 'REFUND-MIXED-02',
        confirmed: true,
      })
      .expect(201);
    const mixedEntryId = responseBody<{ postingEntryId: number }>(
      mixedPosted,
    ).postingEntryId;
    const mixedEntry = await db.accountingEntry.findUniqueOrThrow({
      where: { id: mixedEntryId },
      include: { lines: true },
    });
    expect(
      mixedEntry.lines.map((line) => [
        line.accountId,
        line.debit.toFixed(3),
        line.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [receivableAccount.id, '0.250', '0.000'],
        [unallocatedAccount.id, '0.500', '0.000'],
        [bankAccount.id, '0.000', '0.750'],
      ]),
    );
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: inv1.id } }),
    ).toMatchObject({ claimStatus: 'PARTIALLY_PAID' });

    const remainingList = await request(app.getHttpServer())
      .get('/insurance/claims/settlements?onlyUnallocated=true')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(remainingList.body).toEqual([]);

    // 7. Manual reversal must be blocked on settlement, application, and refund journal entries
    for (const protectedEntryId of [
      overpaid.postingEntryId,
      pure.postingEntryId,
      app1Body.postingEntryId,
      pureRefundEntryId,
      mixedEntryId,
    ]) {
      await expect(
        accountingService.reverseEntry(
          hospitalId,
          protectedEntryId,
          adminUserId,
          'Synthetic unauthorized reversal',
        ),
      ).rejects.toThrow();
    }
  });

  it('enforces 4-eyes approved contractual and bad-debt claim write-offs, reservation blocking, settlement continuity, tenant isolation, and reversal protection', async () => {
    await accountingService.ensureDefaultAccountsForHospital(hospitalId);
    const provider = await db.insuranceProvider.create({
      data: {
        hospitalId,
        code: 'WRITEOFF-INSURER',
        name: 'Synthetic WriteOff Insurer',
      },
    });
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: 'WRITEOFF-PATIENT',
        fullName: 'Synthetic WriteOff Patient',
        gender: 'MALE',
      },
    });
    const encounter = await db.encounter.create({
      data: { hospitalId, patientId: patient.id, type: 'OPD', status: 'OPEN' },
    });
    const reviewer = await auth.createTestUser(
      'writeoff-reviewer',
      'synthetic',
      {
        hospitalId,
        permissions: ['insurance:manage'],
      },
    );
    const issue = async (
      share: string,
      claimStatus: 'SUBMITTED' | 'REJECTED',
    ) => {
      const invoice = await db.invoice.create({
        data: {
          hospitalId,
          patientId: patient.id,
          encounterId: encounter.id,
          totalAmount: share,
          insuranceShare: share,
          patientShare: '0.000',
          status: 'ISSUED',
          claimStatus,
          insuranceProviderId: provider.id,
        },
      });
      await accountingService.recordInvoiceEntry({
        hospitalId,
        invoiceId: invoice.id,
        userId: adminUserId,
      });
      return invoice;
    };

    const invContract = await issue('1.000', 'SUBMITTED');
    const invBadDebt = await issue('1.000', 'REJECTED');

    // 1. Settle 0.700 partially on invContract -> remaining 0.300
    await request(app.getHttpServer())
      .post('/insurance/claims/settlements')
      .auth(adminToken, { type: 'bearer' })
      .send({
        providerId: provider.id,
        invoiceIds: [invContract.id],
        amount: '0.700',
        bankReference: 'WRITEOFF-PARTIAL-01',
        confirmed: true,
        allocations: [{ invoiceId: invContract.id, amount: '0.700' }],
      })
      .expect(201);

    // 2. Request CONTRACTUAL_ALLOWANCE write-off of 0.300 + idempotency + 409 conflict
    const writeOffReqKey = randomUUID();
    const requestWriteOff = (
      invoiceId: number,
      body: object,
      token = adminToken,
    ) =>
      request(app.getHttpServer())
        .post(`/insurance/claims/${invoiceId}/write-offs`)
        .auth(token, { type: 'bearer' })
        .send(body);

    const woReqBody = {
      requestId: writeOffReqKey,
      category: 'CONTRACTUAL_ALLOWANCE',
      amount: '0.300',
      reason: 'Contractual fee schedule adjustment on claim',
    };
    const [wo1, wo1Replay] = await Promise.all([
      requestWriteOff(invContract.id, woReqBody).expect(201),
      requestWriteOff(invContract.id, woReqBody).expect(201),
    ]);
    expect(wo1Replay.body).toEqual(wo1.body);
    await requestWriteOff(invContract.id, {
      ...woReqBody,
      amount: '0.250',
    }).expect(409);

    // Cross-tenant isolation blocked with 404
    await requestWriteOff(
      invContract.id,
      { ...woReqBody, requestId: randomUUID() },
      otherToken,
    ).expect(404);

    // Pending write-off blocks concurrent settlement & withdrawal (400)
    await request(app.getHttpServer())
      .post('/insurance/claims/settlements')
      .auth(adminToken, { type: 'bearer' })
      .send({
        providerId: provider.id,
        invoiceIds: [invContract.id],
        amount: '0.300',
        bankReference: 'WRITEOFF-BLOCKED-02',
        confirmed: true,
      })
      .expect(400);

    // Over-limit second write-off blocked (400)
    await requestWriteOff(invContract.id, {
      ...woReqBody,
      requestId: randomUUID(),
      amount: '0.001',
    }).expect(400);

    const wo1Id = responseBody<{ id: number }>(wo1).id;
    const reviewWriteOff = (
      invoiceId: number,
      writeOffId: number,
      body: object,
      token = reviewer.accessToken,
    ) =>
      request(app.getHttpServer())
        .post(`/insurance/claims/${invoiceId}/write-offs/${writeOffId}/review`)
        .auth(token, { type: 'bearer' })
        .send(body);

    // Maker cannot self-approve (403)
    await reviewWriteOff(
      invContract.id,
      wo1Id,
      { decision: 'POST', note: 'Self approval must fail' },
      adminToken,
    ).expect(403);

    // Reviewer approves CONTRACTUAL_ALLOWANCE -> Dr 400800 / Cr 120200, invoice becomes PAID
    const postedContractWo = await reviewWriteOff(invContract.id, wo1Id, {
      decision: 'POST',
      note: 'Approved per contract tariff table',
    }).expect(201);
    const contractEntryId = responseBody<{ postingEntryId: number }>(
      postedContractWo,
    ).postingEntryId;

    const contraRevAccount = await db.account.findFirstOrThrow({
      where: { hospitalId, code: '400800' },
    });
    const badDebtAccount = await db.account.findFirstOrThrow({
      where: { hospitalId, code: '510900' },
    });
    const receivableAccount = await db.account.findFirstOrThrow({
      where: { hospitalId, code: '120200' },
    });
    const contractEntry = await db.accountingEntry.findUniqueOrThrow({
      where: { id: contractEntryId },
      include: { lines: true },
    });
    expect(
      contractEntry.lines.map((l) => [
        l.accountId,
        l.debit.toFixed(3),
        l.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [contraRevAccount.id, '0.300', '0.000'],
        [receivableAccount.id, '0.000', '0.300'],
      ]),
    );
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: invContract.id } }),
    ).toMatchObject({ claimStatus: 'PAID', status: 'PAID' });

    // 3. BAD_DEBT write-off on REJECTED invoice: reject releases reservation -> re-request -> POST -> settle remainder
    const rejectedWoReq = await requestWriteOff(invBadDebt.id, {
      requestId: randomUUID(),
      category: 'BAD_DEBT',
      amount: '0.700',
      reason: 'Initial partial bad debt reserve',
    }).expect(201);
    const rejectedWoId = responseBody<{ id: number }>(rejectedWoReq).id;
    await reviewWriteOff(invBadDebt.id, rejectedWoId, {
      decision: 'REJECT',
      note: 'Reduce write-off amount to 0.400 only',
    }).expect(201);

    const badDebtReq = await requestWriteOff(invBadDebt.id, {
      requestId: randomUUID(),
      category: 'BAD_DEBT',
      amount: '0.400',
      reason: 'Final disallowed claim portion after appeal',
    }).expect(201);
    const badDebtId = responseBody<{ id: number }>(badDebtReq).id;
    const postedBadDebt = await reviewWriteOff(invBadDebt.id, badDebtId, {
      decision: 'POST',
      note: 'Approved bad debt write-off by finance manager',
    }).expect(201);
    const badDebtEntryId = responseBody<{ postingEntryId: number }>(
      postedBadDebt,
    ).postingEntryId;

    const badDebtEntry = await db.accountingEntry.findUniqueOrThrow({
      where: { id: badDebtEntryId },
      include: { lines: true },
    });
    expect(
      badDebtEntry.lines.map((l) => [
        l.accountId,
        l.debit.toFixed(3),
        l.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [badDebtAccount.id, '0.400', '0.000'],
        [receivableAccount.id, '0.000', '0.400'],
      ]),
    );
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: invBadDebt.id } }),
    ).toMatchObject({
      claimStatus: 'PARTIALLY_PAID',
      status: 'PARTIALLY_PAID',
    });

    // Claims list shows settlementWrittenOff & settlementOutstanding = 0.600
    const claimsList = await request(app.getHttpServer())
      .get('/insurance/claims?status=PARTIALLY_PAID')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(claimsList.body).toContainEqual(
      expect.objectContaining({
        id: invBadDebt.id,
        settlementWrittenOff: '0.400',
        settlementOutstanding: '0.600',
      }),
    );

    // Withdrawal blocked once write-off posted (400)
    await request(app.getHttpServer())
      .post(`/insurance/claims/${invBadDebt.id}/withdrawal`)
      .auth(adminToken, { type: 'bearer' })
      .send({
        payerReference: 'WITHDRAW-WO-BLOCK',
        reason: 'Cannot withdraw after write-off',
        confirmed: true,
      })
      .expect(400);

    // Subsequent bank settlement for remaining 0.600 succeeds -> invoice PAID
    await request(app.getHttpServer())
      .post('/insurance/claims/settlements')
      .auth(adminToken, { type: 'bearer' })
      .send({
        providerId: provider.id,
        invoiceIds: [invBadDebt.id],
        amount: '0.600',
        bankReference: 'WRITEOFF-REMAINDER-01',
        confirmed: true,
      })
      .expect(201);
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: invBadDebt.id } }),
    ).toMatchObject({ claimStatus: 'PAID', status: 'PAID' });

    // Write-off ledger returns complete audit summary
    const ledgerRes = await request(app.getHttpServer())
      .get(`/insurance/claims/${invBadDebt.id}/write-offs`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(ledgerRes.body).toMatchObject({
      invoiceId: invBadDebt.id,
      effectiveShare: '1.000',
      settledNet: '0.600',
      postedWriteOff: '0.400',
      pendingWriteOff: '0.000',
      available: '0.000',
    });

    // Manual reversal must be blocked on write-off entries
    for (const entryId of [contractEntryId, badDebtEntryId]) {
      await expect(
        accountingService.reverseEntry(
          hospitalId,
          entryId,
          adminUserId,
          'Synthetic unauthorized write-off reversal',
        ),
      ).rejects.toThrow();
    }
  });

  it('enforces RCM claim creation concurrency, scrubbing, payment validation, denial/appeal workflow, and tenant isolation', async () => {
    const provider = await db.insuranceProvider.create({
      data: {
        hospitalId,
        code: `INS-RCM-${Date.now()}`,
        name: 'شركة الثقة للتأمين الطبي',
        isActive: true,
      },
    });

    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-RCM-${Date.now()}`,
        fullName: 'عمر المختار الزوي',
        gender: 'MALE',
        dateOfBirth: new Date('1975-03-20T00:00:00.000Z'),
      },
    });

    const encounter = await db.encounter.create({
      data: {
        hospitalId,
        patientId: patient.id,
        type: 'OPD',
        status: 'OPEN',
      },
    });

    const insuredInvoice = await db.invoice.create({
      data: {
        hospitalId,
        patientId: patient.id,
        encounterId: encounter.id,
        status: 'ISSUED',
        totalAmount: '400.550',
        discountAmount: '0.000',
        paidAmount: '80.000',
        patientShare: '80.000',
        insuranceShare: '320.550',
        insuranceProviderId: provider.id,
        claimStatus: 'PENDING',
      },
    });

    const secondInsuredInvoice = await db.invoice.create({
      data: {
        hospitalId,
        patientId: patient.id,
        encounterId: encounter.id,
        status: 'ISSUED',
        totalAmount: '250.000',
        discountAmount: '0.000',
        paidAmount: '50.000',
        patientShare: '50.000',
        insuranceShare: '200.000',
        insuranceProviderId: provider.id,
        claimStatus: 'PENDING',
      },
    });

    for (const invoiceId of [insuredInvoice.id, secondInsuredInvoice.id]) {
      await accountingService.recordInvoiceEntry({
        hospitalId,
        invoiceId,
        userId: adminUserId,
      });
    }
    // 1. Concurrent createClaim for the same invoice -> 1 succeeds (201) and 1 fails (400)
    const [claimResA, claimResB] = await Promise.all([
      request(app.getHttpServer())
        .post('/rcm/claims/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ invoiceId: insuredInvoice.id }),
      request(app.getHttpServer())
        .post('/rcm/claims/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ invoiceId: insuredInvoice.id }),
    ]);

    const createStatuses = [claimResA.status, claimResB.status].sort(
      (a, b) => a - b,
    );
    expect(createStatuses).toEqual([201, 400]);

    const createdClaim =
      claimResA.status === 201
        ? responseBody<TestResponse>(claimResA)
        : responseBody<TestResponse>(claimResB);
    const claimId = createdClaim.id;
    expect(Money.toDbString(createdClaim.claimedAmount)).toBe('320.550');

    // 2. Cross-tenant isolation on RCM claim routes must return 404
    await request(app.getHttpServer())
      .get(`/rcm/claims/claims/${claimId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/rcm/claims/claims/${claimId}/scrub`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .put(`/rcm/claims/claims/${claimId}/status`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ status: 'SUBMITTED' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/rcm/claims/claims/${claimId}/payment`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ paidAmount: '50', requestId: randomUUID() })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/rcm/claims/claims/${claimId}/deny`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ denialCode: 'CO-4', denialReason: 'Cross-tenant denial' })
      .expect(404);

    await request(app.getHttpServer())
      .put(`/rcm/claims/claims/${claimId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SUBMITTED' })
      .expect(200);
    // 3. Payment posting validations (reject <= 0, partial payment, reject overpayment, full settlement with adjustment)
    await request(app.getHttpServer())
      .post(`/rcm/claims/claims/${claimId}/payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paidAmount: '0', requestId: randomUUID() })
      .expect(400);

    const partialPayRes = await request(app.getHttpServer())
      .post(`/rcm/claims/claims/${claimId}/payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paidAmount: '120.55', requestId: randomUUID() })
      .expect(201);
    expect(responseBody<TestResponse>(partialPayRes).status).toBe(
      'PARTIALLY_PAID',
    );
    expect(
      Money.toDbString(responseBody<TestResponse>(partialPayRes).paidAmount),
    ).toBe('120.550');

    // Overpayment beyond remaining 200.000 must fail (400)
    await request(app.getHttpServer())
      .post(`/rcm/claims/claims/${claimId}/payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paidAmount: '210', requestId: randomUUID() })
      .expect(400);

    // Complete the remaining200.000 without an unapproved write-off -> PAID
    const finalPayRes = await request(app.getHttpServer())
      .post(`/rcm/claims/claims/${claimId}/payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paidAmount: '200',
        requestId: randomUUID(),
        adjustmentAmount: '0',
        adjustmentReason: 'خصم تعاقدي حسب الاتفاقية',
      })
      .expect(201);
    expect(responseBody<TestResponse>(finalPayRes).status).toBe('PAID');
    expect(
      Money.toDbString(responseBody<TestResponse>(finalPayRes).paidAmount),
    ).toBe('320.550');
    expect(
      Money.toDbString(
        responseBody<TestResponse>(finalPayRes).adjustmentAmount,
      ),
    ).toBe('0.000');

    // Further payments on a PAID claim must be rejected (400)
    await request(app.getHttpServer())
      .post(`/rcm/claims/claims/${claimId}/payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paidAmount: '10', requestId: randomUUID() })
      .expect(400);

    // 4. Create second claim, deny it, and verify dashboard & denial analytics
    const secondClaimRes = await request(app.getHttpServer())
      .post('/rcm/claims/claims')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ invoiceId: secondInsuredInvoice.id })
      .expect(201);
    const secondClaimId = responseBody<TestResponse>(secondClaimRes).id;

    await request(app.getHttpServer())
      .post(`/rcm/claims/claims/${secondClaimId}/deny`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        denialCode: 'CO-197',
        denialReason: 'الموافقة المسبقة غير مرفقة',
        appealDeadline: new Date(Date.now() + 5 * 86400000).toISOString(),
      })
      .expect(201);

    const [dashboardRes, denialAnalyticsRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/rcm/claims/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/rcm/claims/denials/analytics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200),
    ]);

    expect(
      Money.toDbString(responseBody<TestResponse>(dashboardRes).totals.claimed),
    ).toBe('520.550');
    expect(
      Money.toDbString(responseBody<TestResponse>(dashboardRes).totals.paid),
    ).toBe('320.550');
    expect(responseBody<TestResponse>(denialAnalyticsRes).totalDenials).toBe(1);
    expect(
      Money.toDbString(
        responseBody<TestResponse>(denialAnalyticsRes).totalDeniedAmount,
      ),
    ).toBe('200.000');
  });

  it('ingests ERA files, posts receipts and rejections atomically with idempotency, rolls back partial failures, isolates tenants, and protects reconciled ERA records', async () => {
    await accountingService.ensureDefaultAccountsForHospital(hospitalId);
    const provider = await db.insuranceProvider.create({
      data: {
        hospitalId,
        code: `ERA-INS-${Date.now()}`,
        name: 'شركة المتوسط للتأمين ERA',
        isActive: true,
      },
    });
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-ERA-${Date.now()}`,
        fullName: 'سالم علي السنوسي',
        gender: 'MALE',
      },
    });
    const encounter = await db.encounter.create({
      data: { hospitalId, patientId: patient.id, type: 'OPD', status: 'OPEN' },
    });

    const createSubmittedClaim = async (share: string) => {
      const invoice = await db.invoice.create({
        data: {
          hospitalId,
          patientId: patient.id,
          encounterId: encounter.id,
          status: 'ISSUED',
          totalAmount: share,
          patientShare: '0.000',
          insuranceShare: share,
          insuranceProviderId: provider.id,
          claimStatus: 'PENDING',
        },
      });
      await accountingService.recordInvoiceEntry({
        hospitalId,
        invoiceId: invoice.id,
        userId: adminUserId,
      });
      const claimRes = await request(app.getHttpServer())
        .post('/rcm/claims/claims')
        .auth(adminToken, { type: 'bearer' })
        .send({ invoiceId: invoice.id })
        .expect(201);
      const claim = responseBody<{ id: number; claimNumber: string }>(claimRes);
      await request(app.getHttpServer())
        .put(`/rcm/claims/claims/${claim.id}/status`)
        .auth(adminToken, { type: 'bearer' })
        .send({ status: 'SUBMITTED' })
        .expect(200);
      return claim;
    };

    const clm1 = await createSubmittedClaim('100.000');
    const clm2 = await createSubmittedClaim('80.000');
    const clmRollback1 = await createSubmittedClaim('50.000');
    const clmRollback2 = await createSubmittedClaim('40.000');

    // 1. Ingest ERA for clm1 (underpaid 75.000) + clm2 (denied CO-197)
    const eraRes = await request(app.getHttpServer())
      .post('/rcm/claims/era')
      .auth(adminToken, { type: 'bearer' })
      .send({
        insuranceProviderId: provider.id,
        eraNumber: `ERA-${Date.now()}-01`,
        paymentDate: '2026-11-23T10:00:00.000Z',
        totalPaid: '75.000',
        lineItems: [
          {
            claimNumber: clm1.claimNumber,
            billedAmount: '100.000',
            allowedAmount: '75.000',
            paidAmount: '75.000',
            adjustmentAmount: '25.000',
            adjustmentCode: 'CO-45',
            adjustmentReason: 'Contractual fee schedule difference',
          },
          {
            claimNumber: clm2.claimNumber,
            billedAmount: '80.000',
            paidAmount: '0.000',
            denialCode: 'CO-197',
            denialReason: 'Precertification/authorization absent',
          },
        ],
      })
      .expect(201);
    const era = responseBody<{
      id: number;
      status: string;
      lineItems: { id: number; status: string; claimId: number }[];
    }>(eraRes);
    expect(era.status).toBe('PROCESSING');
    expect(era.lineItems.map((l) => l.status)).toEqual(['UNDERPAID', 'DENIED']);

    // Cross-tenant isolation on GET list, GET detail, POST financial
    const otherList = await request(app.getHttpServer())
      .get('/rcm/claims/era')
      .auth(otherToken, { type: 'bearer' })
      .expect(200);
    expect(otherList.body).toEqual([]);
    await request(app.getHttpServer())
      .get(`/rcm/claims/era/${era.id}`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/rcm/claims/era/${era.id}/post`)
      .auth(otherToken, { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        bankReference: 'ERA-CROSS-TENANT',
        confirmed: true,
      })
      .expect(404);

    // 2. Atomic financial ERA posting + idempotent concurrent replay + 409 mismatch
    const postKey = randomUUID();
    const postPayload = {
      requestId: postKey,
      bankReference: 'ERA-BANK-WIRE-01',
      confirmed: true,
    };
    const [postRes, postReplay] = await Promise.all([
      request(app.getHttpServer())
        .post(`/rcm/claims/era/${era.id}/post`)
        .auth(adminToken, { type: 'bearer' })
        .send(postPayload)
        .expect(201),
      request(app.getHttpServer())
        .post(`/rcm/claims/era/${era.id}/post`)
        .auth(adminToken, { type: 'bearer' })
        .send(postPayload)
        .expect(201),
    ]);
    expect(postReplay.body).toEqual(postRes.body);
    expect(postRes.body).toMatchObject({
      success: true,
      eraId: era.id,
      bankReference: 'ERA-BANK-WIRE-01',
      postedReceiptsCount: 1,
      deniedClaimsCount: 1,
      totalPaid: '75.000',
    });

    await request(app.getHttpServer())
      .post(`/rcm/claims/era/${era.id}/post`)
      .auth(adminToken, { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        bankReference: 'ERA-BANK-WIRE-02',
        confirmed: true,
      })
      .expect(409);

    // 3. Verify ledger, ClaimReceipt linkage, Claim states, AuditLog & DB immutability triggers
    const updatedEra = await db.eRATransaction.findUniqueOrThrow({
      where: { id: era.id },
      include: { lineItems: { orderBy: { id: 'asc' } } },
    });
    expect(updatedEra.status).toBe('RECONCILED');
    expect(updatedEra.bankReference).toBe('ERA-BANK-WIRE-01');
    const paidLine = updatedEra.lineItems.find((l) => l.claimId === clm1.id)!;
    const deniedLine = updatedEra.lineItems.find((l) => l.claimId === clm2.id)!;
    expect(paidLine.receiptId).not.toBeNull();
    expect(deniedLine.receiptId).toBeNull();

    const bankAccount = await db.account.findFirstOrThrow({
      where: { hospitalId, code: '101100' },
    });
    const receivableAccount = await db.account.findFirstOrThrow({
      where: { hospitalId, code: '120200' },
    });
    const receiptEntry = await db.accountingEntry.findUniqueOrThrow({
      where: {
        postingKey: `claim-receipt:${hospitalId}:${paidLine.receiptId}`,
      },
      include: { lines: true },
    });
    expect(
      receiptEntry.lines.map((l) => [
        l.accountId,
        l.debit.toFixed(3),
        l.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [bankAccount.id, '75.000', '0.000'],
        [receivableAccount.id, '0.000', '75.000'],
      ]),
    );
    expect(
      await db.claim.findUniqueOrThrow({ where: { id: clm1.id } }),
    ).toMatchObject({ status: 'PARTIALLY_PAID' });
    expect(
      (
        await db.claim.findUniqueOrThrow({ where: { id: clm1.id } })
      ).paidAmount?.toFixed(3),
    ).toBe('75.000');
    expect(
      await db.claim.findUniqueOrThrow({ where: { id: clm2.id } }),
    ).toMatchObject({ status: 'REJECTED', denialCode: 'CO-197' });

    const audit = await db.auditLog.findFirst({
      where: {
        hospitalId,
        entity: 'ERATransaction',
        entityId: era.id,
        action: 'POST_ERA_FINANCIAL_RECONCILIATION',
      },
    });
    expect(audit).not.toBeNull();

    await expect(
      db.eRATransaction.update({
        where: { id: era.id },
        data: { notes: 'tamper' },
      }),
    ).rejects.toThrow();
    await expect(
      db.eRALineItem.delete({ where: { id: paidLine.id } }),
    ).rejects.toThrow();

    // 4. Atomic rollback on partial failure (valid clmRollback1 + overpaid clmRollback2)
    const badEraRes = await request(app.getHttpServer())
      .post('/rcm/claims/era')
      .auth(adminToken, { type: 'bearer' })
      .send({
        insuranceProviderId: provider.id,
        eraNumber: `ERA-${Date.now()}-ROLLBACK`,
        totalPaid: '100.000',
        lineItems: [
          {
            claimNumber: clmRollback1.claimNumber,
            billedAmount: '50.000',
            paidAmount: '50.000',
          },
          {
            claimNumber: clmRollback2.claimNumber,
            billedAmount: '40.000',
            paidAmount: '50.000',
          },
        ],
      })
      .expect(201);
    const badEraId = responseBody<{ id: number }>(badEraRes).id;

    await request(app.getHttpServer())
      .post(`/rcm/claims/era/${badEraId}/post`)
      .auth(adminToken, { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        bankReference: 'ERA-ROLLBACK-01',
        confirmed: true,
      })
      .expect(400);

    expect(
      await db.claimReceipt.count({
        where: { claimId: { in: [clmRollback1.id, clmRollback2.id] } },
      }),
    ).toBe(0);
    expect(
      (await db.eRATransaction.findUniqueOrThrow({ where: { id: badEraId } }))
        .status,
    ).toBe('PROCESSING');
  });

  it('enforces PreAuth attachment magic bytes, size limit, tenant isolation, integrity sha256, retirement locks, and chained audit (UI07)', async () => {
    const providerRes = await request(app.getHttpServer())
      .post('/insurance/providers')
      .auth(adminToken, { type: 'bearer' })
      .send({
        name: 'شركة المدار للتأمين الصحي',
        code: `INS-PREAUTH-${Date.now()}`,
      })
      .expect(201);
    const providerId = responseBody<{ id: number }>(providerRes).id;

    const policyRes = await request(app.getHttpServer())
      .post(`/insurance/providers/${providerId}/policies`)
      .auth(adminToken, { type: 'bearer' })
      .send({
        name: 'بوليصة المرفقات الطبية',
        policyNumber: `POL-ATT-${Date.now()}`,
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2027-01-01T00:00:00.000Z',
        patientCopayRate: 10,
      })
      .expect(201);
    const policyId = responseBody<{ id: number }>(policyRes).id;

    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-ATT-${Date.now()}`,
        fullName: 'عبد السلام الورفلي',
        gender: 'MALE',
        insurancePolicyId: policyId,
      },
    });

    const preAuthRes = await request(app.getHttpServer())
      .post('/insurance/pre-auth')
      .auth(adminToken, { type: 'bearer' })
      .send({
        patientId: patient.id,
        policyId,
        requestedAmount: 350,
        notes: 'موافقة مسبقة مع مرفقات سريرية',
      })
      .expect(201);
    const preAuthId = responseBody<{ id: number }>(preAuthRes).id;

    const pdfBuf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
      'utf8',
    );
    const expectedSha = createHash('sha256').update(pdfBuf).digest('hex');

    // 1. Valid PDF with traversal filename -> sanitized, sha256 verified, saved at storageKey
    const uploadRes = await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments`)
      .auth(adminToken, { type: 'bearer' })
      .field('category', 'MEDICAL_REPORT')
      .field('title', 'تقرير طبي مرفق')
      .attach('file', pdfBuf, {
        filename: '../../evil report.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const att1 = responseBody<{
      id: number;
      sha256: string;
      originalFileName: string;
      storageKey: string;
      sizeBytes: number;
      retiredAt: string | null;
    }>(uploadRes);
    expect(att1.sha256).toBe(expectedSha);
    expect(att1.sizeBytes).toBe(pdfBuf.length);
    expect(att1.originalFileName).not.toContain('/');
    expect(att1.originalFileName).not.toContain('..');
    expect(att1.retiredAt).toBeNull();
    const diskPath = path.resolve(attachmentRoot, att1.storageKey);
    expect(fs.existsSync(diskPath)).toBe(true);

    // 2. Duplicate active content -> 409
    await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments`)
      .auth(adminToken, { type: 'bearer' })
      .field('category', 'MEDICAL_REPORT')
      .attach('file', pdfBuf, {
        filename: 'duplicate.pdf',
        contentType: 'application/pdf',
      })
      .expect(409);

    // 3. Mismatched magic bytes -> 400
    await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments`)
      .auth(adminToken, { type: 'bearer' })
      .field('category', 'MEDICAL_REPORT')
      .attach('file', Buffer.from('plain text fake pdf', 'utf8'), {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    const pngMagic = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments`)
      .auth(adminToken, { type: 'bearer' })
      .field('category', 'IMAGING')
      .attach('file', pngMagic, {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    // 4. Exceeding 10 MB limit -> 413
    const oversizeBuf = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    Buffer.from('%PDF-').copy(oversizeBuf, 0);
    await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments`)
      .auth(adminToken, { type: 'bearer' })
      .field('category', 'MEDICAL_REPORT')
      .attach('file', oversizeBuf, {
        filename: 'oversize.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);

    // 5. List contains 1 active attachment
    const listRes = await request(app.getHttpServer())
      .get(`/insurance/pre-auth/${preAuthId}/attachments`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect((listRes.body as unknown[]).length).toBe(1);

    // 6. Download returns exact bytes with security headers
    const dlRes = await request(app.getHttpServer())
      .get(`/insurance/pre-auth/${preAuthId}/attachments/${att1.id}/download`)
      .auth(adminToken, { type: 'bearer' })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(dlRes.body as Buffer, pdfBuf)).toBe(0);
    expect(dlRes.headers['x-content-type-options']).toBe('nosniff');
    expect(String(dlRes.headers['content-disposition'])).toContain(
      'attachment',
    );

    // 7. Cross-tenant isolation -> 404
    await request(app.getHttpServer())
      .get(`/insurance/pre-auth/${preAuthId}/attachments`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/insurance/pre-auth/${preAuthId}/attachments/${att1.id}/download`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments`)
      .auth(otherToken, { type: 'bearer' })
      .field('category', 'MEDICAL_REPORT')
      .attach('file', pngMagic, {
        filename: 'other.png',
        contentType: 'image/png',
      })
      .expect(404);

    // 8. Tampering on disk -> 409, then restore
    fs.appendFileSync(diskPath, Buffer.from('TAMPER'));
    await request(app.getHttpServer())
      .get(`/insurance/pre-auth/${preAuthId}/attachments/${att1.id}/download`)
      .auth(adminToken, { type: 'bearer' })
      .expect(409);
    fs.writeFileSync(diskPath, pdfBuf);

    // 9. Short retire reason -> 400; valid reason -> retired; re-upload same PDF -> 201
    await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments/${att1.id}/retire`)
      .auth(adminToken, { type: 'bearer' })
      .send({ reason: 'abc' })
      .expect(400);

    const retireRes = await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments/${att1.id}/retire`)
      .auth(adminToken, { type: 'bearer' })
      .send({ reason: 'مستند غير واضح وسيتم استبداله بنسخة أحدث' })
      .expect(201);
    expect(
      responseBody<{ retiredAt: string | null }>(retireRes).retiredAt,
    ).not.toBeNull();

    const reUploadRes = await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments`)
      .auth(adminToken, { type: 'bearer' })
      .field('category', 'MEDICAL_REPORT')
      .attach('file', pdfBuf, {
        filename: 'replacement.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const att2 = responseBody<{ id: number }>(reUploadRes);

    // 10. Decide PreAuth (REJECTED) -> upload & retire blocked (409)
    await request(app.getHttpServer())
      .patch(`/insurance/pre-auth/${preAuthId}`)
      .auth(adminToken, { type: 'bearer' })
      .send({ status: 'REJECTED' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments`)
      .auth(adminToken, { type: 'bearer' })
      .field('category', 'LAB_RESULT')
      .attach('file', pngMagic, {
        filename: 'late.png',
        contentType: 'image/png',
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuthId}/attachments/${att2.id}/retire`)
      .auth(adminToken, { type: 'bearer' })
      .send({ reason: 'محاولة سحب بعد حسم الموافقة المسبقة' })
      .expect(409);

    // 11. Database trigger immutability enforcement
    await expect(
      db.preAuthorizationAttachment.delete({ where: { id: att2.id } }),
    ).rejects.toThrow();
    await expect(
      db.preAuthorizationAttachment.update({
        where: { id: att2.id },
        data: { sha256: '0'.repeat(64) },
      }),
    ).rejects.toThrow();

    // 12. Chained AuditLog actions present
    const auditActions = await db.auditLog.findMany({
      where: {
        hospitalId,
        entity: 'PreAuthorizationAttachment',
      },
      select: { action: true },
    });
    const actionSet = new Set(auditActions.map((a) => a.action));
    expect(actionSet.has('UPLOAD_PREAUTH_ATTACHMENT')).toBe(true);
    expect(actionSet.has('DOWNLOAD_PREAUTH_ATTACHMENT')).toBe(true);
    expect(actionSet.has('RETIRE_PREAUTH_ATTACHMENT')).toBe(true);
  });
});
