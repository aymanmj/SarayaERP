import { randomUUID } from 'node:crypto';
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
});
