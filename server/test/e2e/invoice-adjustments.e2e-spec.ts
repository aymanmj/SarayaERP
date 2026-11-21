import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccountingService } from '../../src/accounting/accounting.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { seedFinancialAccounts } from '../financial-fixture';

describe('Approved invoice adjustments (PostgreSQL e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let reviewer: string;
  let reader: string;
  let hospitalId: number;
  let requesterId: number;
  let invoiceId: number;
  let chargeId: number;
  let encounterId: number;
  let admissionId: number;
  let periodId: number;
  let serviceId: number;
  let assignmentId: number;
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
    const maker = await auth.createTestUser('adjustment-maker', 'synthetic', {
      permissions: [
        'billing:manage',
        'billing:view',
        'cashier:manage',
        'cashier:view',
        'admission:view',
        'admission:manage',
        'billing:adjustments:request',
        'billing:adjustments:approve',
      ],
    });
    token = maker.accessToken;
    hospitalId = maker.user.hospitalId;
    requesterId = maker.user.id;
    const checker = await auth.createTestUser(
      'adjustment-checker',
      'synthetic',
      {
        hospitalId,
        permissions: ['billing:view', 'billing:adjustments:approve'],
      },
    );
    reviewer = checker.accessToken;
    reader = (
      await auth.createTestUser('adjustment-reader', 'synthetic', {
        hospitalId,
        permissions: ['billing:view'],
      })
    ).accessToken;
    await seedFinancialAccounts(prisma, hospitalId);
    const year = new Date().getUTCFullYear();
    const fy = await prisma.financialYear.create({
      data: {
        hospitalId,
        code: 'ADJUST-FY',
        name: String(year),
        startDate: new Date(year + '-01-01'),
        endDate: new Date(year + '-12-31'),
        status: 'OPEN',
      },
    });
    periodId = (
      await prisma.financialPeriod.create({
        data: {
          financialYearId: fy.id,
          periodCode: 'ADJUST-PERIOD',
          periodIndex: 1,
          monthStartDate: new Date(year + '-01-01'),
          monthEndDate: new Date(year + '-12-31'),
          numberOfDays: 365,
          isOpen: true,
        },
      })
    ).id;
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        mrn: 'ADJUST-PATIENT',
        fullName: 'Synthetic adjustment patient',
      },
    });
    encounterId = (
      await prisma.encounter.create({
        data: { hospitalId, patientId: patient.id, type: 'IPD' },
      })
    ).id;
    serviceId = (
      await prisma.serviceItem.create({
        data: {
          hospitalId,
          code: 'ADJUST-ROOM',
          name: 'Synthetic original room',
          type: 'BED',
          defaultPrice: 100,
        },
      })
    ).id;
    const ward = await prisma.ward.create({
      data: {
        hospitalId,
        name: 'Synthetic adjustment ward',
        serviceItemId: serviceId,
      },
    });
    const room = await prisma.room.create({
      data: { hospitalId, wardId: ward.id, roomNumber: 'ADJUST-ROOM' },
    });
    const bed = await prisma.bed.create({
      data: {
        hospitalId,
        roomId: room.id,
        wardId: ward.id,
        bedNumber: 'ADJUST-BED',
        status: 'OCCUPIED',
      },
    });
    const start = new Date(Date.now() - 36 * 3600000);
    assignmentId = (
      await prisma.bedAssignment.create({
        data: {
          hospitalId,
          encounterId,
          bedId: bed.id,
          from: start,
          roomRateSnapshot: {
            version: 1,
            serviceItemId: serviceId,
            dailyRate: '100.000',
            serviceName: 'Synthetic original room',
            priceListId: null,
            insurancePolicyId: null,
            capturedAt: start.toISOString(),
          },
        },
      })
    ).id;
    admissionId = (
      await prisma.admission.create({
        data: {
          hospitalId,
          encounterId,
          patientId: patient.id,
          admissionStatus: 'ADMITTED',
          admissionType: 'ELECTIVE',
          priority: 'MEDIUM',
          actualAdmissionDate: start,
          bedId: bed.id,
          roomId: room.id,
          wardId: ward.id,
          admittingDoctorId: requesterId,
          primaryPhysicianId: requesterId,
          admissionReason: 'Synthetic',
          createdBy: requesterId,
        },
      })
    ).id;
    await prisma.dischargePlanning.create({
      data: {
        hospitalId,
        admissionId,
        plannedDischargeDate: new Date(),
        dischargeDisposition: 'HOME',
        createdBy: requesterId,
      },
    });
    await prisma.dischargeSummary.create({
      data: {
        hospitalId,
        admissionId,
        encounterId,
        admissionDate: start,
        dischargeDate: new Date(),
        lengthOfStay: 1,
        admissionDiagnosis: 'Synthetic',
        dischargeDiagnosis: 'Synthetic',
        hospitalCourse: 'Synthetic',
        createdById: requesterId,
        completedAt: new Date(),
      },
    });
    const issued = await issue().expect(201);
    invoiceId = (issued.body as { id: number }).id;
    chargeId = (
      await prisma.encounterCharge.findFirstOrThrow({ where: { invoiceId } })
    ).id;
  });
  const issue = () => post('/billing/encounters/' + encounterId + '/invoices');
  const post = (path: string, data: object = {}, access = token) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + access)
      .send(data);
  const path = () => '/billing/invoices/' + invoiceId + '/adjustments';
  const propose = (amount = '60.000', key = randomUUID(), access = token) =>
    post(
      path(),
      {
        chargeId,
        correctedAmount: amount,
        reason: 'Synthetic documented correction',
        requestId: key,
      },
      access,
    );
  const idOf = (response: request.Response) =>
    (response.body as { id: number }).id;
  const approve = (
    id: number,
    access = reviewer,
    reason = 'Reviewed original supporting documents',
  ) => post(path() + '/' + id + '/approve', { reason }, access);
  const list = (access = token) =>
    request(app.getHttpServer())
      .get(path())
      .set('Authorization', 'Bearer ' + access);
  const pay = (amount: number) =>
    post('/cashier/invoices/' + invoiceId + '/payments', {
      amount,
      method: 'CASH',
    });
  const print = () =>
    request(app.getHttpServer())
      .get('/billing/invoices/' + invoiceId + '/print')
      .set('Authorization', 'Bearer ' + token);
  const readiness = () =>
    request(app.getHttpServer())
      .get('/admissions/' + admissionId + '/discharge-readiness')
      .set('Authorization', 'Bearer ' + token);

  it('persists a request and audit atomically without changing debt or creating a journal', async () => {
    const id = idOf(await propose().expect(201));
    expect((await list().expect(200)).body).toMatchObject({
      amountDue: '100.000',
      patientCredit: '0.000',
    });
    expect(await prisma.accountingEntry.count({ where: { hospitalId } })).toBe(
      1,
    );
    expect(
      await prisma.auditLog.count({
        where: {
          hospitalId,
          action: 'REQUEST_INVOICE_ADJUSTMENT',
          entityId: id,
          userId: requesterId,
        },
      }),
    ).toBe(1);
  });
  it('requires a separate reviewer and explicit permissions', async () => {
    const id = idOf(await propose().expect(201));
    await approve(id, token).expect(403);
    await approve(id, reader).expect(403);
    await propose('50', randomUUID(), reader).expect(403);
    expect(
      (await prisma.invoiceAdjustment.findUniqueOrThrow({ where: { id } }))
        .status,
    ).toBe('PENDING');
  });
  it('posts a balanced credit once and collects only the corrected liability while retaining the original', async () => {
    const original = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const id = idOf(await propose().expect(201));
    await approve(id).expect(201);
    expect((await list().expect(200)).body).toMatchObject({
      amountDue: '60.000',
      patientCredit: '0.000',
    });
    await pay(61).expect(400);
    await pay(60).expect(201);
    const saved = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(saved.totalAmount.toString()).toBe('100');
    expect(saved.patientShare.toString()).toBe('100');
    expect(saved.lineSnapshot).toEqual(original.lineSnapshot);
    const overview = await request(app.getHttpServer())
      .get('/billing/encounters/' + encounterId)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(overview.body).toMatchObject({
      totals: {
        originalTotalCharges: 100,
        adjustmentAmount: -40,
        totalCharges: 60,
        totalInvoiced: 60,
        totalPaid: 60,
        outstanding: 0,
      },
    });
    const entry = await prisma.accountingEntry.findUniqueOrThrow({
      where: { postingKey: 'adjustment:' + hospitalId + ':' + id },
      include: { lines: true },
    });
    expect(
      entry.lines.reduce(
        (sum, line) => sum + Number(line.debit) - Number(line.credit),
        0,
      ),
    ).toBe(0);
    expect(entry.lines.reduce((sum, line) => sum + Number(line.debit), 0)).toBe(
      40,
    );
    expect((await readiness().expect(200)).body).toMatchObject({
      financialClearance: true,
    });
  });
  it('records patient credit on a paid invoice without claiming cash was returned', async () => {
    await pay(100).expect(201);
    const id = idOf(await propose().expect(201));
    await approve(id).expect(201);
    expect((await list().expect(200)).body).toMatchObject({
      amountDue: '0.000',
      patientCredit: '40.000',
    });
    expect(await prisma.payment.count({ where: { invoiceId } })).toBe(1);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
      ).paidAmount.toString(),
    ).toBe('100');
    await pay(0).expect(400);
  });
  it('protects posted adjustment history and its ledger from deletion or unrelated reversal', async () => {
    const id = idOf(await propose().expect(201));
    await approve(id).expect(201);
    const item = await prisma.invoiceAdjustment.findUniqueOrThrow({
      where: { id },
    });
    await expect(
      prisma.accountingEntry.delete({ where: { id: item.postingEntryId! } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      app
        .get(AccountingService)
        .reverseEntry(
          hospitalId,
          item.postingEntryId!,
          requesterId,
          'Unrelated reversal',
        ),
    ).rejects.toThrow('محمي');
    expect(
      (await prisma.invoiceAdjustment.findUniqueOrThrow({ where: { id } }))
        .status,
    ).toBe('POSTED');
  });
  it('settles a fully credited unpaid invoice without creating a cash receipt', async () => {
    const id = idOf(await propose('0').expect(201));
    await approve(id).expect(201);
    const work = await request(app.getHttpServer())
      .get('/cashier/worklist')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(
      (work.body as { id: number; patientShare: number }[]).find(
        (item) => item.id === invoiceId,
      )?.patientShare,
    ).toBe(0);
    await pay(0).expect(201);
    expect(await prisma.payment.count({ where: { invoiceId } })).toBe(0);
    expect((await readiness().expect(200)).body).toMatchObject({
      financialClearance: true,
    });
  });
  it('posts a debit on a previously paid invoice and brings the extra amount into the cashier worklist', async () => {
    await pay(100).expect(201);
    const id = idOf(await propose('150').expect(201));
    await approve(id).expect(201);
    expect((await list().expect(200)).body).toMatchObject({
      amountDue: '50.000',
    });
    const work = await request(app.getHttpServer())
      .get('/cashier/worklist')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(
      (work.body as { id: number; patientShare: number }[]).find(
        (item) => item.id === invoiceId,
      )?.patientShare,
    ).toBe(150);
    await pay(50).expect(201);
    expect((await list().expect(200)).body).toMatchObject({
      amountDue: '0.000',
      patientCredit: '0.000',
    });
  });
  it('makes concurrent retries idempotent at request and approval boundaries', async () => {
    const key = randomUUID();
    const requests = await Promise.all([
      propose('60', key),
      propose('60', key),
    ]);
    expect(requests.map((item) => item.status)).toEqual([201, 201]);
    const id = idOf(requests[0]);
    expect(idOf(requests[1])).toBe(id);
    const approved = await Promise.all([approve(id), approve(id)]);
    expect(approved.map((item) => item.status)).toEqual([201, 201]);
    expect(
      await prisma.accountingEntry.count({
        where: { postingKey: 'adjustment:' + hospitalId + ':' + id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          hospitalId,
          action: 'INVOICE_ADJUSTMENT_POSTED',
          entityId: id,
        },
      }),
    ).toBe(1);
    await propose('50', key).expect(400);
  });
  it('rejects competing pending requests and permits a new request after rejection or cancellation', async () => {
    const responses = await Promise.all([propose('60'), propose('50')]);
    expect(responses.map((item) => item.status).sort()).toEqual([201, 400]);
    const id = idOf(responses.find((item) => item.status === 201)!);
    await post(
      path() + '/' + id + '/reject',
      { reason: 'Supporting evidence is insufficient' },
      reviewer,
    ).expect(201);
    const next = idOf(await propose('75').expect(201));
    await post(path() + '/' + next + '/cancel', {
      reason: 'Withdrawn to revise documentation',
    }).expect(201);
    await approve(next).expect(400);
    expect(await prisma.accountingEntry.count({ where: { hospitalId } })).toBe(
      1,
    );
  });
  it('keeps the request pending and the ledger unchanged when the period closes', async () => {
    const id = idOf(await propose().expect(201));
    await prisma.financialPeriod.update({
      where: { id: periodId },
      data: { isOpen: false },
    });
    await approve(id).expect(400);
    expect(
      (await prisma.invoiceAdjustment.findUniqueOrThrow({ where: { id } }))
        .status,
    ).toBe('PENDING');
    expect(await prisma.accountingEntry.count({ where: { hospitalId } })).toBe(
      1,
    );
    expect(
      await prisma.auditLog.count({
        where: { action: 'INVOICE_ADJUSTMENT_POSTED', entityId: id },
      }),
    ).toBe(0);
  });
  it('revalidates original revenue and receivable accounts before posting', async () => {
    const id = idOf(await propose().expect(201));
    const mapping = await prisma.systemAccountMapping.findUniqueOrThrow({
      where: { hospitalId_key: { hospitalId, key: 'REVENUE_INPATIENT' } },
    });
    await prisma.account.update({
      where: { id: mapping.accountId },
      data: { isActive: false },
    });
    await approve(id).expect(400);
    expect(
      (await prisma.invoiceAdjustment.findUniqueOrThrow({ where: { id } }))
        .postingEntryId,
    ).toBeNull();
  });
  it('blocks legacy invoices lacking a snapshot and insured or discounted corrections', async () => {
    const original = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const provider = await prisma.insuranceProvider.create({
      data: { hospitalId, code: 'INS-ADJUSTMENT', name: 'Synthetic insurer' },
    });
    const policy = await prisma.insurancePolicy.create({
      data: { insuranceProviderId: provider.id, name: 'Synthetic policy' },
    });
    await prisma.patient.update({
      where: { id: original.patientId },
      data: { insurancePolicyId: policy.id },
    });
    const insured = await prisma.invoice.create({
      data: {
        hospitalId,
        patientId: original.patientId,
        encounterId,
        status: 'ISSUED',
        totalAmount: '100.000',
        insuranceShare: '20.000',
        patientShare: '80.000',
        insuranceProviderId: provider.id,
      },
    });
    invoiceId = insured.id;
    const refused = await propose().expect(400);
    expect((refused.body as { message: string }).message).toContain('تأمين');
    invoiceId = original.id;
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { discountAmount: 1 },
    });
    await propose().expect(400);
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { discountAmount: 0, lineSnapshot: Prisma.DbNull },
    });
    await propose().expect(400);
    expect(await prisma.invoiceAdjustment.count()).toBe(0);
    expect(original.lineSnapshot).toBeTruthy();
  });
  it('rejects missing evidence, invalid amounts, unchanged values and stale original lines', async () => {
    for (const correctedAmount of ['-1', '1.0001', '100', 'NaN'])
      await propose(correctedAmount).expect(400);
    await post(path(), {
      chargeId,
      correctedAmount: '60',
      reason: '     ',
      requestId: randomUUID(),
    }).expect(400);
    const id = idOf(await propose().expect(201));
    await approve(id, reviewer, '     ').expect(400);
    await prisma.encounterCharge.update({
      where: { id: chargeId },
      data: { totalAmount: 90 },
    });
    await approve(id).expect(400);
  });
  it('denies cross-hospital list, request and approval', async () => {
    const id = idOf(await propose().expect(201));
    const hospital = await prisma.hospital.create({
      data: { code: 'FOREIGN-ADJUST', name: 'Synthetic foreign' },
    });
    const foreign = await new AuthHelper(
      prisma,
      app.get(JwtService),
    ).createTestUser('foreign-adjust', 'synthetic', {
      hospitalId: hospital.id,
      permissions: [
        'billing:view',
        'billing:adjustments:request',
        'billing:adjustments:approve',
      ],
    });
    await list(foreign.accessToken).expect(404);
    await propose('40', randomUUID(), foreign.accessToken).expect(404);
    await approve(id, foreign.accessToken).expect(404);
  });
  it('blocks cancellation of invoices with pending or posted adjustments', async () => {
    const id = idOf(await propose().expect(201));
    const cancel = () => post('/billing/invoices/' + invoiceId + '/cancel');
    await cancel().expect(400);
    await approve(id).expect(201);
    await cancel().expect(400);
  });
  it('retains printed original lines after cancellation and reissue at a changed tariff', async () => {
    const first = await print().expect(200);
    await post('/billing/invoices/' + invoiceId + '/cancel').expect(201);
    await prisma.serviceItem.update({
      where: { id: serviceId },
      data: { name: 'Renamed current room', defaultPrice: 900 },
    });
    await issue().expect(201);
    const second = await print().expect(200);
    expect((second.body as { charges: unknown[] }).charges).toEqual(
      (first.body as { charges: unknown[] }).charges,
    );
    expect(
      (second.body as { invoice: { totalAmount: string } }).invoice.totalAmount,
    ).toBe('100');
  });
  it('reconciles a late ward-history correction with a credit and a new ward component without duplicating the day', async () => {
    const original = await prisma.bedAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: { bed: true },
    });
    const movedAt = new Date(original.from.getTime() + 12 * 3600000);
    const secondService = await prisma.serviceItem.create({
      data: {
        hospitalId,
        code: 'CORRECTED-ROOM',
        name: 'Synthetic corrected ward',
        type: 'BED',
        defaultPrice: 200,
      },
    });
    const ward = await prisma.ward.create({
      data: {
        hospitalId,
        name: 'Corrected history ward',
        serviceItemId: secondService.id,
      },
    });
    const room = await prisma.room.create({
      data: { hospitalId, wardId: ward.id, roomNumber: 'HISTORY' },
    });
    const bed = await prisma.bed.create({
      data: {
        hospitalId,
        roomId: room.id,
        wardId: ward.id,
        bedNumber: 'HISTORY',
        status: 'OCCUPIED',
      },
    });
    await prisma.bedAssignment.update({
      where: { id: assignmentId },
      data: { to: movedAt },
    });
    await prisma.bed.update({
      where: { id: original.bedId },
      data: { status: 'CLEANING' },
    });
    await prisma.bedAssignment.create({
      data: {
        hospitalId,
        encounterId,
        bedId: bed.id,
        from: movedAt,
        roomRateSnapshot: {
          version: 1,
          serviceItemId: secondService.id,
          dailyRate: '200.000',
          insurancePolicyId: null,
          capturedAt: movedAt.toISOString(),
        },
      },
    });
    await prisma.admission.update({
      where: { id: admissionId },
      data: { bedId: bed.id, roomId: room.id, wardId: ward.id },
    });
    await issue().expect(400);
    const id = idOf(await propose('50').expect(201));
    await approve(id).expect(201);
    const newInvoice = idOf(await issue().expect(201));
    expect(newInvoice).not.toBe(invoiceId);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({ where: { id: newInvoice } })
      ).totalAmount.toString(),
    ).toBe('100');
    await pay(50).expect(201);
    await post('/cashier/invoices/' + newInvoice + '/payments', {
      amount: 100,
      method: 'CASH',
    }).expect(201);
    expect((await readiness().expect(200)).body).toMatchObject({
      financialClearance: true,
      pendingRoomDays: 0,
      roomBillingReviewReason: null,
    });
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      2,
    );
  });
});
