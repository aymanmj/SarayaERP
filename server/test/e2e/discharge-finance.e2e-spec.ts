import { AccountingService } from '../../src/accounting/accounting.service';
import { seedFinancialAccounts } from '../financial-fixture';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { SystemSettingsService } from '../../src/system-settings/system-settings.service';

describe('Discharge financial clearance (PostgreSQL e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let readToken: string;
  let hospitalId: number;
  let patientId: number;
  let encounterId: number;
  let admissionId: number;
  let bedId: number;
  let yearId: number;
  let periodId: number;
  let staffUserId: number;

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
    const staff = await auth.createTestUser(
      'discharge-manager',
      'test-password',
      {
        permissions: [
          'admission:view',
          'admission:manage',
          'billing:view',
          'billing:manage',
          'transfers:manage',
          'admin:view',
          'admin:manage',
          'system:manage',
          'cashier:manage',
        ],
      },
    );
    hospitalId = staff.user.hospitalId;
    staffUserId = staff.user.id;
    await seedFinancialAccounts(prisma, hospitalId);
    token = staff.accessToken;
    readToken = (
      await auth.createTestUser('discharge-reader', 'test-password', {
        hospitalId,
        permissions: ['admission:view', 'admin:view'],
      })
    ).accessToken;
    const year = new Date().getFullYear();
    const financialYear = await prisma.financialYear.create({
      data: {
        hospitalId,
        name: String(year),
        code: 'DISCHARGE-FY',
        startDate: new Date(year + '-01-01'),
        endDate: new Date(year + '-12-31'),
        status: 'OPEN',
        isCurrent: true,
      },
    });
    yearId = financialYear.id;
    const period = await prisma.financialPeriod.create({
      data: {
        financialYearId: yearId,
        periodCode: 'DISCHARGE-P',
        periodIndex: 1,
        monthStartDate: new Date(year + '-01-01'),
        monthEndDate: new Date(year + '-12-31'),
        numberOfDays: 365,
        isOpen: true,
      },
    });
    periodId = period.id;
    const service = await prisma.serviceItem.create({
      data: {
        hospitalId,
        code: 'ROOM-DAY',
        name: 'Synthetic Room Day',
        type: 'BED',
        defaultPrice: 100,
        isActive: true,
        isBillable: true,
      },
    });
    const ward = await prisma.ward.create({
      data: { hospitalId, name: 'Discharge Ward', serviceItemId: service.id },
    });
    const room = await prisma.room.create({
      data: { hospitalId, wardId: ward.id, roomNumber: 'DR1' },
    });
    const bed = await prisma.bed.create({
      data: {
        hospitalId,
        roomId: room.id,
        wardId: ward.id,
        bedNumber: 'DB1',
        status: 'OCCUPIED',
      },
    });
    bedId = bed.id;
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        mrn: 'DISCHARGE-MRN',
        fullName: 'Synthetic Discharge Patient',
      },
    });
    patientId = patient.id;
    const encounter = await prisma.encounter.create({
      data: { hospitalId, patientId, type: 'IPD' },
    });
    encounterId = encounter.id;
    const admission = await prisma.admission.create({
      data: {
        hospitalId,
        patientId,
        encounterId,
        admissionType: 'ELECTIVE',
        admissionStatus: 'ADMITTED',
        priority: 'MEDIUM',
        actualAdmissionDate: new Date(Date.now() - 36 * 3600000),
        bedId,
        roomId: room.id,
        wardId: ward.id,
        admittingDoctorId: staff.user.id,
        primaryPhysicianId: staff.user.id,
        admissionReason: 'Synthetic Test',
        createdBy: staff.user.id,
      },
    });
    admissionId = admission.id;
    await prisma.bedAssignment.create({
      data: { hospitalId, encounterId, bedId },
    });
    await prisma.dischargePlanning.create({
      data: {
        hospitalId,
        admissionId,
        plannedDischargeDate: new Date(),
        dischargeDisposition: 'HOME',
        createdBy: staff.user.id,
      },
    });
    await prisma.dischargeSummary.create({
      data: {
        hospitalId,
        admissionId,
        encounterId,
        admissionDate: admission.actualAdmissionDate,
        dischargeDate: new Date(),
        lengthOfStay: 1,
        admissionDiagnosis: 'Synthetic Admission',
        dischargeDiagnosis: 'Synthetic Discharge',
        hospitalCourse: 'Synthetic Course',
        createdById: staff.user.id,
        completedAt: new Date(),
      },
    });
  });
  const issue = () =>
    request(app.getHttpServer())
      .post('/billing/encounters/' + encounterId + '/invoices')
      .set('Authorization', 'Bearer ' + token);
  const discharge = (accessToken = token) =>
    request(app.getHttpServer())
      .post('/admissions/' + admissionId + '/discharge')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ dischargeDisposition: 'HOME' });
  const ready = () =>
    request(app.getHttpServer())
      .get('/admissions/' + admissionId + '/discharge-readiness')
      .set('Authorization', 'Bearer ' + token);
  // Settlement fixtures model stored balances; these tests do not simulate a real payment provider.
  const settle = async (amount = 100) => {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { encounterId },
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount: amount,
        status: amount === 100 ? 'PAID' : 'PARTIALLY_PAID',
      },
    });
    return invoice;
  };

  it('blocks financially settled discharge while a legacy transfer is pending and permits it after cancellation', async () => {
    const source = await prisma.bed.findUniqueOrThrow({ where: { id: bedId } });
    const destination = await prisma.bed.create({
      data: {
        hospitalId,
        wardId: source.wardId,
        roomId: source.roomId,
        bedNumber: 'LEGACY-DESTINATION',
      },
    });
    const transfer = await request(app.getHttpServer())
      .post(`/admissions/${admissionId}/bed-transfer/request`)
      .set('Authorization', 'Bearer ' + token)
      .send({
        toBedId: destination.id,
        transferReason: 'Synthetic pending transfer',
      })
      .expect(201);
    const transferId = (transfer.body as { id: number }).id;
    await issue().expect(201);
    await settle();
    const blocked = await ready().expect(200);
    expect(blocked.body).toMatchObject({
      financialClearance: true,
      ready: false,
      pendingBedTransfersCount: 1,
    });
    await discharge().expect(400);
    expect(
      (await prisma.bed.findUniqueOrThrow({ where: { id: bedId } })).status,
    ).toBe('OCCUPIED');
    await request(app.getHttpServer())
      .post(`/admissions/bed-transfer/${transferId}/cancel`)
      .set('Authorization', 'Bearer ' + token)
      .expect(201);
    const cleared = await ready().expect(200);
    expect(cleared.body).toMatchObject({
      ready: true,
      pendingTransfersCount: 0,
    });
    await discharge().expect(201);
    expect(
      (await prisma.bed.findUniqueOrThrow({ where: { id: destination.id } }))
        .status,
    ).toBe('AVAILABLE');
  });

  const pay = (
    id: number,
    amount: number,
    requestId?: string,
    method = 'CASH',
    accessToken = token,
  ) =>
    request(app.getHttpServer())
      .post('/cashier/invoices/' + id + '/payments')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ amount, method, requestId });
  const invoiceIdOf = (response: request.Response) =>
    (response.body as { id: number }).id;
  const cancelInvoice = (id: number) =>
    request(app.getHttpServer())
      .post('/billing/invoices/' + id + '/cancel')
      .set('Authorization', 'Bearer ' + token);

  it('rolls back invoice and generated room charges when the ledger cannot be posted', async () => {
    await prisma.systemAccountMapping.updateMany({
      where: { hospitalId, key: 'REVENUE_INPATIENT' },
      data: { isActive: false },
    });
    await issue().expect(400);
    expect(await prisma.invoice.count({ where: { encounterId } })).toBe(0);
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      0,
    );
    expect(await prisma.accountingEntry.count({ where: { hospitalId } })).toBe(
      0,
    );
  });

  it('saves invoice and payment in distinct immutable balanced ledger entries', async () => {
    const id = invoiceIdOf(await issue().expect(201));
    const original = await prisma.accountingEntry.findUniqueOrThrow({
      where: { postingKey: 'invoice:' + hospitalId + ':' + id },
      include: { lines: true },
    });
    // Force equal source IDs in different tables: the historical collision must never overwrite invoice lines.
    const payment = await prisma.payment.create({
      data: {
        id,
        hospitalId,
        invoiceId: id,
        amount: 30,
        method: 'CASH',
        cashierId: staffUserId,
      },
    });
    await prisma.invoice.update({
      where: { id },
      data: { paidAmount: 30, status: 'PARTIALLY_PAID' },
    });
    const accounting = app.get(AccountingService);
    await accounting.recordPaymentEntry({
      hospitalId,
      paymentId: payment.id,
      userId: staffUserId,
    });
    await accounting.recordPaymentEntry({
      hospitalId,
      paymentId: payment.id,
      userId: staffUserId,
    });
    await accounting.recordInvoiceEntry({
      hospitalId,
      invoiceId: id,
      userId: staffUserId,
    });
    expect(
      await prisma.accountingEntry.count({
        where: { hospitalId, sourceId: id },
      }),
    ).toBe(2);
    const current = await prisma.accountingEntry.findUniqueOrThrow({
      where: { id: original.id },
      include: { lines: true },
    });
    expect(current.lines).toEqual(original.lines);
    const collected = await prisma.accountingEntry.findUniqueOrThrow({
      where: { postingKey: 'payment:' + hospitalId + ':' + id },
      include: { lines: true },
    });
    expect(collected.sourceModule).toBe('CASHIER');
    expect(
      collected.lines.reduce(
        (sum, line) => sum + Number(line.debit) - Number(line.credit),
        0,
      ),
    ).toBe(0);
    expect(
      collected.lines.reduce((sum, line) => sum + Number(line.debit), 0),
    ).toBe(30);
  });

  it('serializes competing payments without overcollection or losing a recorded amount', async () => {
    const id = invoiceIdOf(await issue().expect(201));
    const responses = await Promise.all([pay(id, 60), pay(id, 60)]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({ where: { id } })
      ).paidAmount.toString(),
    ).toBe('60');
    expect(await prisma.payment.count({ where: { invoiceId: id } })).toBe(1);
    expect(
      await prisma.accountingEntry.count({
        where: { hospitalId, sourceModule: 'CASHIER' },
      }),
    ).toBe(1);
  });

  it('rolls back the payment and paid balance when cash accounting is not configured', async () => {
    const id = invoiceIdOf(await issue().expect(201));
    await prisma.systemAccountMapping.updateMany({
      where: { hospitalId, key: 'CASH_MAIN' },
      data: { isActive: false },
    });
    await pay(id, 25).expect(400);
    expect(await prisma.payment.count({ where: { invoiceId: id } })).toBe(0);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({ where: { id } })
      ).paidAmount.toString(),
    ).toBe('0');
    expect(await prisma.accountingEntry.count({ where: { hospitalId } })).toBe(
      1,
    );
  });

  it('rolls back payment when the accounting period has closed after invoice issuance', async () => {
    const id = invoiceIdOf(await issue().expect(201));
    await prisma.financialPeriod.update({
      where: { id: periodId },
      data: { isOpen: false },
    });
    await pay(id, 25).expect(400);
    expect(await prisma.payment.count({ where: { invoiceId: id } })).toBe(0);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({ where: { id } })
      ).paidAmount.toString(),
    ).toBe('0');
  });

  it('retries the same payment request safely and rejects reuse with different amounts', async () => {
    const id = invoiceIdOf(await issue().expect(201));
    const key = '123e4567-e89b-42d3-a456-426614174000';
    const responses = await Promise.all([pay(id, 25, key), pay(id, 25, key)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect((responses[0].body as { paymentId: number }).paymentId).toBe(
      (responses[1].body as { paymentId: number }).paymentId,
    );
    await pay(id, 30, key).expect(400);
    expect(await prisma.payment.count({ where: { invoiceId: id } })).toBe(1);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({ where: { id } })
      ).paidAmount.toString(),
    ).toBe('25');
  });

  it('rejects zero settlement with debt, invalid precision and unsupported payment methods', async () => {
    const id = invoiceIdOf(await issue().expect(201));
    for (const amount of [0, -1, 0.0001, 100.001])
      await pay(id, amount).expect(400);
    await pay(id, 1, undefined, 'INSURANCE').expect(400);
    await pay(id, 1, undefined, 'OTHER').expect(400);
    await pay(id, 1, undefined, 'CASH', readToken).expect(403);
    expect(await prisma.payment.count({ where: { invoiceId: id } })).toBe(0);
  });

  it('confirms fully insured patient liability without a fictitious cash payment', async () => {
    const provider = await prisma.insuranceProvider.create({
      data: {
        hospitalId,
        code: 'ZERO-PATIENT-SHARE',
        name: 'Synthetic full coverage',
      },
    });
    const policy = await prisma.insurancePolicy.create({
      data: {
        insuranceProviderId: provider.id,
        name: 'Synthetic full policy',
        patientCopayRate: 0,
      },
    });
    await prisma.patient.update({
      where: { id: patientId },
      data: { insurancePolicyId: policy.id },
    });
    const id = invoiceIdOf(await issue().expect(201));
    const result = await pay(id, 0).expect(201);
    expect(result.body).toMatchObject({
      status: 'PARTIALLY_PAID',
      paymentId: null,
      paidAmount: 0,
    });
    expect(await prisma.payment.count({ where: { invoiceId: id } })).toBe(0);
    expect(
      await prisma.accountingEntry.count({
        where: { hospitalId, sourceModule: 'CASHIER' },
      }),
    ).toBe(0);
  });

  it('serializes cancellation and collection so a cancelled invoice can never receive money', async () => {
    const id = invoiceIdOf(await issue().expect(201));
    const responses = await Promise.all([cancelInvoice(id), pay(id, 25)]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    if (invoice.status === 'CANCELLED') {
      expect(await prisma.payment.count({ where: { invoiceId: id } })).toBe(0);
      expect(
        await prisma.accountingEntry.count({
          where: { hospitalId, sourceModule: 'JOURNAL_REVERSAL' },
        }),
      ).toBe(1);
      await pay(id, 25).expect(400);
    } else {
      expect(invoice.paidAmount.toString()).toBe('25');
      await cancelInvoice(id).expect(400);
    }
  });

  it('blocks legacy ambiguous accounting and fake credit-note payouts without changing financial records', async () => {
    const id = invoiceIdOf(await issue().expect(201));
    await prisma.accountingEntry.updateMany({
      where: { hospitalId, sourceModule: 'BILLING', sourceId: id },
      data: { postingKey: null },
    });
    await pay(id, 25).expect(400);
    await cancelInvoice(id).expect(400);
    await request(app.getHttpServer())
      .post('/billing/invoices/' + id + '/return')
      .set('Authorization', 'Bearer ' + token)
      .send({ reason: 'Synthetic correction' })
      .expect(400);
    expect(
      await prisma.invoice.count({
        where: { encounterId, type: 'CREDIT_NOTE' },
      }),
    ).toBe(0);
    expect(await prisma.payment.count({ where: { invoiceId: id } })).toBe(0);
    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('ISSUED');
  });

  const addHistoricalWard = async () => {
    const service = await prisma.serviceItem.create({
      data: {
        hospitalId,
        code: 'PREVIOUS-ROOM',
        name: 'Previous Room',
        type: 'BED',
        defaultPrice: 70,
        isActive: true,
        isBillable: true,
      },
    });
    const ward = await prisma.ward.create({
      data: { hospitalId, name: 'Previous Ward', serviceItemId: service.id },
    });
    const room = await prisma.room.create({
      data: { hospitalId, wardId: ward.id, roomNumber: 'PREVIOUS' },
    });
    const bed = await prisma.bed.create({
      data: {
        hospitalId,
        wardId: ward.id,
        roomId: room.id,
        bedNumber: 'PREVIOUS',
        status: 'CLEANING',
      },
    });
    await prisma.bedAssignment.create({
      data: {
        hospitalId,
        encounterId,
        bedId: bed.id,
        from: new Date(Date.now() - 36 * 3600000),
        to: new Date(),
      },
    });
    return service.id;
  };

  const updateRoomSetting = (key: string, value: string, accessToken = token) =>
    request(app.getHttpServer())
      .patch('/system-settings/' + key)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ value });

  it('provides the default room settings without seed data and validates all changes', async () => {
    const response = await request(app.getHttpServer())
      .get('/system-settings')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'billing.roomDayPolicy',
          value: 'COMPLETED_24H',
        }),
        expect.objectContaining({
          key: 'billing.roomTimeZone',
          value: 'Africa/Tripoli',
        }),
      ]),
    );
    await updateRoomSetting('billing.roomDayPolicy', 'INVALID').expect(400);
    await updateRoomSetting('billing.roomTimeZone', 'Mars/Medical').expect(400);
    await updateRoomSetting(
      'billing.roomDayPolicy',
      'STARTED_24H',
      readToken,
    ).expect(403);
    expect(
      await prisma.systemSetting.count({
        where: { hospitalId, key: 'billing.roomDayPolicy' },
      }),
    ).toBe(0);
  });

  it('audits policy changes with their actor and old/new values in the same transaction', async () => {
    await updateRoomSetting('billing.roomDayPolicy', 'STARTED_24H').expect(200);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { hospitalId, action: 'UPDATE_ROOM_BILLING_CONFIGURATION' },
    });
    expect(log.userId).toBe(staffUserId);
    expect(log.hash).not.toBeNull();
    expect(log.oldValues).toEqual({
      key: 'billing.roomDayPolicy',
      value: 'COMPLETED_24H',
    });
    expect(log.newValues).toEqual({
      key: 'billing.roomDayPolicy',
      value: 'STARTED_24H',
    });
    const service = app.get(SystemSettingsService);
    await expect(
      service.update(
        hospitalId,
        'billing.roomDayPolicy',
        { value: 'CALENDAR_NIGHTS' },
        2147483647,
      ),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(
      (
        await prisma.systemSetting.findUniqueOrThrow({
          where: {
            hospitalId_key: { hospitalId, key: 'billing.roomDayPolicy' },
          },
        })
      ).value,
    ).toBe('STARTED_24H');
    expect(
      await prisma.auditLog.count({
        where: { hospitalId, action: 'UPDATE_ROOM_BILLING_CONFIGURATION' },
      }),
    ).toBe(1);
  });

  it('does not recalculate an existing admission under a new hospital default', async () => {
    await updateRoomSetting('billing.roomDayPolicy', 'STARTED_24H').expect(200);
    const response = await issue().expect(201);
    expect((response.body as { totalAmount: string }).totalAmount).toBe('100');
    expect((await ready().expect(200)).body).toMatchObject({
      roomBillingPolicy: 'COMPLETED_24H',
      roomBillingTimeZone: 'Africa/Tripoli',
    });
  });

  it('serializes concurrent configuration changes while clinical reads also audit', async () => {
    const responses = await Promise.all([
      updateRoomSetting('billing.roomDayPolicy', 'STARTED_24H'),
      updateRoomSetting('billing.roomDayPolicy', 'CALENDAR_NIGHTS'),
      ready(),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200,
    ]);
    const logs = await prisma.auditLog.findMany({
      where: { hospitalId, action: 'UPDATE_ROOM_BILLING_CONFIGURATION' },
      orderBy: { id: 'asc' },
    });
    expect(logs).toHaveLength(2);
    expect(logs[0].oldValues).toEqual({
      key: 'billing.roomDayPolicy',
      value: 'COMPLETED_24H',
    });
    expect(logs[1].oldValues).toEqual(logs[0].newValues);
    const setting = await prisma.systemSetting.findUniqueOrThrow({
      where: { hospitalId_key: { hospitalId, key: 'billing.roomDayPolicy' } },
    });
    expect(logs[1].newValues).toEqual({
      key: setting.key,
      value: setting.value,
    });
  });

  it.each(['COMPLETED_24H', 'STARTED_24H', 'CALENDAR_NIGHTS'])(
    'snapshots %s for new admissions and preserves it after a default change',
    async (policy) => {
      await updateRoomSetting('billing.roomDayPolicy', policy).expect(200);
      await updateRoomSetting('billing.roomTimeZone', 'UTC').expect(200);
      const department = await prisma.department.create({
        data: { hospitalId, name: 'Room Policy Department' },
      });
      const patient = await prisma.patient.create({
        data: {
          hospitalId,
          mrn: 'NEW-POLICY-MRN',
          fullName: 'New Policy Synthetic Patient',
        },
      });
      const encounter = await prisma.encounter.create({
        data: { hospitalId, patientId: patient.id, type: 'IPD' },
      });
      const oldBed = await prisma.bed.findUniqueOrThrow({
        where: { id: bedId },
      });
      const newBed = await prisma.bed.create({
        data: {
          hospitalId,
          roomId: oldBed.roomId,
          wardId: oldBed.wardId,
          bedNumber: 'NEW-POLICY-BED',
        },
      });
      const response = await request(app.getHttpServer())
        .post('/admissions')
        .set('Authorization', 'Bearer ' + token)
        .send({
          patientId: patient.id,
          encounterId: encounter.id,
          bedId: newBed.id,
          roomId: oldBed.roomId,
          wardId: oldBed.wardId,
          departmentId: department.id,
          admittingDoctorId: staffUserId,
          primaryPhysicianId: staffUserId,
          admissionType: 'ELECTIVE',
          priority: 'MEDIUM',
          admissionReason: 'Synthetic policy snapshot',
        })
        .expect(201);
      const created = response.body as {
        id: number;
        roomBillingPolicy: string;
        roomBillingTimeZone: string;
      };
      expect(created).toMatchObject({
        roomBillingPolicy: policy,
        roomBillingTimeZone: 'UTC',
      });
      await updateRoomSetting(
        'billing.roomDayPolicy',
        policy === 'COMPLETED_24H' ? 'STARTED_24H' : 'COMPLETED_24H',
      ).expect(200);
      await updateRoomSetting('billing.roomTimeZone', 'Africa/Tripoli').expect(
        200,
      );
      const now = new Date();
      const billingStart =
        policy === 'CALENDAR_NIGHTS'
          ? new Date(
              Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() - 2,
                23,
                30,
              ),
            )
          : new Date(now.getTime() - 36 * 3600000);
      await prisma.admission.update({
        where: { id: created.id },
        data: { actualAdmissionDate: billingStart },
      });
      await prisma.bedAssignment.updateMany({
        where: { hospitalId, encounterId: encounter.id },
        data: { from: billingStart },
      });
      const billed = await request(app.getHttpServer())
        .post('/billing/encounters/' + encounter.id + '/invoices')
        .set('Authorization', 'Bearer ' + token)
        .expect(201);
      const expectedDays =
        policy === 'STARTED_24H' ? 2 : policy === 'COMPLETED_24H' ? 1 : 2;
      const saved = await prisma.admission.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(saved).toMatchObject({
        roomBillingPolicy: policy,
        roomBillingTimeZone: 'UTC',
      });
      if (expectedDays)
        expect((billed.body as { totalAmount: string }).totalAmount).toBe(
          String(expectedDays * 100),
        );
      const originalInvoice = await prisma.invoice.findUniqueOrThrow({
        where: { id: (billed.body as { id: number }).id },
      });
      await updateRoomSetting('billing.roomDayPolicy', 'COMPLETED_24H').expect(
        200,
      );
      expect(
        (
          await prisma.invoice.findUniqueOrThrow({
            where: { id: originalInvoice.id },
          })
        ).totalAmount.toString(),
      ).toBe(originalInvoice.totalAmount.toString());
    },
  );

  const installPricedHistory = async (
    hours = 36,
    split = 12,
    secondPrice = '200.000',
  ) => {
    const start = new Date(Date.now() - hours * 3600000);
    const moved = new Date(start.getTime() + split * 3600000);
    const source = await prisma.bed.findUniqueOrThrow({
      where: { id: bedId },
      include: { ward: { include: { serviceItem: true } } },
    });
    const firstServiceId = source.ward.serviceItemId!;
    const secondService = await prisma.serviceItem.create({
      data: {
        hospitalId,
        code: 'SECOND-ROOM-TARIFF',
        name: 'Synthetic second room',
        type: 'BED',
        defaultPrice: secondPrice,
      },
    });
    const ward = await prisma.ward.create({
      data: {
        hospitalId,
        name: 'Synthetic second tariff ward',
        serviceItemId: secondService.id,
      },
    });
    const room = await prisma.room.create({
      data: { hospitalId, wardId: ward.id, roomNumber: 'SECOND-RATE' },
    });
    const target = await prisma.bed.create({
      data: {
        hospitalId,
        roomId: room.id,
        wardId: ward.id,
        bedNumber: 'SECOND-RATE',
        status: 'OCCUPIED',
      },
    });
    const snapshot = (
      serviceItemId: number,
      dailyRate: string,
      capturedAt: Date,
    ) => ({
      version: 1,
      serviceItemId,
      serviceName: 'Synthetic room',
      dailyRate,
      priceListId: null,
      insurancePolicyId: null,
      capturedAt: capturedAt.toISOString(),
    });
    await prisma.bedAssignment.updateMany({
      where: { hospitalId, encounterId },
      data: {
        from: start,
        to: moved,
        roomRateSnapshot: snapshot(firstServiceId, '100.000', start),
      },
    });
    const first = await prisma.bedAssignment.findFirstOrThrow({
      where: { encounterId, bedId },
    });
    await prisma.bed.update({
      where: { id: bedId },
      data: { status: 'CLEANING' },
    });
    const second = await prisma.bedAssignment.create({
      data: {
        hospitalId,
        encounterId,
        bedId: target.id,
        from: moved,
        roomRateSnapshot: snapshot(secondService.id, secondPrice, moved),
      },
    });
    await prisma.admission.update({
      where: { id: admissionId },
      data: {
        actualAdmissionDate: start,
        bedId: target.id,
        roomId: room.id,
        wardId: ward.id,
      },
    });
    return {
      first,
      second,
      firstServiceId,
      secondServiceId: secondService.id,
      target,
      start,
      moved,
    };
  };

  it('prorates a single completed day across ward tariffs and preserves the captured rates', async () => {
    const history = await installPricedHistory();
    await prisma.serviceItem.update({
      where: { id: history.firstServiceId },
      data: { defaultPrice: 900 },
    });
    await prisma.serviceItem.update({
      where: { id: history.secondServiceId },
      data: { defaultPrice: 800 },
    });
    const preview = await ready().expect(200);
    expect(preview.body).toMatchObject({
      pendingRoomDays: 1,
      roomBillingReviewReason: null,
    });
    const response = await issue().expect(201);
    expect((response.body as { totalAmount: string }).totalAmount).toBe('150');
    const charges = await prisma.encounterCharge.findMany({
      where: { encounterId },
      orderBy: { id: 'asc' },
    });
    expect(charges.map((charge) => charge.totalAmount.toString())).toEqual([
      '50',
      '100',
    ]);
    expect(
      charges.every(
        (charge) =>
          charge.quantity === 1 &&
          charge.roomBillingKey &&
          charge.roomAllocation,
      ),
    ).toBe(true);
    await issue().expect(400);
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      2,
    );
    expect((await ready().expect(200)).body).toMatchObject({
      pendingRoomDays: 0,
      roomBillingReviewReason: null,
    });
  });

  it('creates only one invoice and one set of allocations under simultaneous requests', async () => {
    await installPricedHistory();
    const responses = await Promise.all([issue(), issue()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    expect(await prisma.invoice.count({ where: { encounterId } })).toBe(1);
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      2,
    );
  });

  it('rebills a cancelled invoice using its original room allocations without duplicate days or repricing', async () => {
    const history = await installPricedHistory();
    const first = await issue().expect(201);
    const firstId = (first.body as { id: number }).id;
    const original = await prisma.encounterCharge.findMany({
      where: { encounterId },
      orderBy: { id: 'asc' },
    });
    await prisma.invoice.update({
      where: { id: firstId },
      data: { status: 'CANCELLED' },
    });
    await prisma.serviceItem.update({
      where: { id: history.secondServiceId },
      data: { defaultPrice: 999 },
    });
    const replacement = await issue().expect(201);
    expect((replacement.body as { totalAmount: string }).totalAmount).toBe(
      '150',
    );
    const rebilled = await prisma.encounterCharge.findMany({
      where: { encounterId },
      orderBy: { id: 'asc' },
    });
    expect(rebilled.map((charge) => charge.id)).toEqual(
      original.map((charge) => charge.id),
    );
    expect(rebilled.map((charge) => charge.totalAmount.toString())).toEqual(
      original.map((charge) => charge.totalAmount.toString()),
    );
  });

  it('allocates multiple completed days and a started partial day without multiplying ward minimums', async () => {
    await installPricedHistory(60);
    const response = await issue().expect(201);
    expect((response.body as { totalAmount: string }).totalAmount).toBe('350');
    await prisma.admission.update({
      where: { id: admissionId },
      data: { roomBillingPolicy: 'STARTED_24H' },
    });
    const next = await issue().expect(201);
    expect((next.body as { totalAmount: string }).totalAmount).toBe('200');
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      4,
    );
  });

  it('contains an already billed partial day requiring a correction and preserves the old invoice', async () => {
    const history = await installPricedHistory(18, 6);
    const invoice = await prisma.invoice.create({
      data: {
        hospitalId,
        patientId,
        encounterId,
        status: 'ISSUED',
        totalAmount: 100,
        patientShare: 100,
        insuranceShare: 0,
        paidAmount: 0,
        currency: 'LYD',
        financialYearId: yearId,
        financialPeriodId: periodId,
        createdAt: new Date(history.start.getTime() + 3 * 3600000),
      },
    });
    await prisma.encounterCharge.create({
      data: {
        hospitalId,
        encounterId,
        sourceType: 'BED',
        sourceId: admissionId,
        serviceItemId: history.firstServiceId,
        quantity: 1,
        unitPrice: 100,
        totalAmount: 100,
        invoiceId: invoice.id,
        roomBillingKey:
          'room:v1:' +
          hospitalId +
          ':' +
          encounterId +
          ':0:' +
          history.first.id,
        roomAllocation: {
          version: 1,
          periodIndex: 0,
          assignmentId: history.first.id,
        },
      },
    });
    const preview = await ready().expect(200);
    expect(preview.body).toMatchObject({
      ready: false,
      financialClearance: false,
    });
    expect(
      (preview.body as { roomBillingReviewReason: string })
        .roomBillingReviewReason,
    ).toContain('تسوية معتمدة');
    await issue().expect(400);
    await discharge().expect(400);
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
      ).totalAmount.toString(),
    ).toBe('100');
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      1,
    );
  });

  it('returns an actionable review reason for unknown historical rates or overlapping occupancy', async () => {
    const history = await installPricedHistory();
    await prisma.bedAssignment.update({
      where: { id: history.first.id },
      data: { roomRateSnapshot: Prisma.DbNull },
    });
    const unknown = await ready().expect(200);
    expect(
      (unknown.body as { roomBillingReviewReason: string })
        .roomBillingReviewReason,
    ).toContain('قديمة');
    await issue().expect(400);
    await prisma.bedAssignment.update({
      where: { id: history.first.id },
      data: {
        roomRateSnapshot: {
          version: 1,
          serviceItemId: history.firstServiceId,
          dailyRate: '100.000',
          insurancePolicyId: null,
          capturedAt: history.start.toISOString(),
        },
        to: new Date(history.moved.getTime() + 3600000),
      },
    });
    const overlap = await ready().expect(200);
    expect(
      (overlap.body as { roomBillingReviewReason: string })
        .roomBillingReviewReason,
    ).toContain('متداخل');
    await issue().expect(400);
    expect(await prisma.invoice.count({ where: { encounterId } })).toBe(0);
  });

  it('preserves prorated contracted room amounts and splits insurance without charging a full tariff per component', async () => {
    const history = await installPricedHistory();
    const provider = await prisma.insuranceProvider.create({
      data: {
        hospitalId,
        code: 'PRORATED-INSURANCE',
        name: 'Synthetic insurance',
      },
    });
    const list = await prisma.priceList.create({
      data: { hospitalId, name: 'Synthetic room contract' },
    });
    const policy = await prisma.insurancePolicy.create({
      data: {
        insuranceProviderId: provider.id,
        name: 'Synthetic room policy',
        priceListId: list.id,
        patientCopayRate: '0.2',
      },
    });
    await prisma.patient.update({
      where: { id: patientId },
      data: { insurancePolicyId: policy.id },
    });
    for (const assignment of [history.first, history.second]) {
      const snapshot = assignment.roomRateSnapshot as Prisma.JsonObject;
      await prisma.bedAssignment.update({
        where: { id: assignment.id },
        data: {
          roomRateSnapshot: {
            ...snapshot,
            insurancePolicyId: policy.id,
            priceListId: list.id,
          },
        },
      });
    }
    await prisma.priceListItem.createMany({
      data: [history.firstServiceId, history.secondServiceId].map(
        (serviceItemId) => ({
          priceListId: list.id,
          serviceItemId,
          price: 900,
        }),
      ),
    });
    const billed = await issue().expect(201);
    expect(billed.body).toMatchObject({
      totalAmount: '150',
      patientShare: '30',
      insuranceShare: '120',
    });
    const charges = await prisma.encounterCharge.findMany({
      where: { encounterId },
    });
    expect(
      charges.map((charge) => charge.totalAmount.toString()).sort(),
    ).toEqual(['100', '50']);
  });

  it('requires a documented settlement if the insurance context changes after rate capture', async () => {
    await installPricedHistory();
    const provider = await prisma.insuranceProvider.create({
      data: {
        hospitalId,
        code: 'CHANGED-ROOM-INSURANCE',
        name: 'Synthetic changed insurer',
      },
    });
    const policy = await prisma.insurancePolicy.create({
      data: { insuranceProviderId: provider.id, name: 'Synthetic new policy' },
    });
    await prisma.patient.update({
      where: { id: patientId },
      data: { insurancePolicyId: policy.id },
    });
    const preview = await ready().expect(200);
    expect(
      (preview.body as { roomBillingReviewReason: string })
        .roomBillingReviewReason,
    ).toContain('سياق التأمين');
    await issue().expect(400);
    expect(await prisma.invoice.count({ where: { encounterId } })).toBe(0);
  });

  const nightly = (accessToken = token) =>
    request(app.getHttpServer())
      .post('/cron/run-nightly-billing')
      .set('Authorization', 'Bearer ' + accessToken);

  it('uses one room plan for concurrent nightly jobs and invoice issuance without duplicate charges', async () => {
    await installPricedHistory();
    const results = await Promise.all([nightly(), nightly(), issue()]);
    expect(results.map((result) => result.status)).toEqual([201, 201, 201]);
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      2,
    );
    expect(await prisma.invoice.count({ where: { encounterId } })).toBe(1);
    expect((results[2].body as { totalAmount: string }).totalAmount).toBe(
      '150',
    );
    expect((await nightly().expect(201)).body).toMatchObject({
      chargedCount: 0,
      success: true,
    });
  });

  it('defers open started-day components until invoice issuance instead of freezing provisional allocation', async () => {
    await installPricedHistory();
    await prisma.admission.update({
      where: { id: admissionId },
      data: { roomBillingPolicy: 'STARTED_24H' },
    });
    const result = await nightly().expect(201);
    expect(result.body).toMatchObject({
      success: true,
      chargedCount: 2,
      deferredCount: 1,
    });
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      2,
    );
    const response = await issue().expect(201);
    expect((response.body as { totalAmount: string }).totalAmount).toBe('350');
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      3,
    );
  });

  it('keeps manual nightly runs inside the authenticated hospital and denies readers', async () => {
    await installPricedHistory();
    await nightly(readToken).expect(403);
    const hospital = await prisma.hospital.create({
      data: {
        code: 'FOREIGN-NIGHTLY',
        name: 'Synthetic other nightly hospital',
      },
    });
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const other = await auth.createTestUser('other-nightly', 'synthetic', {
      hospitalId: hospital.id,
      permissions: ['system:manage'],
    });
    const result = await nightly(other.accessToken).expect(201);
    expect(result.body).toMatchObject({ chargedCount: 0, success: true });
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      0,
    );
    await nightly().expect(201);
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      2,
    );
  });

  it('defers unverified legacy room pricing to explicit invoice issuance', async () => {
    const result = await nightly().expect(201);
    expect(result.body).toMatchObject({
      success: true,
      chargedCount: 0,
      deferredCount: 1,
    });
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      0,
    );
    expect((await issue().expect(201)).body).toMatchObject({
      totalAmount: '100',
    });
  });

  it('reports legacy occupied encounters without an admission instead of silently omitting them', async () => {
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        mrn: 'MISSING-ADMISSION',
        fullName: 'Synthetic missing admission',
      },
    });
    const encounter = await prisma.encounter.create({
      data: { hospitalId, patientId: patient.id, type: 'IPD' },
    });
    const source = await prisma.bed.findUniqueOrThrow({ where: { id: bedId } });
    const occupied = await prisma.bed.create({
      data: {
        hospitalId,
        wardId: source.wardId,
        roomId: source.roomId,
        bedNumber: 'MISSING-ADMISSION',
        status: 'OCCUPIED',
      },
    });
    await prisma.bedAssignment.create({
      data: { hospitalId, encounterId: encounter.id, bedId: occupied.id },
    });
    const response = await nightly().expect(201);
    expect((response.body as { success: boolean }).success).toBe(false);
    expect((response.body as { errors: string[] }).errors.join(' ')).toContain(
      'بلا سجل دخول',
    );
    expect(
      await prisma.encounterCharge.count({
        where: { encounterId: encounter.id },
      }),
    ).toBe(0);
  });

  it('does not silently apply the current ward price to a stay spanning different ward tariffs', async () => {
    await addHistoricalWard();
    await issue().expect(400);
    expect(await prisma.invoice.count({ where: { encounterId } })).toBe(0);
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      0,
    );
  });

  it('counts previously charged room days across wards and does not charge those days twice', async () => {
    const oldServiceId = await addHistoricalWard();
    await prisma.encounterCharge.create({
      data: {
        hospitalId,
        encounterId,
        serviceItemId: oldServiceId,
        sourceType: 'BED',
        quantity: 1,
        unitPrice: 70,
        totalAmount: 70,
      },
    });
    await issue().expect(201);
    const charges = await prisma.encounterCharge.findMany({
      where: { encounterId, sourceType: 'BED' },
    });
    expect(charges).toHaveLength(1);
    expect(charges[0].serviceItemId).toBe(oldServiceId);
    expect(charges[0].totalAmount.toString()).toBe('70');
  });

  it('shows pending accommodation and rejects discharge without creating rollback-only charges', async () => {
    const response = await ready().expect(200);
    expect(response.body).toMatchObject({
      ready: false,
      financialClearance: false,
      pendingRoomDays: 1,
    });
    await discharge().expect(400);
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      0,
    );
    expect(
      (await prisma.bed.findUniqueOrThrow({ where: { id: bedId } })).status,
    ).toBe('OCCUPIED');
  });

  it('invoices accommodation before settlement, blocks partial balances and then discharges once', async () => {
    await issue().expect(201);
    const charges = await prisma.encounterCharge.findMany({
      where: { encounterId, sourceType: 'BED' },
    });
    expect(charges).toHaveLength(1);
    expect(charges[0].quantity).toBe(1);
    expect(charges[0].totalAmount.toString()).toBe('100');
    expect(charges[0].invoiceId).not.toBeNull();
    await discharge().expect(400);
    await settle(50);
    await discharge().expect(400);
    await settle();
    expect((await ready().expect(200)).body).toMatchObject({
      ready: true,
      pendingRoomDays: 0,
    });
    await discharge().expect(201);
    expect(
      (await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } }))
        .status,
    ).toBe('CLOSED');
    expect(
      (await prisma.bed.findUniqueOrThrow({ where: { id: bedId } })).status,
    ).toBe('CLEANING');
    expect(
      await prisma.bedAssignment.count({ where: { encounterId, to: null } }),
    ).toBe(0);
    await discharge().expect(400);
    expect(
      await prisma.admissionNote.count({
        where: { admissionId, type: 'DISCHARGE' },
      }),
    ).toBe(1);
  });

  it('charges multiple elapsed days without multiplying or omitting the room price', async () => {
    await prisma.admission.update({
      where: { id: admissionId },
      data: { actualAdmissionDate: new Date(Date.now() - 60 * 3600000) },
    });
    const response = await issue().expect(201);
    expect((response.body as { patientShare: string }).patientShare).toBe(
      '200',
    );
    const charge = await prisma.encounterCharge.findFirstOrThrow({
      where: { encounterId, sourceType: 'BED' },
    });
    expect(charge.quantity).toBe(2);
    expect(charge.totalAmount.toString()).toBe('200');
    expect((await ready().expect(200)).body).toMatchObject({
      pendingRoomDays: 0,
    });
  });

  it('rejects a future admission date without generating charges or an invoice', async () => {
    await prisma.admission.update({
      where: { id: admissionId },
      data: { actualAdmissionDate: new Date(Date.now() + 3600000) },
    });
    await issue().expect(400);
    await discharge().expect(400);
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      0,
    );
    expect(await prisma.invoice.count({ where: { encounterId } })).toBe(0);
  });

  it('commits discharge once under concurrent requests', async () => {
    await issue().expect(201);
    await settle();
    const responses = await Promise.all([discharge(), discharge()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    expect(
      await prisma.admissionNote.count({
        where: { admissionId, type: 'DISCHARGE' },
      }),
    ).toBe(1);
    expect(
      await prisma.bedAssignment.count({ where: { encounterId, to: null } }),
    ).toBe(0);
  });

  it('does not accept stale medical and financial clearance flags as a debt override', async () => {
    await issue().expect(201);
    await prisma.admission.update({
      where: { id: admissionId },
      data: { medicalClearance: true, financialClearance: true },
    });
    expect((await ready().expect(200)).body).toMatchObject({
      financialClearance: false,
      ready: false,
    });
    await discharge().expect(400);
  });

  it('issues exactly one invoice for simultaneous requests for the same charges', async () => {
    const responses = await Promise.all([issue(), issue()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    expect(await prisma.invoice.count({ where: { encounterId } })).toBe(1);
    expect(
      await prisma.encounterCharge.count({
        where: { encounterId, sourceType: 'BED' },
      }),
    ).toBe(1);
  });

  it('rolls accommodation back if the accounting period rejects invoice issuance', async () => {
    await prisma.financialPeriod.update({
      where: { id: periodId },
      data: { isOpen: false },
    });
    await issue().expect(400);
    expect(await prisma.encounterCharge.count({ where: { encounterId } })).toBe(
      0,
    );
    expect(await prisma.invoice.count({ where: { encounterId } })).toBe(0);
  });

  it('aggregates small outstanding balances instead of ignoring each below the debt limit', async () => {
    await issue().expect(201);
    await settle();
    for (let index = 0; index < 2; index++)
      await prisma.invoice.create({
        data: {
          hospitalId,
          patientId,
          encounterId,
          status: 'ISSUED',
          totalAmount: '0.006',
          patientShare: '0.006',
          insuranceShare: 0,
          paidAmount: 0,
          financialYearId: yearId,
          financialPeriodId: periodId,
        },
      });
    expect((await ready().expect(200)).body).toMatchObject({
      patientDebt: '0.012',
      financialClearance: false,
    });
    await discharge().expect(400);
  });

  it('rejects an unsigned summary even if legacy medical clearance is true', async () => {
    await issue().expect(201);
    await settle();
    await prisma.dischargeSummary.update({
      where: { admissionId },
      data: { completedAt: null },
    });
    await prisma.admission.update({
      where: { id: admissionId },
      data: { medicalClearance: true },
    });
    await discharge().expect(400);
  });

  it('does not treat charges still linked to a cancelled invoice as settled', async () => {
    const response = await issue().expect(201);
    await prisma.invoice.update({
      where: { id: (response.body as { id: number }).id },
      data: { status: 'CANCELLED' },
    });
    expect((await ready().expect(200)).body).toMatchObject({
      uninvoicedChargesCount: 1,
      financialClearance: false,
    });
    await discharge().expect(400);
    await issue().expect(201);
    expect(
      await prisma.invoice.count({ where: { encounterId, status: 'ISSUED' } }),
    ).toBe(1);
  });

  it('requires a pending transfer to be completed or cancelled before discharge', async () => {
    await issue().expect(201);
    await settle();
    const transfer = await request(app.getHttpServer())
      .post('/transfers/request')
      .set('Authorization', 'Bearer ' + token)
      .send({ encounterId })
      .expect(201);
    expect((await ready().expect(200)).body).toMatchObject({
      ready: false,
      pendingTransfersCount: 1,
    });
    await discharge().expect(400);
    await request(app.getHttpServer())
      .patch('/transfers/' + (transfer.body as { id: number }).id + '/cancel')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    await discharge().expect(201);
  });

  it('denies view-only discharge and isolates a different branch', async () => {
    await discharge(readToken).expect(403);
    const other = await prisma.hospital.create({
      data: { name: 'Foreign Discharge Branch', code: 'FOREIGN-DISCHARGE' },
    });
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const foreign = await auth.createTestUser(
      'foreign-discharge',
      'test-password',
      {
        hospitalId: other.id,
        permissions: ['admission:view', 'admission:manage'],
      },
    );
    await discharge(foreign.accessToken).expect(404);
    await request(app.getHttpServer())
      .get('/admissions/' + admissionId + '/discharge-readiness')
      .set('Authorization', 'Bearer ' + foreign.accessToken)
      .expect(404);
  });
});
