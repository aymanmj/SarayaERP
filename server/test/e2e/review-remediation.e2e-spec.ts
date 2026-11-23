import { CashierSessionsService } from '../../src/cashier/cashier-sessions.service';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccountingService } from '../../src/accounting/accounting.service';
import { PatientDepositService } from '../../src/billing/patient-deposit.service';
import { BillingService } from '../../src/billing/billing.service';
import { NursingService } from '../../src/nursing/nursing.service';
import { SurgeryService } from '../../src/surgery/surgery.service';
import { ClaimService } from '../../src/rcm/claim.service';
import { EraProcessingService } from '../../src/rcm/era-processing.service';
import { InsuranceService } from '../../src/insurance/insurance.service';
import { AuthService } from '../../src/auth/auth.service';
import { EventsGateway } from '../../src/events/events.gateway';
import { cashSessionBalance } from '../../src/cashier/cash-control';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import type { ChargeSource } from '@prisma/client';
const until = async (check: () => Promise<boolean> | boolean) => {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Expected synchronization condition did not occur');
};
describe('Review RV01–RV13: independent financial, medication and live-session acceptance', () => {
  let app: INestApplication<Server>,
    db: PrismaService,
    deposits: PatientDepositService,
    nursing: NursingService;
  let hospitalId: number,
    userId: number,
    patientId: number,
    encounterId: number,
    itemId: number,
    prescriptionId: number,
    warehouseId: number,
    sessionId: number;
  let token: string, reader: string;
  let sockets: Socket[] = [];
  const collection = (amount = '100.000', requestId = randomUUID()) => ({
    patientId,
    encounterId,
    amount,
    requestId,
    method: 'TRANSFER' as const,
  });
  const refund = (amount = '100.000', requestId = randomUUID()) => ({
    patientId,
    amount,
    requestId,
    method: 'TRANSFER' as const,
    reason: 'Synthetic accepted refund request',
  });
  const admin = (requestId = randomUUID()) => ({
    hospitalId,
    userId,
    encounterId,
    prescriptionItemId: itemId,
    patientBarcode: 'REPAIR-A',
    drugBarcode: 'REPAIR-DRUG',
    requestId,
  });
  const invoice = async (insurance = false) =>
    await db.invoice.create({
      data: {
        hospitalId,
        patientId,
        encounterId,
        totalAmount: 100,
        patientShare: insurance ? 0 : 100,
        insuranceShare: insurance ? 100 : 0,
        status: 'ISSUED',
        ...(insurance
          ? {
              insuranceProviderId: (
                await db.insuranceProvider.create({
                  data: {
                    hospitalId,
                    code: 'REPAIR-INSURER',
                    name: 'Synthetic repair insurer',
                  },
                })
              ).id,
            }
          : {}),
      },
    });
  const claim = async () => {
    const inv = await invoice(true);
    await app
      .get(AccountingService)
      .recordInvoiceEntry({ hospitalId, invoiceId: inv.id, userId });
    return db.claim.create({
      data: {
        hospitalId,
        invoiceId: inv.id,
        claimNumber: randomUUID(),
        claimedAmount: 100,
        paidAmount: 0,
        status: 'SUBMITTED',
      },
    });
  };
  const receipt = (
    claimId: number,
    paidAmount = '80.000',
    requestId = randomUUID(),
  ) =>
    app
      .get(ClaimService)
      .postPayment(claimId, { paidAmount, requestId }, hospitalId, userId);
  const charge = async (sourceType: ChargeSource = 'SURGERY_CONSUMABLE') => {
    const service = await db.serviceItem.create({
      data: {
        hospitalId,
        code: randomUUID(),
        name: 'Synthetic execution charge',
        type: 'SURGERY',
        defaultPrice: 1,
      },
    });
    return db.encounterCharge.create({
      data: {
        hospitalId,
        encounterId,
        serviceItemId: service.id,
        sourceType,
        sourceId: 900001,
        quantity: 1,
        unitPrice: 50,
        totalAmount: 50,
      },
    });
  };
  const failInsert = async (
    table: 'AuditLog' | 'AccountingEntry' | 'ClaimHistory',
    work: () => Promise<void>,
  ) => {
    await db.$executeRawUnsafe(
      `CREATE FUNCTION repair_review_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic review failure'; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        `CREATE TRIGGER repair_review_failure BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION repair_review_failure()`,
      );
      await work();
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS repair_review_failure ON "${table}"`,
      );
      await db.$executeRawUnsafe('DROP FUNCTION repair_review_failure()');
    }
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    db = app.get(PrismaService);
    deposits = app.get(PatientDepositService);
    nursing = app.get(NursingService);
  });
  afterEach(() => {
    for (const socket of sockets) socket.disconnect();
    sockets = [];
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    const auth = new AuthHelper(db, app.get(JwtService));
    const actor = await auth.createTestUser('repair-actor', 'synthetic', {
      roles: ['NURSE'],
      permissions: [
        'accounting:manage',
        'billing:manage',
        'billing:view',
        'nursing:view',
        'nursing:medications:administer',
        'nursing:medications:override',
        'nursing:notes:manage',
        'surgery:view',
        'surgery:manage',
      ],
    });
    hospitalId = actor.user.hospitalId;
    userId = actor.user.id;
    token = actor.accessToken;
    const readerActor = await auth.createTestUser(
      'repair-reader',
      'synthetic',
      { hospitalId, permissions: ['nursing:view'] },
    );
    reader = readerActor.accessToken;
    patientId = (
      await db.patient.create({
        data: {
          id: 11001,
          hospitalId,
          mrn: 'REPAIR-A',
          fullName: 'Synthetic repair patient A',
        },
      })
    ).id;
    encounterId = (
      await db.encounter.create({
        data: { id: 21001, hospitalId, patientId, type: 'IPD' },
      })
    ).id;
    const product = await db.product.create({
      data: {
        hospitalId,
        code: 'REPAIR-MED',
        name: 'Synthetic repair drug',
        type: 'DRUG',
        barcode: 'REPAIR-DRUG',
      },
    });
    const rx = await db.prescription.create({
      data: {
        hospitalId,
        patientId,
        encounterId,
        doctorId: userId,
        status: 'ACTIVE',
        pharmacistVerificationStatus: 'VERIFIED',
        items: {
          create: {
            productId: product.id,
            dose: '1g',
            route: 'IV',
            frequency: 'BID',
            durationDays: 3,
            quantity: 6,
          },
        },
      },
      include: { items: true },
    });
    prescriptionId = rx.id;
    itemId = rx.items[0].id;
    await app
      .get(AccountingService)
      .ensureDefaultAccountsForHospital(hospitalId);
    const year = new Date().getUTCFullYear();
    const fy = await db.financialYear.create({
      data: {
        hospitalId,
        code: 'REPAIR',
        name: 'Synthetic repair year',
        isCurrent: true,
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year}-12-31`),
        status: 'OPEN',
      },
    });
    await db.financialPeriod.create({
      data: {
        financialYearId: fy.id,
        periodCode: 'REPAIR-P',
        periodIndex: 1,
        monthStartDate: new Date(`${year}-01-01`),
        monthEndDate: new Date(`${year}-12-31`),
        numberOfDays: 365,
        isOpen: true,
      },
    });
    sessionId = (
      await db.cashierSession.create({
        data: {
          hospitalId,
          cashierId: userId,
          reviewedById: readerActor.user.id,
          status: 'OPEN',
          openingAmount: '0.000',
          reason: 'Synthetic approved repair session',
          requestKey: randomUUID(),
          openedAt: new Date(),
        },
      })
    ).id;
    warehouseId = (
      await db.warehouse.create({
        data: { hospitalId, name: 'Synthetic surgery source' },
      })
    ).id;
  });
  it('RV02 rejects read-only access to every medication and nursing-note write route', async () => {
    for (const [route, body] of [
      ['administer-barcode', { ...admin() }],
      [
        'administer-med',
        {
          prescriptionItemId: itemId,
          status: 'GIVEN',
          requestId: randomUUID(),
        },
      ],
      ['notes', { note: 'Synthetic denied write' }],
    ] as const) {
      await request(app.getHttpServer())
        .post(`/nursing/encounters/${encounterId}/${route}`)
        .set('Authorization', `Bearer ${reader}`)
        .send(body)
        .expect(403);
    }
    expect(await db.medicationAdministration.count()).toBe(0);
    expect(await db.nursingNote.count()).toBe(0);
  });
  it('RV02 enforces a separate emergency override permission inside the transaction', async () => {
    const actor = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'repair-no-override',
      'synthetic',
      { hospitalId, permissions: ['nursing:medications:administer'] },
    );
    await request(app.getHttpServer())
      .post(`/nursing/encounters/${encounterId}/administer-barcode`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({
        ...admin(),
        drugBarcode: 'WRONG',
        isEmergencyOverride: true,
        varianceReason: 'Synthetic resuscitation variance',
      })
      .expect(403);
    expect(await db.medicationAdministration.count()).toBe(0);
  });
  it('RV09 reports only the two matches actually checked and never labels them five rights', async () => {
    const result = await nursing.verifyFiveRights(
      hospitalId,
      encounterId,
      itemId,
      'REPAIR-A',
      'REPAIR-DRUG',
    );
    expect(result.isBarcodeMatch).toBe(true);
    expect(result.isVerified5Rights).toBe(false);
    expect(result.verificationScope).toBe('PATIENT_AND_DRUG');
    const saved = await nursing.administerWithBarcode(admin());
    expect(saved.isBarcodeMatch).toBe(true);
    expect(saved.isVerified5Rights).toBe(false);
  });
  it('RV03 rejects an unapproved prescription and documents a separately authorized override', async () => {
    await db.prescription.update({
      where: { id: prescriptionId },
      data: { pharmacistVerificationStatus: 'PENDING' },
    });
    await expect(nursing.administerWithBarcode(admin())).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      nursing.administerWithBarcode({
        ...admin(),
        isEmergencyOverride: true,
        varianceReason: 'short',
      }),
    ).rejects.toThrow(BadRequestException);
    const saved = await nursing.administerWithBarcode({
      ...admin(),
      isEmergencyOverride: true,
      varianceReason: 'Synthetic documented emergency',
    });
    expect(saved.isEmergencyOverride).toBe(true);
    expect(saved.isVerified5Rights).toBe(false);
  });
  it('RV03 rejects a prescription cancelled while execution waits for its row lock', async () => {
    let ready: () => void = () => {},
      release: () => void = () => {};
    const started = new Promise<void>((r) => (ready = r));
    const finish = new Promise<void>((r) => (release = r));
    let pid = 0;
    const holder = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Prescription" WHERE id=${prescriptionId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "PrescriptionItem" WHERE id=${itemId} FOR UPDATE`;
        await tx.prescription.update({
          where: { id: prescriptionId },
          data: { status: 'CANCELLED' },
        });
        pid = (
          await tx.$queryRaw<{ id: number }[]>`SELECT pg_backend_pid() AS id`
        )[0].id;
        ready();
        await finish;
      },
      { timeout: 15000 },
    );
    await started;
    const posting = nursing.administerWithBarcode(admin()).then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error: error as unknown }),
    );
    try {
      await until(async () => {
        const rows = await db.$queryRaw<
          { blocked: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid}=ANY(pg_blocking_pids(pid))) AS blocked`;
        return rows[0].blocked;
      });
    } finally {
      release();
      await holder;
    }
    const result = await posting;
    expect(result.error).toBeInstanceOf(BadRequestException);
    expect(await db.medicationAdministration.count()).toBe(0);
  });
  it('RV03 shares replay protection between manual and barcode actions and survives a lost reply', async () => {
    const body = admin();
    const [a, b] = await Promise.all([
      nursing.administerWithBarcode(body),
      nursing.administerWithBarcode(body),
    ]);
    expect(a.id).toBe(b.id);
    await db.medicationAdministration.update({
      where: { id: a.id },
      data: { administeredAt: new Date(Date.now() - 120000) },
    });
    await db.encounter.update({
      where: { id: encounterId },
      data: { status: 'CLOSED' },
    });
    expect((await nursing.administerWithBarcode(body)).id).toBe(a.id);
    expect(await db.medicationAdministration.count()).toBe(1);
    expect(
      await db.auditLog.count({
        where: { action: 'CLMA_MEDICATION_ADMINISTERED' },
      }),
    ).toBe(1);
  });
  it('RV03 rejects changing a committed administration identity and a rapid manual duplicate', async () => {
    const body = admin();
    await nursing.administerWithBarcode(body);
    await expect(
      nursing.administerWithBarcode({ ...body, notes: 'different' }),
    ).rejects.toThrow(ConflictException);
    await expect(
      nursing.administerMedication({ ...admin(), status: 'GIVEN' }),
    ).rejects.toThrow(ConflictException);
    expect(await db.medicationAdministration.count()).toBe(1);
  });
  it('RV03 rolls back medication administration on mandatory audit failure', async () => {
    await failInsert('AuditLog', async () => {
      await expect(nursing.administerWithBarcode(admin())).rejects.toThrow();
      expect(await db.medicationAdministration.count()).toBe(0);
    });
  });
  it('RV04 keeps refunds of a patient with a shared id prefix out of the first wallet', async () => {
    await deposits.createDeposit(hospitalId, userId, collection());
    const other = await db.patient.create({
      data: {
        id: 110010,
        hospitalId,
        mrn: 'REPAIR-B',
        fullName: 'Synthetic repair B',
      },
    });
    await deposits.createDeposit(hospitalId, userId, {
      ...collection(),
      patientId: other.id,
      encounterId: undefined,
    });
    await deposits.refundDeposit(hospitalId, userId, {
      ...refund('30'),
      patientId: other.id,
    });
    const first = await deposits.getPatientDepositBalance(
      hospitalId,
      patientId,
    );
    expect(first.availableBalance.toString()).toBe('100');
    expect(first.totalRefunded.isZero()).toBe(true);
    expect(first.refunds).toHaveLength(0);
  });
  it('RV05 filters encounter activity using exact patient and encounter identities', async () => {
    await deposits.createDeposit(hospitalId, userId, collection());
    const other = await db.patient.create({
      data: {
        id: 110010,
        hospitalId,
        mrn: 'REPAIR-B',
        fullName: 'Synthetic repair B',
      },
    });
    const e = await db.encounter.create({
      data: { id: 210010, hospitalId, patientId: other.id, type: 'IPD' },
    });
    await deposits.createDeposit(hospitalId, userId, {
      ...collection('30'),
      patientId: other.id,
      encounterId: e.id,
    });
    const result = await deposits.getPatientDepositBalance(
      hospitalId,
      patientId,
      encounterId,
    );
    expect(result.availableBalance.toString()).toBe('100');
    expect(result.deposits).toHaveLength(1);
    expect(result.deposits[0].depositPatientId).toBe(patientId);
    await expect(
      deposits.getPatientDepositBalance(hospitalId, patientId, e.id),
    ).rejects.toThrow();
  });
  it('RV05 defines patient-wide funds while restricting an encounter activity list', async () => {
    await deposits.createDeposit(hospitalId, userId, collection());
    const e = await db.encounter.create({
      data: { hospitalId, patientId, type: 'IPD' },
    });
    await deposits.createDeposit(hospitalId, userId, {
      ...collection('200'),
      encounterId: e.id,
    });
    const result = await deposits.getPatientDepositBalance(
      hospitalId,
      patientId,
      encounterId,
    );
    expect(result.walletScope).toBe('PATIENT');
    expect(result.availableBalance.toString()).toBe('300');
    expect(result.deposits).toHaveLength(1);
  });
  it('RV08 serializes two bank refunds competing for the same 100-unit wallet', async () => {
    await deposits.createDeposit(hospitalId, userId, collection());
    const results = await Promise.allSettled([
      deposits.refundDeposit(hospitalId, userId, refund()),
      deposits.refundDeposit(hospitalId, userId, refund()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const balance = await deposits.getPatientDepositBalance(
      hospitalId,
      patientId,
    );
    expect(balance.totalRefunded.toString()).toBe('100');
    expect(balance.availableBalance.isZero()).toBe(true);
  });
  it('RV08 replays receipt and refund documents without posting twice after exhaustion', async () => {
    const collect = collection();
    const [a, b] = await Promise.all([
      deposits.createDeposit(hospitalId, userId, collect),
      deposits.createDeposit(hospitalId, userId, collect),
    ]);
    expect(a.id).toBe(b.id);
    const body = refund();
    const first = await deposits.refundDeposit(hospitalId, userId, body);
    expect((await deposits.refundDeposit(hospitalId, userId, body)).id).toBe(
      first.id,
    );
    expect(await db.voucher.count()).toBe(2);
    expect(await db.accountingEntry.count()).toBe(2);
    await expect(
      deposits.refundDeposit(hospitalId, userId, { ...body, amount: '1' }),
    ).rejects.toThrow(ConflictException);
  });
  it('RV06 includes cash deposits and refunds in the approved session balance', async () => {
    await deposits.createDeposit(hospitalId, userId, {
      ...collection(),
      method: 'CASH',
    });
    await deposits.refundDeposit(hospitalId, userId, {
      ...refund('40'),
      method: 'CASH',
    });
    const result = await db.$transaction((tx) =>
      cashSessionBalance(tx, sessionId),
    );
    expect(result.received.toString()).toBe('100');
    expect(result.refunded.toString()).toBe('40');
    expect(result.expected.toString()).toBe('60');
    expect(result.available.toString()).toBe('60');
  });
  it('RV06 cannot refund cash from bank-funded deposits without physical session funds', async () => {
    await deposits.createDeposit(hospitalId, userId, collection());
    await expect(
      deposits.refundDeposit(hospitalId, userId, {
        ...refund('40'),
        method: 'CASH',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(await db.voucher.count({ where: { type: 'PAYMENT' } })).toBe(0);
  });
  it('RV06 blocks new cash movements while the session is closing', async () => {
    await db.cashierSession.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSING',
        countedAmount: 0,
        countedAt: new Date(),
        countedById: userId,
        countReason: 'Synthetic closing count',
      },
    });
    await expect(
      deposits.createDeposit(hospitalId, userId, {
        ...collection(),
        method: 'CASH',
      }),
    ).rejects.toThrow();
    expect(await db.voucher.count()).toBe(0);
  });
  it.each(['AccountingEntry', 'AuditLog'] as const)(
    'RV08 atomically rolls back deposit and session amounts when %s fails',
    async (table) => {
      await failInsert(table, async () => {
        await expect(
          deposits.createDeposit(hospitalId, userId, {
            ...collection(),
            method: 'CASH',
          }),
        ).rejects.toThrow();
        expect(await db.voucher.count()).toBe(0);
        const cash = await db.$transaction((tx) =>
          cashSessionBalance(tx, sessionId),
        );
        expect(cash.expected.isZero()).toBe(true);
      });
    },
  );
  it('RV08 checks the financial period and actor before writing a deposit', async () => {
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(
      deposits.createDeposit(hospitalId, userId, collection()),
    ).rejects.toThrow();
    await expect(
      deposits.createDeposit(hospitalId, 0, collection()),
    ).rejects.toThrow();
    expect(await db.voucher.count()).toBe(0);
  });
  it('RV08 serializes applications to different invoices under the same patient wallet', async () => {
    await deposits.createDeposit(hospitalId, userId, collection());
    const a = await invoice(),
      b = await invoice();
    const results = await Promise.allSettled([
      deposits.applyDepositToInvoice(hospitalId, userId, {
        invoiceId: a.id,
        requestId: randomUUID(),
      }),
      deposits.applyDepositToInvoice(hospitalId, userId, {
        invoiceId: b.id,
        requestId: randomUUID(),
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.payment.count()).toBe(1);
    expect(
      (
        await deposits.getPatientDepositBalance(hospitalId, patientId)
      ).availableBalance.isZero(),
    ).toBe(true);
  });
  it('RV08 replays a paid invoice application and protects posted deposit documents', async () => {
    await deposits.createDeposit(hospitalId, userId, collection());
    const inv = await invoice();
    const body = { invoiceId: inv.id, requestId: randomUUID() };
    const a = await deposits.applyDepositToInvoice(hospitalId, userId, body);
    const b = await deposits.applyDepositToInvoice(hospitalId, userId, body);
    expect(a.paymentId).toBe(b.paymentId);
    expect(await db.payment.count()).toBe(1);
    await expect(
      db.payment.update({ where: { id: a.paymentId }, data: { amount: 1 } }),
    ).rejects.toThrow();
    const voucher = await db.voucher.findFirstOrThrow();
    await expect(
      db.voucher.delete({ where: { id: voucher.id } }),
    ).rejects.toThrow();
  });
  it.each(['SURGERY_CONSUMABLE', 'PHARMACY', 'SURGERY'] as const)(
    'RV07 preserves frozen %s execution fees during interim invoicing',
    async (source) => {
      const line = await charge(source);
      const result = await app
        .get(BillingService)
        .createInterimInvoice(encounterId, hospitalId, {}, userId);
      expect(result!.totalAmount.toString()).toBe('50');
      expect(
        (
          await db.encounterCharge.findUniqueOrThrow({ where: { id: line.id } })
        ).totalAmount.toString(),
      ).toBe('50');
    },
  );
  it('RV07 preserves the executed fee against an insurance price list and splits coverage consistently', async () => {
    const line = await charge();
    const provider = await db.insuranceProvider.create({
      data: {
        hospitalId,
        name: 'Synthetic contracted insurer',
        code: randomUUID(),
      },
    });
    const priceList = await db.priceList.create({
      data: {
        hospitalId,
        name: randomUUID(),
        items: {
          create: { serviceItemId: line.serviceItemId, price: '1.000' },
        },
      },
    });
    const policy = await db.insurancePolicy.create({
      data: {
        insuranceProviderId: provider.id,
        name: 'Synthetic policy',
        priceListId: priceList.id,
        patientCopayRate: '0.2',
      },
    });
    await db.patient.update({
      where: { id: patientId },
      data: { insurancePolicyId: policy.id },
    });
    const result = await app
      .get(BillingService)
      .createInterimInvoice(encounterId, hospitalId, {}, userId);
    expect(result!.totalAmount.toString()).toBe('50');
    expect(result!.patientShare.toString()).toBe('10');
    expect(result!.insuranceShare.toString()).toBe('40');
  });
  it('RV12 refuses an ERA balance overwrite without a receipt and preserves the unapplied file', async () => {
    const c = await claim();
    const inv = await db.invoice.findUniqueOrThrow({
      where: { id: c.invoiceId },
    });
    const era = await db.eRATransaction.create({
      data: {
        hospitalId,
        insuranceProviderId: inv.insuranceProviderId!,
        eraNumber: randomUUID(),
        totalPaid: '80',
        lineItems: {
          create: {
            claimId: c.id,
            claimNumber: c.claimNumber,
            billedAmount: '100',
            paidAmount: '80',
            status: 'UNDERPAID',
          },
        },
      },
    });
    await expect(
      app.get(EraProcessingService).reconcileEra(era.id, userId, hospitalId),
    ).rejects.toThrow(BadRequestException);
    expect(
      (
        await db.claim.findUniqueOrThrow({ where: { id: c.id } })
      ).paidAmount!.toString(),
    ).toBe('0');
    expect(
      (await db.eRATransaction.findUniqueOrThrow({ where: { id: era.id } }))
        .status,
    ).toBe('RECEIVED');
    expect(await db.claimReceipt.count()).toBe(0);
    await expect(
      db.claim.update({ where: { id: c.id }, data: { paidAmount: '80' } }),
    ).rejects.toThrow();
  });
  it('RV13 rolls back invoice, linkage, payment and wallet use on application-level posting failure', async () => {
    await deposits.createDeposit(hospitalId, userId, collection());
    const line = await charge();
    const spy = jest
      .spyOn(app.get(AccountingService), 'recordDepositApplicationEntry')
      .mockRejectedValueOnce(
        new BadRequestException('Synthetic missing account configuration'),
      );
    try {
      await expect(
        app
          .get(BillingService)
          .createInterimInvoice(
            encounterId,
            hospitalId,
            { autoApplyDeposit: true },
            userId,
          ),
      ).rejects.toThrow(BadRequestException);
    } finally {
      spy.mockRestore();
    }
    expect(await db.invoice.count()).toBe(0);
    expect(await db.payment.count()).toBe(0);
    expect(
      (await db.encounterCharge.findUniqueOrThrow({ where: { id: line.id } }))
        .invoiceId,
    ).toBeNull();
    expect(
      (
        await deposits.getPatientDepositBalance(hospitalId, patientId)
      ).availableBalance.toString(),
    ).toBe('100');
    expect(await db.accountingEntry.count()).toBe(1);
  });
  it('RV12 serializes claim collections, preserves every receipt, and prevents an overpayment', async () => {
    const c = await claim();
    const results = await Promise.allSettled([receipt(c.id), receipt(c.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await db.claim.findUniqueOrThrow({ where: { id: c.id } })
      ).paidAmount!.toString(),
    ).toBe('80');
    expect(await db.claimReceipt.count()).toBe(1);
    expect(await db.claimHistory.count()).toBe(1);
    expect(await db.accountingEntry.count()).toBe(2);
    await receipt(c.id, '20');
    expect(
      (await db.claim.findUniqueOrThrow({ where: { id: c.id } })).status,
    ).toBe('PAID');
  });
  it('RV12 replays the same receipt once and rejects a reused identity with different money', async () => {
    const c = await claim();
    const id = randomUUID();
    await Promise.all([receipt(c.id, '80', id), receipt(c.id, '80', id)]);
    expect(await db.claimReceipt.count()).toBe(1);
    await expect(receipt(c.id, '10', id)).rejects.toThrow(ConflictException);
    expect(await db.accountingEntry.count()).toBe(2);
  });
  it.each(['ClaimHistory', 'AccountingEntry', 'AuditLog'] as const)(
    'RV12 rolls back receipt, claim, invoice, history and posting when %s fails',
    async (table) => {
      const c = await claim();
      await failInsert(table, async () => {
        await expect(receipt(c.id)).rejects.toThrow();
        expect(await db.claimReceipt.count()).toBe(0);
        expect(await db.claimHistory.count()).toBe(0);
        expect(await db.accountingEntry.count()).toBe(1);
        expect(
          (
            await db.claim.findUniqueOrThrow({ where: { id: c.id } })
          ).paidAmount!.isZero(),
        ).toBe(true);
        expect(
          (await db.invoice.findUniqueOrThrow({ where: { id: c.invoiceId } }))
            .status,
        ).toBe('ISSUED');
      });
    },
  );
  it('RV12 rejects mixing a posted RCM receipt with bulk invoice insurance settlement', async () => {
    const c = await claim();
    await receipt(c.id);
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: c.invoiceId },
    });
    await expect(
      app.get(InsuranceService).postInsuranceSettlement(hospitalId, userId, {
        providerId: invoice.insuranceProviderId!,
        invoiceIds: [c.invoiceId],
        amount: invoice.insuranceShare.toFixed(3),
        bankReference: 'RV12-RCM-RECEIPT',
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(await db.accountingEntry.count()).toBe(2);
  });
  it('RV12 protects receipt snapshots and requires an independently approved write-off workflow', async () => {
    const c = await claim();
    await expect(
      app
        .get(ClaimService)
        .postPayment(
          c.id,
          { paidAmount: '10', requestId: randomUUID(), adjustmentAmount: '1' },
          hospitalId,
          userId,
        ),
    ).rejects.toThrow();
    await receipt(c.id);
    const row = await db.claimReceipt.findFirstOrThrow();
    await expect(
      db.claimReceipt.update({ where: { id: row.id }, data: { amount: 1 } }),
    ).rejects.toThrow();
  });
  it('RV11 does not lock the surgery case while it waits for its encounter parent', async () => {
    const theatre = await db.operatingTheatre.create({
      data: { hospitalId, name: 'Synthetic repair theatre' },
    });
    const surgery = await db.surgeryCase.create({
      data: {
        hospitalId,
        encounterId,
        theatreId: theatre.id,
        surgeryName: 'Synthetic repair surgery',
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 3600000),
        status: 'SCHEDULED',
      },
    });
    let ready: () => void = () => {},
      release: () => void = () => {};
    const started = new Promise<void>((r) => (ready = r));
    const finish = new Promise<void>((r) => (release = r));
    let pid = 0;
    const holder = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Encounter" WHERE id=${encounterId} FOR UPDATE`;
        pid = (
          await tx.$queryRaw<{ id: number }[]>`SELECT pg_backend_pid() AS id`
        )[0].id;
        ready();
        await finish;
      },
      { timeout: 15000 },
    );
    await started;
    const changing = app
      .get(SurgeryService)
      .updateStatus(hospitalId, surgery.id, 'IN_PROGRESS', userId);
    try {
      await until(async () => {
        const rows = await db.$queryRaw<
          { blocked: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid}=ANY(pg_blocking_pids(pid))) AS blocked`;
        return rows[0].blocked;
      });
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SurgeryCase" WHERE id=${surgery.id} FOR UPDATE NOWAIT`;
      });
    } finally {
      release();
      await holder;
    }
    expect((await changing).status).toBe('IN_PROGRESS');
  });
  it('RV06 carries deposit cash through handover and independent final session close without a fictitious variance', async () => {
    await deposits.createDeposit(hospitalId, userId, {
      ...collection(),
      method: 'CASH',
    });
    const reviewer = (
      await db.cashierSession.findUniqueOrThrow({ where: { id: sessionId } })
    ).reviewedById!;
    const service = app.get(CashierSessionsService);
    const handover = await service.handover(hospitalId, sessionId, userId, {
      amount: '25.000',
      reason: 'Synthetic treasury handover',
      requestId: randomUUID(),
    });
    await service.reviewHandover(
      hospitalId,
      sessionId,
      handover.id,
      reviewer,
      true,
      'Synthetic independent handover approval',
      'REPAIR-TREASURY-001',
    );
    await service.count(
      hospitalId,
      sessionId,
      userId,
      '75.000',
      'Synthetic actual drawer count',
    );
    await service.close(
      hospitalId,
      sessionId,
      reviewer,
      'Synthetic independent final close',
    );
    const closing = await db.cashierShiftClosing.findFirstOrThrow({
      where: { hospitalId, sessionId },
    });
    expect(closing.systemCashTotal.toString()).toBe('75');
    expect(closing.difference.isZero()).toBe(true);
    expect(closing.handedOverCashTotal.toString()).toBe('25');
  });
  it('RV11 serializes completion against actual consumable posting without inconsistent stock or duplicate surgery fees', async () => {
    const theatre = await db.operatingTheatre.create({
      data: { hospitalId, name: 'Concurrent repair theatre' },
    });
    const base = await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'REPAIR-SURGERY',
        name: 'Synthetic surgery',
        type: 'SURGERY',
        defaultPrice: 20,
      },
    });
    const surgery = await db.surgeryCase.create({
      data: {
        hospitalId,
        encounterId,
        theatreId: theatre.id,
        serviceItemId: base.id,
        surgeryName: 'Synthetic concurrent surgery',
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 3600000),
        status: 'IN_PROGRESS',
      },
    });
    await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'SURGERY-CONS',
        name: 'Synthetic surgical supplies',
        type: 'SURGERY',
        defaultPrice: 0,
      },
    });
    const product = await db.product.create({
      data: {
        hospitalId,
        code: 'REPAIR-SUPPLY',
        name: 'Synthetic supply',
        type: 'SUPPLY',
        stockOnHand: 1,
        costPrice: 2,
        sellPrice: 3,
      },
    });
    await db.productStock.create({
      data: {
        hospitalId,
        warehouseId,
        productId: product.id,
        quantity: 1,
        unitCost: 2,
        batchNumber: 'REPAIR',
        expiryDate: new Date(Date.now() + 86400000),
      },
    });
    await db.surgeryWarehousePolicy.create({
      data: { hospitalId, warehouseId, updatedById: userId },
    });
    const service = app.get(SurgeryService);
    const results = await Promise.allSettled([
      service.addConsumable({
        hospitalId,
        userId,
        caseId: surgery.id,
        productId: product.id,
        quantity: '1.000',
        requestId: randomUUID(),
      }),
      service.updateStatus(hospitalId, surgery.id, 'COMPLETED', userId),
    ]);
    expect(results[1].status).toBe('fulfilled');
    for (const result of results)
      if (result.status === 'rejected')
        expect(result.reason as unknown).toBeInstanceOf(BadRequestException);
    const used = await db.surgeryConsumable.count({
      where: { surgeryCaseId: surgery.id },
    });
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: product.id } })
      ).stockOnHand.toString(),
    ).toBe(used === 1 ? '0' : '1');
    expect(
      await db.encounterCharge.count({
        where: { hospitalId, sourceType: 'SURGERY', sourceId: surgery.id },
      }),
    ).toBe(1);
  });
  it('RV10 disconnects a real socket on logout and rejects old HTTP and socket tokens after revocation', async () => {
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string')
      throw new Error('Expected a bound local test server');
    const open = (accessToken: string) => {
      const socket = io(`http://127.0.0.1:${address.port}`, {
        auth: { token: accessToken },
        transports: ['websocket'],
        reconnection: false,
        autoConnect: false,
      });
      sockets.push(socket);
      socket.connect();
      return socket;
    };
    const gateway = app.get(EventsGateway);
    const socket = open(token);
    await until(
      () =>
        gateway.server.sockets.adapter.rooms
          .get(`STAFF_USER:${userId}`)
          ?.has(socket.id ?? '') === true,
    );
    const disconnected = new Promise<string>((resolve) =>
      socket.once('disconnect', (reason) => resolve(reason)),
    );
    await request(app.getHttpServer())
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(await disconnected).toBe('io server disconnect');
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).authVersion,
    ).toBe(1);
    await request(app.getHttpServer())
      .get(`/billing/patients/${patientId}/deposits`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    const stale = open(token);
    let rejected = false;
    stale.once('disconnect', () => (rejected = true));
    await until(() => rejected);
    expect(stale.connected).toBe(false);
    const fresh = await app.get(AuthService).login('repair-actor', 'synthetic');
    expect(Object.hasOwn(fresh.user, 'passwordHash')).toBe(false);
    const live = open(fresh.accessToken);
    await until(
      () =>
        gateway.server.sockets.adapter.rooms
          .get(`STAFF_USER:${userId}`)
          ?.has(live.id ?? '') === true,
    );
    expect(live.connected).toBe(true);
  });

  it('FIN02 & FLOW04 verifies HTTP trial-balance, ledger, income-statement, balance-sheet, year-closing with CONTRA_REVENUE, and cost-center opening carry-forward', async () => {
    const year = new Date().getUTCFullYear();
    const fy = await db.financialYear.findFirstOrThrow({
      where: { hospitalId, code: 'REPAIR' },
    });
    const cc = await db.costCenter.create({
      data: {
        hospitalId,
        code: 'CC-OUTPATIENT',
        name: 'العيادات الخارجية',
        type: 'MEDICAL',
      },
    });

    const [cashAcc, revAcc, contraRevAcc, expAcc, equityAcc] =
      await Promise.all([
        db.account.findFirstOrThrow({
          where: { hospitalId, code: '100100' },
        }),
        db.account.findFirstOrThrow({
          where: { hospitalId, code: '400100' },
        }),
        db.account.findFirstOrThrow({
          where: { hospitalId, code: '400800' },
        }),
        db.account.findFirstOrThrow({
          where: { hospitalId, code: '510900' },
        }),
        db.account.findFirstOrThrow({
          where: { hospitalId, code: '300200' },
        }),
      ]);

    await request(app.getHttpServer())
      .post('/accounting/manual-entry')
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: `${year}-06-15`,
        description: 'إيرادات عيادات مع شطب تعاقدي تأميني',
        lines: [
          {
            accountId: cashAcc.id,
            debit: 850,
            credit: 0,
            costCenterId: cc.id,
          },
          {
            accountId: contraRevAcc.id,
            debit: 150,
            credit: 0,
            costCenterId: cc.id,
          },
          {
            accountId: revAcc.id,
            debit: 0,
            credit: 1000,
            costCenterId: cc.id,
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/accounting/manual-entry')
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: `${year}-06-20`,
        description: 'مصروفات تشغيل عيادات',
        lines: [
          {
            accountId: expAcc.id,
            debit: 350,
            credit: 0,
            costCenterId: cc.id,
          },
          {
            accountId: cashAcc.id,
            debit: 0,
            credit: 350,
            costCenterId: cc.id,
          },
        ],
      })
      .expect(201);

    const tbRes = await request(app.getHttpServer())
      .get(`/accounting/trial-balance?costCenterId=${cc.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const tbBody = tbRes.body as {
      totals: { totalDebit: number; totalCredit: number };
    };
    expect(tbBody.totals).toEqual({
      totalDebit: 1350,
      totalCredit: 1350,
    });

    const ledgerRes = await request(app.getHttpServer())
      .get(
        `/accounting/ledger?accountId=${cashAcc.id}&from=${year}-06-01&to=${year}-06-30&costCenterId=${cc.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ledgerBody = ledgerRes.body as {
      openingBalance: number;
      totalDebit: number;
      totalCredit: number;
      closingBalance: number;
    };
    expect(ledgerBody.openingBalance).toBe(0);
    expect(ledgerBody.totalDebit).toBe(850);
    expect(ledgerBody.totalCredit).toBe(350);
    expect(ledgerBody.closingBalance).toBe(500);

    const isBeforeClose = await request(app.getHttpServer())
      .get(
        `/accounting/income-statement?financialYearId=${fy.id}&costCenterId=${cc.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const isBeforeBody = isBeforeClose.body as {
      totalRevenue: number;
      totalExpense: number;
      netProfit: number;
    };
    expect(isBeforeBody.totalRevenue).toBe(850);
    expect(isBeforeBody.totalExpense).toBe(350);
    expect(isBeforeBody.netProfit).toBe(500);

    const bsRes = await request(app.getHttpServer())
      .get(`/accounting/balance-sheet?asOfDate=${year}-06-30`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const bsBody = bsRes.body as {
      totals: {
        assets: number;
        liabilitiesAndEquity: number;
        difference: number;
      };
    };
    expect(bsBody.totals).toEqual({
      assets: 500,
      liabilitiesAndEquity: 500,
      difference: 0,
    });

    await db.financialPeriod.updateMany({
      where: { financialYearId: fy.id },
      data: { isOpen: false },
    });

    const closeRes = await request(app.getHttpServer())
      .post(`/accounting/financial-years/${fy.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ retainedEarningsAccountId: equityAcc.id })
      .expect(200);
    const closeBody = closeRes.body as {
      success: boolean;
      data: {
        financialYearId: number;
        totalRevenue: number;
        totalExpense: number;
        netProfit: number;
      };
    };
    expect(closeBody.success).toBe(true);
    expect(closeBody.data).toMatchObject({
      financialYearId: fy.id,
      totalRevenue: 850,
      totalExpense: 350,
      netProfit: 500,
    });

    const isAfterClose = await request(app.getHttpServer())
      .get(
        `/accounting/income-statement?financialYearId=${fy.id}&costCenterId=${cc.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const isAfterBody = isAfterClose.body as {
      totalRevenue: number;
      totalExpense: number;
      netProfit: number;
    };
    expect(isAfterBody.totalRevenue).toBe(850);
    expect(isAfterBody.totalExpense).toBe(350);
    expect(isAfterBody.netProfit).toBe(500);

    const nextYear = year + 1;
    const nextFy = await db.financialYear.create({
      data: {
        hospitalId,
        code: `REPAIR-${nextYear}`,
        name: `Synthetic repair year ${nextYear}`,
        isCurrent: true,
        startDate: new Date(`${nextYear}-01-01`),
        endDate: new Date(`${nextYear}-12-31`),
        status: 'OPEN',
      },
    });
    await db.financialPeriod.create({
      data: {
        financialYearId: nextFy.id,
        periodCode: `REPAIR-P-${nextYear}`,
        periodIndex: 1,
        monthStartDate: new Date(`${nextYear}-01-01`),
        monthEndDate: new Date(`${nextYear}-12-31`),
        numberOfDays: 365,
        isOpen: true,
      },
    });

    const genOpenRes = await request(app.getHttpServer())
      .post(
        `/accounting/financial-years/${nextFy.id}/generate-opening-from-last`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    const genOpenBody = genOpenRes.body as { success: boolean };
    expect(genOpenBody.success).toBe(true);

    const openingLines = await db.accountingEntryLine.findMany({
      where: {
        entry: {
          hospitalId,
          financialYearId: nextFy.id,
          sourceModule: 'OPENING',
        },
      },
      orderBy: { accountId: 'asc' },
    });
    expect(openingLines).toHaveLength(2);
    expect(openingLines.every((l) => l.costCenterId === cc.id)).toBe(true);
  });
});
