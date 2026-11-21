import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper, testStaffSessionClaims } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { seedFinancialAccounts } from '../financial-fixture';
import { InvoiceRefundsService } from '../../src/billing/invoice-refunds.service';

describe('Refunds and physical cash custody (PostgreSQL e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let maker: string;
  let checker: string;
  let cashier: string;
  let reader: string;
  let hospitalId: number;
  let cashierId: number;
  let invoiceId: number;
  let paymentId: number;
  let adjustmentId: number;
  let periodId: number;
  const post = (path: string, data: object = {}, access = maker) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + access)
      .send(data);
  const get = (path: string, access = maker) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer ' + access);
  const idOf = (response: request.Response) =>
    (response.body as { id: number }).id;
  const reason = 'Synthetic independently documented evidence';
  const path = () => `/billing/invoices/${invoiceId}/refunds`;
  const sessions = '/cashier/cash-control';
  const propose = (amount = '30.000', requestId = randomUUID()) =>
    post(path(), { adjustmentId, paymentId, amount, requestId, reason });
  const review = (id: number, access = checker) =>
    post(`${path()}/${id}/approve`, { reason }, access);
  const prepare = (id: number, access = cashier) =>
    post(`${path()}/${id}/prepare`, { requestId: randomUUID() }, access);
  const execute = (id: number, reference = randomUUID(), access = cashier) =>
    post(
      `${path()}/${id}/execute`,
      {
        reference,
        evidence: reason,
        requestId: randomUUID(),
        confirmedPaid: true,
      },
      access,
    );
  const open = async (amount = '100.000') => {
    const id = idOf(
      await post(
        sessions,
        { amount, reason, requestId: randomUUID() },
        cashier,
      ).expect(201),
    );
    await post(
      `${sessions}/${id}/approve`,
      { reason, reference: randomUUID() },
      checker,
    ).expect(201);
    return id;
  };
  const approved = async (amount = '30.000') => {
    const id = idOf(await propose(amount).expect(201));
    await review(id).expect(201);
    return id;
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
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const perms = [
      'billing:manage',
      'billing:view',
      'billing:adjustments:request',
      'billing:adjustments:approve',
      'cashier:manage',
      'cashier:view',
      'cashier:refunds:request',
      'cashier:refunds:approve',
      'cashier:refunds:execute',
      'cashier:sessions:approve',
    ];
    const actor = await auth.createTestUser('refund-maker', 'synthetic', {
      permissions: perms,
    });
    maker = actor.accessToken;
    hospitalId = actor.user.hospitalId;
    checker = (
      await auth.createTestUser('refund-checker', 'synthetic', {
        hospitalId,
        permissions: perms,
      })
    ).accessToken;
    const executor = await auth.createTestUser('refund-cashier', 'synthetic', {
      hospitalId,
      permissions: perms,
    });
    cashier = executor.accessToken;
    cashierId = executor.user.id;
    reader = (
      await auth.createTestUser('refund-reader', 'synthetic', {
        hospitalId,
        permissions: ['billing:view', 'cashier:view'],
      })
    ).accessToken;
    await seedFinancialAccounts(prisma, hospitalId);
    const year = new Date().getUTCFullYear();
    const fy = await prisma.financialYear.create({
      data: {
        hospitalId,
        code: 'REFUND-FY',
        name: String(year),
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year}-12-31`),
        status: 'OPEN',
      },
    });
    periodId = (
      await prisma.financialPeriod.create({
        data: {
          financialYearId: fy.id,
          periodCode: 'REFUND-P',
          periodIndex: 1,
          monthStartDate: new Date(`${year}-01-01`),
          monthEndDate: new Date(`${year}-12-31`),
          numberOfDays: 365,
          isOpen: true,
        },
      })
    ).id;
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        mrn: 'REFUND-PATIENT',
        fullName: 'Synthetic refund patient',
      },
    });
    const encounter = await prisma.encounter.create({
      data: { hospitalId, patientId: patient.id, type: 'IPD' },
    });
    const service = await prisma.serviceItem.create({
      data: {
        hospitalId,
        code: 'REFUND-BED',
        name: 'Synthetic bed',
        type: 'BED',
        defaultPrice: 100,
      },
    });
    const charge = await prisma.encounterCharge.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        serviceItemId: service.id,
        quantity: 1,
        unitPrice: 100,
        totalAmount: 100,
        sourceType: 'BED',
      },
    });
    invoiceId = idOf(
      await post(`/billing/encounters/${encounter.id}/invoices`).expect(201),
    );
    await post(`/cashier/invoices/${invoiceId}/payments`, {
      amount: 100,
      method: 'CASH',
    }).expect(201);
    paymentId = (
      await prisma.payment.findFirstOrThrow({ where: { invoiceId } })
    ).id;
    adjustmentId = idOf(
      await post(`/billing/invoices/${invoiceId}/adjustments`, {
        chargeId: charge.id,
        correctedAmount: '60.000',
        reason,
        requestId: randomUUID(),
      }).expect(201),
    );
    await post(
      `/billing/invoices/${invoiceId}/adjustments/${adjustmentId}/approve`,
      { reason },
      checker,
    ).expect(201);
  });
  it('reserves the patient credit without journal and denies self approval or read-only mutation', async () => {
    const count = await prisma.accountingEntry.count();
    const id = idOf(await propose().expect(201));
    expect((await get(path()).expect(200)).body).toMatchObject({
      patientCredit: '40.000',
      reservedAmount: '30.000',
      availableAmount: '10.000',
      refundedAmount: '0.000',
    });
    expect(await prisma.accountingEntry.count()).toBe(count);
    await review(id, maker).expect(403);
    await review(id, reader).expect(403);
    await propose('11.000').expect(400);
  });
  it('serializes competing requests and preserves request idempotency', async () => {
    const key = randomUUID();
    const first = idOf(await propose('30.000', key).expect(201));
    expect(idOf(await propose('30.000', key).expect(201))).toBe(first);
    await propose('20.000', key).expect(400);
    await post(`${path()}/${first}/cancel`, { reason }).expect(201);
    const responses = await Promise.all([propose(), propose()]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
  });
  it('requires approved cash custody and an independent assigned executor before payout', async () => {
    const id = await approved();
    await prepare(id, checker).expect(403);
    await prepare(id).expect(400);
    await execute(id).expect(403);
    await open('20.000');
    await prepare(id).expect(400);
  });
  it('blocks closing, overdrawn handover, cancellation and other executors during payout', async () => {
    const sid = await open();
    const id = await approved();
    await prepare(id).expect(201);
    await prepare(id).expect(201);
    await post(
      `${sessions}/${sid}/count`,
      { amount: '100.000', reason },
      cashier,
    ).expect(400);
    await post(
      `${sessions}/${sid}/handovers`,
      { amount: '71.000', reason, requestId: randomUUID() },
      cashier,
    ).expect(400);
    await post(`${path()}/${id}/cancel`, { reason }).expect(400);
    await execute(id, randomUUID(), maker).expect(403);
    expect((await get(sessions, cashier).expect(200)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sid,
          expected: '100.000',
          available: '70.000',
        }),
      ]),
    );
  });
  it('requires explicit independent confirmation that no payout occurred before releasing reservation', async () => {
    await open();
    const id = await approved();
    await prepare(id).expect(201);
    await post(
      `${path()}/${id}/release`,
      { reason, confirmedNotPaid: false },
      checker,
    ).expect(400);
    await post(
      `${path()}/${id}/release`,
      { reason, confirmedNotPaid: true },
      cashier,
    ).expect(403);
    await post(
      `${path()}/${id}/release`,
      { reason, confirmedNotPaid: true },
      checker,
    ).expect(201);
    expect((await get(path()).expect(200)).body).toMatchObject({
      availableAmount: '40.000',
      refundedAmount: '0.000',
    });
  });
  it('posts one balanced refund with immutable original receipt and updates net patient balances', async () => {
    const sid = await open();
    const id = await approved();
    await prepare(id).expect(201);
    const reference = randomUUID();
    await execute(id, reference).expect(201);
    await execute(id, reference).expect(201);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.paidAmount.toString()).toBe('100');
    expect(
      (
        await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
      ).amount.toString(),
    ).toBe('100');
    expect((await get(path()).expect(200)).body).toMatchObject({
      patientCredit: '10.000',
      reservedAmount: '0.000',
      refundedAmount: '30.000',
    });
    const entries = await prisma.accountingEntry.findMany({
      where: { postingKey: `refund:${hospitalId}:${id}` },
      include: { lines: true },
    });
    expect(entries).toHaveLength(1);
    expect(
      entries[0].lines.map((l) => [l.debit.toString(), l.credit.toString()]),
    ).toEqual([
      ['30', '0'],
      ['0', '30'],
    ]);
    expect((await get(sessions, cashier).expect(200)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sid,
          expected: '70.000',
          refunded: '30.000',
        }),
      ]),
    );
  });
  it('rolls back accounting on closed period and retains the payout reservation for investigation', async () => {
    await open();
    const id = await approved();
    await prepare(id).expect(201);
    await prisma.financialPeriod.update({
      where: { id: periodId },
      data: { isOpen: false },
    });
    await execute(id).expect(400);
    expect(
      (await prisma.invoiceRefund.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('DISBURSING');
    expect(
      await prisma.accountingEntry.count({
        where: { sourceModule: 'PATIENT_REFUND' },
      }),
    ).toBe(0);
  });
  it('rejects duplicate payout reference atomically', async () => {
    await open();
    const first = await approved('20.000');
    const second = await approved('20.000');
    const ref = randomUUID();
    await prepare(first).expect(201);
    await execute(first, ref).expect(201);
    await prepare(second).expect(201);
    await execute(second, ref).expect(409);
    expect(
      (await prisma.invoiceRefund.findUniqueOrThrow({ where: { id: second } }))
        .status,
    ).toBe('DISBURSING');
    expect(
      await prisma.accountingEntry.count({
        where: { sourceModule: 'PATIENT_REFUND' },
      }),
    ).toBe(1);
  });
  it('requires real proof, true confirmation and valid monetary precision', async () => {
    await propose('1.0001').expect(400);
    await open();
    const id = await approved();
    await prepare(id).expect(201);
    await post(
      `${path()}/${id}/execute`,
      {
        reference: randomUUID(),
        evidence: reason,
        requestId: randomUUID(),
        confirmedPaid: false,
      },
      cashier,
    ).expect(400);
    await post(
      `${path()}/${id}/execute`,
      {
        reference: 'a',
        evidence: 'b',
        requestId: randomUUID(),
        confirmedPaid: true,
      },
      cashier,
    ).expect(400);
  });
  it('uses approved opening less refunds and acknowledged handover as expected physical cash', async () => {
    const sid = await open();
    const id = await approved();
    await prepare(id).expect(201);
    await execute(id).expect(201);
    const hid = idOf(
      await post(
        `${sessions}/${sid}/handovers`,
        { amount: '50.000', reason, requestId: randomUUID() },
        cashier,
      ).expect(201),
    );
    await post(
      `${sessions}/${sid}/count`,
      { amount: '20.000', reason },
      cashier,
    ).expect(400);
    await post(
      `${sessions}/${sid}/handovers/${hid}/approve`,
      { reason, reference: randomUUID() },
      checker,
    ).expect(201);
    await post(
      `${sessions}/${sid}/count`,
      { amount: '20.000', reason },
      cashier,
    ).expect(201);
    await post(`${sessions}/${sid}/close`, { reason }, cashier).expect(403);
    await post(`${sessions}/${sid}/close`, { reason }, checker).expect(201);
    const close = await prisma.cashierShiftClosing.findUniqueOrThrow({
      where: { sessionId: sid },
    });
    expect(
      [
        close.openingCashTotal,
        close.refundedCashTotal,
        close.handedOverCashTotal,
        close.systemCashTotal,
        close.actualCashTotal,
        close.difference,
      ].map((v) => v.toString()),
    ).toEqual(['100', '30', '50', '20', '20', '0']);
    expect(close.accountingEntryId).toBeNull();
  });
  it('posts genuine cash shortage and freezes movements during count', async () => {
    const sid = await open();
    await post(
      `${sessions}/${sid}/count`,
      { amount: '99.000', reason },
      cashier,
    ).expect(201);
    await post(
      `${sessions}/${sid}/handovers`,
      { amount: '1.000', reason, requestId: randomUUID() },
      cashier,
    ).expect(400);
    await post(`${sessions}/${sid}/close`, { reason }, checker).expect(201);
    const close = await prisma.cashierShiftClosing.findUniqueOrThrow({
      where: { sessionId: sid },
    });
    expect(close.difference.toString()).toBe('-1');
    const entry = await prisma.accountingEntry.findUniqueOrThrow({
      where: { id: close.accountingEntryId! },
      include: { lines: true },
    });
    expect(
      entry.lines.map((l) => [l.debit.toString(), l.credit.toString()]),
    ).toEqual([
      ['0', '1'],
      ['1', '0'],
    ]);
  });
  it('enforces independent opening approval and one active session per cashier', async () => {
    const sid = idOf(
      await post(
        sessions,
        { amount: '100', reason, requestId: randomUUID() },
        cashier,
      ).expect(201),
    );
    await post(
      `${sessions}/${sid}/approve`,
      { reason, reference: randomUUID() },
      cashier,
    ).expect(403);
    await post(
      sessions,
      { amount: '100', reason, requestId: randomUUID() },
      cashier,
    ).expect(400);
    await post(
      `${sessions}/${sid}/approve`,
      { reason, reference: randomUUID() },
      checker,
    ).expect(201);
    expect(
      (await prisma.cashierSession.findUniqueOrThrow({ where: { id: sid } }))
        .cashierId,
    ).toBe(cashierId);
  });
  it('rejects cross-hospital reads and mutations without exposing patient details', async () => {
    const otherHospital = await prisma.hospital.create({
      data: { code: 'OTHER-REFUND', name: 'Synthetic other hospital' },
    });
    const other = await new AuthHelper(
      prisma,
      app.get(JwtService),
    ).createTestUser('other-refund', 'synthetic', {
      hospitalId: otherHospital.id,
      permissions: [
        'billing:view',
        'cashier:refunds:approve',
        'cashier:refunds:execute',
      ],
    });
    const id = await approved();
    await get(path(), other.accessToken).expect(404);
    await review(id, other.accessToken).expect(404);
    await prepare(id, other.accessToken).expect(404);
  });
  const anotherInvoice = async (
    amount: number,
    method: 'CASH' | 'CARD' | 'TRANSFER',
  ) => {
    const original = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const encounter = await prisma.encounter.create({
      data: { hospitalId, patientId: original.patientId, type: 'IPD' },
    });
    const service = await prisma.serviceItem.findFirstOrThrow({
      where: { hospitalId, code: 'REFUND-BED' },
    });
    const charge = await prisma.encounterCharge.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        serviceItemId: service.id,
        quantity: 1,
        unitPrice: amount,
        totalAmount: amount,
        sourceType: 'BED',
      },
    });
    const id = idOf(
      await post(`/billing/encounters/${encounter.id}/invoices`).expect(201),
    );
    await post(
      `/cashier/invoices/${id}/payments`,
      { amount, method },
      method === 'CASH' ? cashier : maker,
    ).expect(201);
    return { id, chargeId: charge.id };
  };
  it('includes new session cash receipts and requires a new session after closing', async () => {
    const sid = await open();
    const next = await anotherInvoice(20, 'CASH');
    expect(
      (await prisma.payment.findFirstOrThrow({ where: { invoiceId: next.id } }))
        .sessionId,
    ).toBe(sid);
    expect((await get(sessions, cashier).expect(200)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sid,
          received: '20.000',
          expected: '120.000',
        }),
      ]),
    );
    await post(
      `${sessions}/${sid}/count`,
      { amount: '120.000', reason },
      cashier,
    ).expect(201);
    await post(`${sessions}/${sid}/close`, { reason }, checker).expect(201);
    const refundId = await approved();
    await prepare(refundId).expect(400);
  });
  it.each(['CARD', 'TRANSFER'] as const)(
    'records confirmed %s refunds through the original bank account without a cash session',
    async (method) => {
      const next = await anotherInvoice(100, method);
      invoiceId = next.id;
      paymentId = (
        await prisma.payment.findFirstOrThrow({ where: { invoiceId } })
      ).id;
      adjustmentId = idOf(
        await post(`/billing/invoices/${invoiceId}/adjustments`, {
          chargeId: next.chargeId,
          correctedAmount: '60.000',
          reason,
          requestId: randomUUID(),
        }).expect(201),
      );
      await post(
        `/billing/invoices/${invoiceId}/adjustments/${adjustmentId}/approve`,
        { reason },
        checker,
      ).expect(201);
      const id = await approved();
      await prepare(id).expect(201);
      await execute(id).expect(201);
      const refund = await prisma.invoiceRefund.findUniqueOrThrow({
        where: { id },
      });
      expect(refund.sessionId).toBeNull();
      const bank = await prisma.systemAccountMapping.findFirstOrThrow({
        where: { hospitalId, key: 'BANK_MAIN' },
      });
      expect(
        await prisma.accountingEntryLine.count({
          where: {
            entryId: refund.postingEntryId!,
            accountId: bank.accountId,
            credit: 30,
          },
        }),
      ).toBe(1);
    },
  );
  it('calculates a later debit and collection from net paid after a full refund', async () => {
    await open();
    const id = await approved('40.000');
    await prepare(id).expect(201);
    await execute(id).expect(201);
    const original = await prisma.invoiceAdjustment.findUniqueOrThrow({
      where: { id: adjustmentId },
    });
    const debit = idOf(
      await post(`/billing/invoices/${invoiceId}/adjustments`, {
        chargeId: original.chargeId,
        correctedAmount: '80.000',
        reason,
        requestId: randomUUID(),
      }).expect(201),
    );
    await post(
      `/billing/invoices/${invoiceId}/adjustments/${debit}/approve`,
      { reason },
      checker,
    ).expect(201);
    expect((await get('/cashier/worklist').expect(200)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: invoiceId,
          remainingAmount: 20,
          netPaidAmount: 60,
          refundedAmount: 40,
        }),
      ]),
    );
    await post(
      `/cashier/invoices/${invoiceId}/payments`,
      { amount: 20, method: 'CASH' },
      cashier,
    ).expect(201);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.paidAmount.toString()).toBe('120');
    const statement = await get(
      `/cashier/patients/${invoice.patientId}/statement`,
    ).expect(200);
    expect(statement.body).toMatchObject({
      summary: {
        grossCollected: 120,
        totalRefunded: 40,
        totalPaid: 80,
        remaining: 0,
      },
      refunds: [expect.objectContaining({ id, invoiceId, paymentId })],
    });
  });
  it('prevents a new debit from consuming funds reserved for an in-progress payout', async () => {
    await open();
    const id = await approved();
    await prepare(id).expect(201);
    const original = await prisma.invoiceAdjustment.findUniqueOrThrow({
      where: { id: adjustmentId },
    });
    const debit = idOf(
      await post(`/billing/invoices/${invoiceId}/adjustments`, {
        chargeId: original.chargeId,
        correctedAmount: '80.000',
        reason,
        requestId: randomUUID(),
      }).expect(201),
    );
    await post(
      `/billing/invoices/${invoiceId}/adjustments/${debit}/approve`,
      { reason },
      checker,
    ).expect(400);
    expect(
      (
        await prisma.invoiceAdjustment.findUniqueOrThrow({
          where: { id: debit },
        })
      ).status,
    ).toBe('PENDING');
  });
  it('serializes simultaneous completion retries into one journal and one cash movement', async () => {
    const sid = await open();
    const id = await approved();
    await prepare(id).expect(201);
    const ref = randomUUID();
    const results = await Promise.all([execute(id, ref), execute(id, ref)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(
      await prisma.accountingEntry.count({
        where: { postingKey: `refund:${hospitalId}:${id}` },
      }),
    ).toBe(1);
    expect((await get(sessions, cashier).expect(200)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sid, expected: '70.000' }),
      ]),
    );
  });
  it('rejects a disabled cashiers existing JWT while allowing independent release of unpaid funds', async () => {
    const sid = await open();
    const id = await approved();
    await prepare(id).expect(201);
    await prisma.user.update({
      where: { id: cashierId },
      data: { isActive: false },
    });
    await get(sessions, cashier).expect(401);
    await execute(id).expect(401);
    expect(
      (await prisma.invoiceRefund.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('DISBURSING');
    await post(
      `${path()}/${id}/release`,
      { reason, confirmedNotPaid: true },
      checker,
    ).expect(201);
    expect((await get(sessions, checker).expect(200)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sid, available: '100.000' }),
      ]),
    );
  });
  it('allows an independent reviewer to close an already counted inactive cashiers custody', async () => {
    const sid = await open();
    await post(
      `${sessions}/${sid}/count`,
      { amount: '100.000', reason },
      cashier,
    ).expect(201);
    await prisma.user.update({
      where: { id: cashierId },
      data: { isActive: false },
    });
    await post(`${sessions}/${sid}/close`, { reason }, cashier).expect(401);
    await post(`${sessions}/${sid}/close`, { reason }, checker).expect(201);
    expect(
      (await prisma.cashierSession.findUniqueOrThrow({ where: { id: sid } }))
        .status,
    ).toBe('CLOSED');
  });
  it('rejects opening new custody for a disabled employee but allows rejecting their pending request', async () => {
    const sid = idOf(
      await post(
        sessions,
        { amount: '100.000', reason, requestId: randomUUID() },
        cashier,
      ).expect(201),
    );
    await prisma.user.update({
      where: { id: cashierId },
      data: { isActive: false },
    });
    await post(
      `${sessions}/${sid}/approve`,
      { reason, reference: randomUUID() },
      checker,
    ).expect(404);
    expect(
      (await prisma.cashierSession.findUniqueOrThrow({ where: { id: sid } }))
        .status,
    ).toBe('PENDING');
    await post(
      `${sessions}/${sid}/reject`,
      { reason, reference: randomUUID() },
      checker,
    ).expect(201);
  });
  it('rejects still-signed tokens when the hospital is disabled or the account is soft-deleted', async () => {
    await prisma.hospital.update({
      where: { id: hospitalId },
      data: { isActive: false },
    });
    await get(path()).expect(401);
    await prisma.hospital.update({
      where: { id: hospitalId },
      data: { isActive: true },
    });
    await prisma.user.update({
      where: { id: cashierId },
      data: { isDeleted: true },
    });
    await get(path(), cashier).expect(401);
  });
  it('recovers a reserved payout using a fresh service instance and retries a lost completion response safely', async () => {
    const sid = await open();
    const id = await approved();
    await prepare(id).expect(201);
    const dto = {
      reference: randomUUID(),
      evidence: reason,
      requestId: randomUUID(),
      confirmedPaid: true,
    };
    await new InvoiceRefundsService(prisma).execute(
      hospitalId,
      invoiceId,
      id,
      cashierId,
      dto,
    );
    const result = await new InvoiceRefundsService(prisma).execute(
      hospitalId,
      invoiceId,
      id,
      cashierId,
      dto,
    );
    expect(result.status).toBe('EXECUTED');
    expect(
      await prisma.accountingEntry.count({
        where: { postingKey: `refund:${hospitalId}:${id}` },
      }),
    ).toBe(1);
    expect((await get(sessions, cashier).expect(200)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sid, expected: '70.000' }),
      ]),
    );
  });
  it('rolls back journal, cash and refund together when mandatory audit persistence fails', async () => {
    const sid = await open();
    const id = await approved();
    await prepare(id).expect(201);
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION repair_test_refund_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'EXECUTE_INVOICE_REFUND' THEN RAISE EXCEPTION 'synthetic mandatory audit failure'; END IF; RETURN NEW; END $$`,
    );
    try {
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER repair_test_refund_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION repair_test_refund_audit_failure()`,
      );
      await execute(id).expect(500);
      expect(
        (await prisma.invoiceRefund.findUniqueOrThrow({ where: { id } }))
          .status,
      ).toBe('DISBURSING');
      expect(
        await prisma.accountingEntry.count({
          where: { postingKey: `refund:${hospitalId}:${id}` },
        }),
      ).toBe(0);
      expect((await get(sessions, cashier).expect(200)).body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: sid,
            expected: '100.000',
            available: '70.000',
          }),
        ]),
      );
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS repair_test_refund_audit_failure ON "AuditLog"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION repair_test_refund_audit_failure()',
      );
    }
    await execute(id).expect(201);
  });
  it('keeps a counted session open for investigation if variance posting accounts are unavailable', async () => {
    const sid = await open();
    await post(
      `${sessions}/${sid}/count`,
      { amount: '99.000', reason },
      cashier,
    ).expect(201);
    await prisma.systemAccountMapping.updateMany({
      where: { hospitalId, key: 'CASH_SHORT_OVER' },
      data: { isActive: false },
    });
    await post(`${sessions}/${sid}/close`, { reason }, checker).expect(400);
    expect(
      (await prisma.cashierSession.findUniqueOrThrow({ where: { id: sid } }))
        .status,
    ).toBe('CLOSING');
    expect(
      await prisma.cashierShiftClosing.count({ where: { sessionId: sid } }),
    ).toBe(0);
  });

  it('retains explicitly granted branch access and revokes the old token when the grant is removed', async () => {
    const branch = await prisma.hospital.create({
      data: { code: 'CASH-BRANCH', name: 'Synthetic authorized branch' },
    });
    await prisma.userHospitalAccess.create({
      data: { userId: cashierId, hospitalId: branch.id },
    });
    const switched = await app.get(JwtService).signAsync(
      {
        ...(await testStaffSessionClaims(prisma, cashierId, branch.id)),
        sub: cashierId,
        username: 'refund-cashier',
        hospitalId: branch.id,
        roles: [],
        permissions: ['cashier:view'],
      },
      { secret: process.env.JWT_SECRET, issuer: 'saraya-staff' },
    );
    await get('/cashier/worklist', switched).expect(200);
    await prisma.userHospitalAccess.delete({
      where: {
        userId_hospitalId: { userId: cashierId, hospitalId: branch.id },
      },
    });
    await get('/cashier/worklist', switched).expect(401);
    await get('/cashier/worklist', cashier).expect(200);
  });

  const disableOwner = () =>
    prisma.user.update({ where: { id: cashierId }, data: { isActive: false } });
  const custody = (
    sid: number,
    access = checker,
    amount = '100.000',
    reference = 'SYNTHETIC-CUSTODY-001',
  ) =>
    post(
      `${sessions}/${sid}/custody-count`,
      { amount, reason, reference, confirmedCustody: true },
      access,
    );
  it('records an inactive cashiers physical custody count and requires another supervisor to close', async () => {
    const sid = await open();
    await disableOwner();
    await custody(sid, checker, '99.000').expect(201);
    const counted = await prisma.cashierSession.findUniqueOrThrow({
      where: { id: sid },
    });
    expect(counted.countedById).not.toBe(cashierId);
    expect(counted.custodyReference).toBe('SYNTHETIC-CUSTODY-001');
    await post(`${sessions}/${sid}/close`, { reason }, checker).expect(403);
    if (!counted.countedById)
      throw new Error('Synthetic counter identity missing');
    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' },
    });
    await prisma.userRole.create({
      data: { userId: counted.countedById, roleId: adminRole.id },
    });
    const adminCounter = await app.get(JwtService).signAsync(
      {
        ...(await testStaffSessionClaims(
          prisma,
          counted.countedById,
          hospitalId,
        )),
        sub: counted.countedById,
        username: 'synthetic-admin-counter',
        hospitalId,
        roles: ['ADMIN'],
        permissions: [],
      },
      { secret: process.env.JWT_SECRET, issuer: 'saraya-staff' },
    );
    await post(`${sessions}/${sid}/close`, { reason }, adminCounter).expect(
      403,
    );
    await post(`${sessions}/${sid}/close`, { reason }, maker).expect(201);
    const closed = await prisma.cashierSession.findUniqueOrThrow({
      where: { id: sid },
    });
    expect(closed.closedById).not.toBe(closed.countedById);
    const closing = await prisma.cashierShiftClosing.findUniqueOrThrow({
      where: { sessionId: sid },
    });
    expect(closing.difference.toString()).toBe('-1');
  });
  it('allows a sessions-only supervisor to count but denies ordinary cashiers and viewers', async () => {
    const sid = await open();
    await disableOwner();
    await custody(sid, reader).expect(403);
    const supervisor = await new AuthHelper(
      prisma,
      app.get(JwtService),
    ).createTestUser('custody-supervisor-only', 'synthetic', {
      hospitalId,
      permissions: ['cashier:sessions:approve'],
    });
    await custody(sid, supervisor.accessToken).expect(201);
    await post(
      `${sessions}/${sid}/close`,
      { reason },
      supervisor.accessToken,
    ).expect(403);
    await post(`${sessions}/${sid}/close`, { reason }, checker).expect(201);
  });
  it('rejects exceptional counts for active owners and incomplete custody evidence', async () => {
    const sid = await open();
    await custody(sid).expect(400);
    await custody(sid, cashier).expect(403);
    await disableOwner();
    await post(
      `${sessions}/${sid}/custody-count`,
      {
        amount: '100.000',
        reason,
        reference: 'DOCUMENTED-001',
        confirmedCustody: false,
      },
      checker,
    ).expect(400);
    await custody(sid, checker, '1.0001').expect(400);
    await custody(sid, checker, '100.000', 'x').expect(400);
    expect(
      (await prisma.cashierSession.findUniqueOrThrow({ where: { id: sid } }))
        .status,
    ).toBe('OPEN');
  });
  it('requires resolution of outstanding payouts before an exceptional count', async () => {
    const sid = await open();
    const id = await approved();
    await prepare(id).expect(201);
    await disableOwner();
    await custody(sid).expect(400);
    await post(
      `${path()}/${id}/release`,
      { reason, confirmedNotPaid: true },
      checker,
    ).expect(201);
    await custody(sid).expect(201);
  });
  it('requires treasury handover resolution before an exceptional count', async () => {
    const sid = await open();
    const hid = idOf(
      await post(
        `${sessions}/${sid}/handovers`,
        { amount: '20.000', reason, requestId: randomUUID() },
        cashier,
      ).expect(201),
    );
    await disableOwner();
    await custody(sid).expect(400);
    await post(
      `${sessions}/${sid}/handovers/${hid}/reject`,
      { reason, reference: 'HANDOVER-REJECTED-001' },
      checker,
    ).expect(201);
    await custody(sid).expect(201);
  });
  it('serializes competing supervisor counts and preserves the first recorded custody identity', async () => {
    const sid = await open();
    await disableOwner();
    const results = await Promise.all([
      custody(sid, checker),
      custody(sid, maker),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const winner = results[0].status === 201 ? checker : maker;
    const loser = results[0].status === 201 ? maker : checker;
    await custody(sid, winner).expect(201);
    await custody(sid, winner, '99.000').expect(400);
    await post(`${sessions}/${sid}/close`, { reason }, loser).expect(201);
    expect(
      await prisma.cashierShiftClosing.count({ where: { sessionId: sid } }),
    ).toBe(1);
  });
  it('retains custody evidence in the audit when the counter withdraws a count for correction', async () => {
    const sid = await open();
    await disableOwner();
    await custody(sid).expect(201);
    const before = await prisma.cashierSession.findUniqueOrThrow({
      where: { id: sid },
    });
    await post(`${sessions}/${sid}/withdraw`, { reason }, checker).expect(201);
    expect(
      await prisma.cashierSession.findUniqueOrThrow({ where: { id: sid } }),
    ).toMatchObject({
      status: 'OPEN',
      countedById: null,
      custodyReference: null,
      countedAmount: null,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        hospitalId,
        action: 'WITHDRAW_CASH_SESSION_REQUEST',
        entity: 'CashierSession',
        entityId: sid,
      },
      orderBy: { id: 'desc' },
    });
    expect(audit.details).toMatchObject({
      payload: {
        previousCountedById: before.countedById,
        previousCustodyReference: 'SYNTHETIC-CUSTODY-001',
        previousCount: '100',
      },
    });
    await custody(sid, checker, '99.000', 'SYNTHETIC-CUSTODY-002').expect(201);
  });
  it('lets an independent reviewer reject a count for a documented recount without erasing the original audit', async () => {
    const sid = await open();
    await disableOwner();
    await custody(sid).expect(201);
    await post(`${sessions}/${sid}/reject-count`, { reason }, checker).expect(
      403,
    );
    await post(`${sessions}/${sid}/reject-count`, { reason }, maker).expect(
      201,
    );
    expect(
      (await prisma.cashierSession.findUniqueOrThrow({ where: { id: sid } }))
        .status,
    ).toBe('OPEN');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { hospitalId, action: 'REJECT_CASH_COUNT', entityId: sid },
    });
    expect(audit.details).toMatchObject({
      payload: { previousCustodyReference: 'SYNTHETIC-CUSTODY-001' },
    });
    await custody(sid, checker, '100.000', 'SYNTHETIC-CUSTODY-RECOUNT').expect(
      201,
    );
    await post(`${sessions}/${sid}/close`, { reason }, maker).expect(201);
  });
  it('enforces separation of count and closure in PostgreSQL as well as the API', async () => {
    const sid = await open();
    await disableOwner();
    await custody(sid).expect(201);
    const counted = await prisma.cashierSession.findUniqueOrThrow({
      where: { id: sid },
    });
    await expect(
      prisma.$executeRaw`UPDATE "CashierSession" SET status='CLOSED', "closedAt"=now(), "closedById"=${counted.countedById} WHERE id=${sid}`,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
    expect(
      (await prisma.cashierSession.findUniqueOrThrow({ where: { id: sid } }))
        .status,
    ).toBe('CLOSING');
  });
  it('supports soft-deleted owners and prevents a reactivated owner from changing a supervisors count', async () => {
    const sid = await open();
    await prisma.user.update({
      where: { id: cashierId },
      data: { isDeleted: true },
    });
    await custody(sid).expect(201);
    await prisma.$executeRaw`UPDATE "User" SET "isDeleted"=false WHERE id=${cashierId}`;
    await post(`${sessions}/${sid}/withdraw`, { reason }, cashier).expect(403);
    await post(
      `${sessions}/${sid}/count`,
      { amount: '100.000', reason },
      cashier,
    ).expect(400);
    await post(`${sessions}/${sid}/close`, { reason }, maker).expect(201);
  });
  it('preserves closed cash custody alongside an unpaid payout reservation in a new session', async () => {
    const sid = await open();
    const id = await approved();
    await prepare(id).expect(201);
    await execute(id).expect(201);
    const hid = idOf(
      await post(
        `${sessions}/${sid}/handovers`,
        { amount: '50.000', reason, requestId: randomUUID() },
        cashier,
      ).expect(201),
    );
    await post(
      `${sessions}/${sid}/handovers/${hid}/approve`,
      { reason, reference: randomUUID() },
      checker,
    ).expect(201);
    await post(
      `${sessions}/${sid}/count`,
      { amount: '20.000', reason },
      cashier,
    ).expect(201);
    await post(`${sessions}/${sid}/close`, { reason }, checker).expect(201);
    const next = await open('10.000');
    const pending = await approved('10.000');
    await prepare(pending).expect(201);
    expect((await get(sessions, cashier).expect(200)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sid,
          status: 'CLOSED',
          expected: '20.000',
        }),
        expect.objectContaining({
          id: next,
          status: 'OPEN',
          expected: '10.000',
          available: '0.000',
        }),
      ]),
    );
    expect(
      (await prisma.invoiceRefund.findUniqueOrThrow({ where: { id: pending } }))
        .status,
    ).toBe('DISBURSING');
    const inactiveOwner = await new AuthHelper(
      prisma,
      app.get(JwtService),
    ).createTestUser('custody-recovery-owner', 'synthetic', {
      hospitalId,
      permissions: ['cashier:manage'],
    });
    const exceptional = idOf(
      await post(
        sessions,
        { amount: '40.000', reason, requestId: randomUUID() },
        inactiveOwner.accessToken,
      ).expect(201),
    );
    await post(
      `${sessions}/${exceptional}/approve`,
      { reason, reference: 'SYNTHETIC-RECOVERY-FLOAT' },
      checker,
    ).expect(201);
    await prisma.user.update({
      where: { id: inactiveOwner.user.id },
      data: { isActive: false },
    });
    await post(
      `${sessions}/${exceptional}/custody-count`,
      {
        amount: '40.000',
        reason,
        reference: 'SYNTHETIC-RECOVERY-CUSTODY',
        confirmedCustody: true,
      },
      maker,
    ).expect(201);
    await post(`${sessions}/${exceptional}/close`, { reason }, checker).expect(
      201,
    );
    const recoveredCustody = await prisma.cashierSession.findUniqueOrThrow({
      where: { id: exceptional },
    });
    expect(recoveredCustody.closedById).not.toBe(recoveredCustody.countedById);
  });
});
