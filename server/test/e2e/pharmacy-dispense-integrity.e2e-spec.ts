import { CashierService } from '../../src/cashier/cashier.service';
import { BillingService } from '../../src/billing/billing.service';
import { InvoiceAdjustmentsService } from '../../src/billing/invoice-adjustments.service';
import { InvoiceRefundsService } from '../../src/billing/invoice-refunds.service';
import { InsuranceService } from '../../src/insurance/insurance.service';
import { ClaimService } from '../../src/rcm/claim.service';
import { FhirService } from '../../src/integration/fhir/fhir.service';
import { PatientPortalService } from '../../src/patient-portal/patient-portal.service';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PharmacyService } from '../../src/pharmacy/pharmacy.service';
import { AccountingService } from '../../src/accounting/accounting.service';
import { changeBatchRestriction } from '../../src/inventory/stock-batch-safety';
import { TimeZoneUtils } from '../../src/common/utils/date.util';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { responseBody } from '../http-response';
import { seedFinancialAccounts } from '../financial-fixture';

describe('Pharmacy dispensing atomicity and exact money (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let hospitalId: number;
  let userId: number;
  let prescriptionId: number;
  let productId: number;
  let encounterId: number;
  let lineId: number;
  let sessionId: number;
  let reviewerId: number;
  let warehouseId: number;
  let token: string;
  const adjustment = (quantity = '-0.500', requestId = randomUUID()) =>
    app.get(PharmacyService).createManualStockTransaction({
      hospitalId,
      userId,
      drugItemId: productId,
      type: 'ADJUST',
      quantity,
      batchNumber: 'A',
      reason: 'Synthetic independently documented variance',
      requestId,
    });
  const source = '/pharmacy/source-policy';
  const reason = 'Synthetic approved pharmacy source change';
  const manager = async (targetHospital = hospitalId) =>
    (
      await new AuthHelper(db, app.get(JwtService)).createTestUser(
        'source-manager',
        'synthetic',
        { hospitalId: targetHospital, permissions: ['pharmacy:source:manage'] },
      )
    ).accessToken;
  const configure = (warehouse: number, access: string) =>
    request(app.getHttpServer())
      .put(source)
      .auth(access, { type: 'bearer' })
      .send({ warehouseId: warehouse, reason });
  const dispense = () =>
    app.get(PharmacyService).dispensePrescription({
      hospitalId,
      prescriptionId,
      pharmacistId: userId,
    });
  const pos = (amountPaid = 3.333) =>
    app.get(PharmacyService).dispenseAndPay({
      hospitalId,
      prescriptionId,
      pharmacistId: userId,
      paymentMethod: 'CASH',
      amountPaid,
    });
  const unchanged = async () => {
    expect(await db.dispenseRecord.count()).toBe(0);
    expect(await db.stockTransaction.count()).toBe(0);
    expect(await db.encounterCharge.count()).toBe(0);
    expect(await db.invoice.count()).toBe(0);
    expect(await db.payment.count()).toBe(0);
    expect(await db.accountingEntry.count()).toBe(0);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('1');
    expect(
      (
        await db.productStock.aggregate({ _sum: { quantity: true } })
      )._sum.quantity?.toString(),
    ).toBe('1');
    expect(
      (
        await db.prescription.findUniqueOrThrow({
          where: { id: prescriptionId },
        })
      ).status,
    ).toBe('ACTIVE');
  };
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
    const actor = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'synthetic-pharmacist',
      'synthetic',
      { permissions: ['pharmacy:view', 'pharmacy:manage'] },
    );
    hospitalId = actor.user.hospitalId;
    userId = actor.user.id;
    token = actor.accessToken;
    reviewerId = (
      await new AuthHelper(db, app.get(JwtService)).createTestUser(
        'synthetic-reviewer',
        'synthetic',
        { hospitalId },
      )
    ).user.id;
    await seedFinancialAccounts(db, hospitalId);
    for (const key of [
      'INVENTORY_DRUGS',
      'COGS_DRUGS',
      'INVENTORY_GAIN',
      'INVENTORY_LOSS',
    ] as const) {
      const account = await db.account.create({
        data: {
          hospitalId,
          code: key,
          name: key,
          type:
            key === 'INVENTORY_GAIN'
              ? 'REVENUE'
              : key === 'COGS_DRUGS' || key === 'INVENTORY_LOSS'
                ? 'EXPENSE'
                : 'ASSET',
        },
      });
      await db.systemAccountMapping.create({
        data: { hospitalId, key, accountId: account.id },
      });
    }
    const year = new Date().getUTCFullYear();
    const fy = await db.financialYear.create({
      data: {
        hospitalId,
        code: 'PHARM-FY',
        name: String(year),
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year}-12-31`),
        status: 'OPEN',
        isCurrent: true,
      },
    });
    await db.financialPeriod.create({
      data: {
        financialYearId: fy.id,
        periodCode: 'PHARM-P',
        periodIndex: 1,
        monthStartDate: new Date(`${year}-01-01`),
        monthEndDate: new Date(`${year}-12-31`),
        numberOfDays: 365,
        isOpen: true,
      },
    });
    const warehouse = await db.warehouse.create({
      data: { hospitalId, name: 'Synthetic Pharmacy' },
    });
    warehouseId = warehouse.id;
    await db.pharmacyWarehousePolicy.create({
      data: { hospitalId, warehouseId: warehouse.id, updatedById: userId },
    });
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: 'SYNTHETIC',
        fullName: 'Synthetic pharmacy patient',
      },
    });
    encounterId = (
      await db.encounter.create({
        data: { hospitalId, patientId: patient.id, type: 'OPD' },
      })
    ).id;
    productId = (
      await db.product.create({
        data: {
          hospitalId,
          code: 'SYNTHETIC',
          name: 'Synthetic drug',
          type: 'DRUG',
          stockOnHand: 1,
          sellPrice: '3.333',
          costPrice: '2.345',
        },
      })
    ).id;
    for (const batchNumber of ['A', 'B'])
      await db.productStock.create({
        data: {
          hospitalId,
          warehouseId: warehouse.id,
          productId,
          batchNumber,
          quantity: '0.500',
          unitCost: '2.345',
          expiryDate: new Date(Date.now() + 86400000 * 30),
        },
      });
    const rx = await db.prescription.create({
      data: {
        hospitalId,
        encounterId,
        patientId: patient.id,
        doctorId: userId,
        pharmacistVerificationStatus: 'VERIFIED',
        verifiedById: userId,
        verifiedAt: new Date(),
        items: {
          create: {
            productId,
            dose: 'Synthetic',
            route: 'ORAL',
            frequency: 'DAILY',
            durationDays: 1,
            quantity: 1,
          },
        },
      },
      include: { items: true },
    });
    prescriptionId = rx.id;
    lineId = rx.items[0].id;
    await db.serviceItem.create({
      data: {
        hospitalId,
        code: 'PHARMACY-DRUGS',
        name: 'Synthetic pharmacy charge',
        type: 'PHARMACY',
        defaultPrice: 0,
      },
    });
    sessionId = (
      await db.cashierSession.create({
        data: {
          hospitalId,
          cashierId: userId,
          requestKey: randomUUID(),
          status: 'OPEN',
          openingAmount: 0,
          reason: 'Synthetic independently funded session',
          reviewedById: reviewerId,
          openedAt: new Date(),
        },
      })
    ).id;
  });
  const createPrepaid = (quantity = 1) =>
    app.get(PharmacyService).createPrescriptionForEncounter({
      hospitalId,
      encounterId,
      doctorId: userId,
      items: [
        {
          drugItemId: productId,
          dose: 'Synthetic',
          route: 'ORAL',
          frequency: 'DAILY',
          durationDays: 1,
          quantity,
        },
      ],
    });

  it('releases a new prescription only after cashier settlement and dispenses at the frozen price', async () => {
    const pharmacy = app.get(PharmacyService);
    const cashier = app.get(CashierService);
    const rx = await createPrepaid();
    const invoiceId = rx.prepaidInvoiceId!;
    expect(invoiceId).toBeGreaterThan(0);
    expect(await cashier.getWorklist(hospitalId)).toContainEqual(
      expect.objectContaining({ id: invoiceId, prescriptionId: rx.id }),
    );
    expect(
      (await cashier.getInvoiceDetails(hospitalId, invoiceId)).lines[0]
        .description,
    ).toContain(String(rx.id));
    const listed = async () =>
      (await pharmacy.getWorklist(hospitalId)).data.find(
        ({ id }) => id === rx.id,
      );
    const release = () =>
      pharmacy.dispensePrescription({
        hospitalId,
        prescriptionId: rx.id,
        pharmacistId: userId,
      });
    expect(await listed()).toBeUndefined();
    const pay = (amount: number) =>
      cashier.recordPayment({
        hospitalId,
        invoiceId,
        userId,
        amount,
        method: 'TRANSFER',
      });
    await pay(1);
    expect(await listed()).toBeUndefined();
    await pharmacy.verifyOrder(rx.id, userId, hospitalId);
    await expect(release()).rejects.toThrow('الخزينة');
    await pay(2.333);
    expect((await listed())?.items[0].drugItem?.unitPrice).toBe('3.333');
    await db.product.update({
      where: { id: productId },
      data: { sellPrice: '9.999' },
    });
    await expect(
      pharmacy.dispenseAndPay({
        hospitalId,
        prescriptionId: rx.id,
        pharmacistId: userId,
        amountPaid: 3.333,
        paymentMethod: 'CASH',
      }),
    ).rejects.toThrow('فاتورة خزينة');
    const results = await Promise.allSettled([release(), release()]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(
      await db.dispenseRecord.count({ where: { prescriptionId: rx.id } }),
    ).toBe(1);
    const lines = await db.dispenseItem.findMany({
      where: { dispenseRecord: { prescriptionId: rx.id } },
    });
    expect(lines.every((line) => line.unitPrice.eq('3.333'))).toBe(true);
    expect(
      (
        await db.dispenseItem.aggregate({
          where: { dispenseRecord: { prescriptionId: rx.id } },
          _sum: { totalAmount: true },
        })
      )._sum.totalAmount?.toString(),
    ).toBe('3.333');
    expect(await db.encounterCharge.count()).toBe(1);
    expect(await db.payment.count()).toBe(2);
    expect(await listed()).toBeUndefined();
  });

  const cancelPrepaid = async (invoiceId: number) => {
    const charge = await db.encounterCharge.findFirstOrThrow({
      where: { hospitalId, invoiceId },
    });
    return {
      service: app.get(InvoiceAdjustmentsService),
      dto: {
        chargeId: charge.id,
        correctedAmount: '0.000',
        reason: 'Synthetic cancellation before dispensing',
        requestId: randomUUID(),
      },
    };
  };

  it('credits a partially paid unfilled prescription and refunds the original receipt exactly once', async () => {
    const rx = await createPrepaid();
    const invoiceId = rx.prepaidInvoiceId!;
    const cashier = app.get(CashierService);
    const pay = (amount: number) =>
      cashier.recordPayment({
        hospitalId,
        invoiceId,
        userId,
        amount,
        method: 'TRANSFER',
      });
    const { paymentId } = await pay(1.111);
    const { service, dto } = await cancelPrepaid(invoiceId);
    expect(await service.list(hospitalId, invoiceId)).toMatchObject({
      eligible: true,
      prescriptionId: rx.id,
    });
    await expect(
      service.request(hospitalId, invoiceId, userId, {
        ...dto,
        correctedAmount: '0.500',
      }),
    ).rejects.toThrow('تصفير');
    const cancellation = await service.request(
      hospitalId,
      invoiceId,
      userId,
      dto,
    );
    expect(
      await service.request(hospitalId, invoiceId, userId, dto),
    ).toMatchObject({
      id: cancellation.id,
    });
    expect(await cashier.getWorklist(hospitalId)).not.toContainEqual(
      expect.objectContaining({ id: invoiceId }),
    );
    await expect(pay(2.222)).rejects.toThrow('موقوف');
    await expect(
      service.review(
        hospitalId,
        invoiceId,
        cancellation.id,
        userId,
        'POST',
        reason,
      ),
    ).rejects.toThrow('موظفًا آخر');
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(
      service.review(
        hospitalId,
        invoiceId,
        cancellation.id,
        reviewerId,
        'POST',
        reason,
      ),
    ).rejects.toThrow('فترة مالية مفتوحة');
    expect(
      await db.prescription.findUniqueOrThrow({ where: { id: rx.id } }),
    ).toMatchObject({ status: 'ACTIVE' });
    expect(
      await db.invoiceAdjustment.findUniqueOrThrow({
        where: { id: cancellation.id },
      }),
    ).toMatchObject({ status: 'PENDING', postingEntryId: null });
    await db.financialPeriod.updateMany({ data: { isOpen: true } });
    const posted = await service.review(
      hospitalId,
      invoiceId,
      cancellation.id,
      reviewerId,
      'POST',
      reason,
    );
    expect(posted.delta.toFixed(3)).toBe('-3.333');
    expect(
      await db.prescription.findUniqueOrThrow({ where: { id: rx.id } }),
    ).toMatchObject({ status: 'CANCELLED', prepaidInvoiceId: invoiceId });
    expect(await service.list(hospitalId, invoiceId)).toMatchObject({
      eligible: false,
      amountDue: '0.000',
      patientCredit: '1.111',
    });
    const refunds = app.get(InvoiceRefundsService);
    const refund = await refunds.request(hospitalId, invoiceId, userId, {
      adjustmentId: posted.id,
      paymentId: paymentId!,
      amount: '1.111',
      reason,
      requestId: randomUUID(),
    });
    await refunds.review(
      hospitalId,
      invoiceId,
      refund.id,
      reviewerId,
      'APPROVE',
      reason,
    );
    await refunds.prepare(
      hospitalId,
      invoiceId,
      refund.id,
      userId,
      randomUUID(),
    );
    const paymentProof = {
      reference: 'REFUND-SYNTHETIC',
      evidence: reason,
      requestId: randomUUID(),
      confirmedPaid: true,
    };
    const result = await refunds.execute(
      hospitalId,
      invoiceId,
      refund.id,
      userId,
      paymentProof,
    );
    expect(
      await refunds.execute(
        hospitalId,
        invoiceId,
        refund.id,
        userId,
        paymentProof,
      ),
    ).toMatchObject({ id: result.id, postingEntryId: result.postingEntryId });
    expect(await refunds.list(hospitalId, invoiceId)).toMatchObject({
      refundedAmount: '1.111',
      availableAmount: '0.000',
    });
    expect(
      await db.accountingEntry.count({
        where: { hospitalId, postingKey: `refund:${hospitalId}:${refund.id}` },
      }),
    ).toBe(1);
    expect(await db.stockTransaction.count()).toBe(0);
  });

  const attachInsurance = async (rate: string, requiresApproval = false) => {
    const encounter = await db.encounter.findUniqueOrThrow({
      where: { id: encounterId },
    });
    const provider = await db.insuranceProvider.create({
      data: { hospitalId, code: 'PHARM-INS', name: 'Synthetic insurance' },
    });
    const plan = await db.insurancePlan.create({
      data: {
        providerId: provider.id,
        name: 'Synthetic plan',
        defaultCopayRate: rate,
      },
    });
    const policy = await db.insurancePolicy.create({
      data: {
        insuranceProviderId: provider.id,
        planId: plan.id,
        name: 'Synthetic poly',
      },
    });
    await db.patient.update({
      where: { id: encounter.patientId },
      data: { insurancePolicyId: policy.id },
    });
    const service = await db.serviceItem.findFirstOrThrow({
      where: { hospitalId, code: 'PHARMACY-DRUGS' },
    });
    if (requiresApproval)
      await db.coverageRule.create({
        data: {
          planId: plan.id,
          serviceItemId: service.id,
          requiresApproval,
          copayValue: rate,
        },
      });
    return { provider, policy, service, patientId: encounter.patientId };
  };

  it('reverses both insured receivables, releases coverage and refunds only the original patient receipt', async () => {
    const { policy, patientId } = await attachInsurance('0.2');
    await db.insurancePolicy.update({
      where: { id: policy.id },
      data: { maxCoverageAmount: '4.000' },
    });
    const rx = await createPrepaid();
    const invoiceId = rx.prepaidInvoiceId!;
    const cashier = app.get(CashierService);
    const pay = (amount: number) =>
      cashier.recordPayment({
        hospitalId,
        invoiceId,
        userId,
        amount,
        method: 'TRANSFER',
      });
    const { paymentId } = await pay(0.222);
    const { service, dto } = await cancelPrepaid(invoiceId);
    await db.invoice.update({
      where: { id: invoiceId },
      data: { claimStatus: 'SUBMITTED' },
    });
    await expect(
      service.request(hospitalId, invoiceId, userId, dto),
    ).rejects.toThrow('المطالبة');
    await app
      .get(InsuranceService)
      .recordClaimWithdrawal(hospitalId, invoiceId, reviewerId, {
        payerReference: 'LEGACY-RX-WITHDRAWAL',
        reason:
          'Synthetic confirmation for a claim submitted before the prescription was filled',
        confirmed: true,
      });
    const cancellation = await service.request(
      hospitalId,
      invoiceId,
      userId,
      dto,
    );
    expect(cancellation.delta.toFixed(3)).toBe('-0.667');
    expect(cancellation.insuranceDelta.toFixed(3)).toBe('-2.666');
    await expect(pay(0.445)).rejects.toThrow('موقوف');
    const approve = () =>
      service.review(
        hospitalId,
        invoiceId,
        cancellation.id,
        reviewerId,
        'POST',
        reason,
      );
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(approve()).rejects.toThrow('فترة مالية مفتوحة');
    const insurance = app.get(InsuranceService);
    expect(
      await insurance.getPatientCoverageBalance(hospitalId, patientId),
    ).toMatchObject({
      remainingAmount: '1.334',
    });
    await db.financialPeriod.updateMany({ data: { isOpen: true } });
    const [posted, replayed] = await Promise.all([approve(), approve()]);
    expect(replayed.postingEntryId).toBe(posted.postingEntryId);
    const entry = await db.accountingEntry.findUniqueOrThrow({
      where: { id: posted.postingEntryId! },
      include: { lines: { include: { account: true } } },
    });
    expect(
      entry.lines.map((line) => [
        line.account.code,
        line.debit.toFixed(3),
        line.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['TEST-REVENUE_PHARMACY', '3.333', '0.000'],
        ['TEST-RECEIVABLE_PATIENTS', '0.000', '0.667'],
        ['TEST-RECEIVABLE_INSURANCE', '0.000', '2.666'],
      ]),
    );
    expect(entry.lines).toHaveLength(3);
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toMatchObject({
      status: 'CANCELLED',
      coveragePolicyId: policy.id,
    });
    expect(
      await insurance.getPatientCoverageBalance(hospitalId, patientId),
    ).toMatchObject({
      remainingAmount: '4.000',
    });
    expect(await service.list(hospitalId, invoiceId)).toMatchObject({
      insuredPrescription: true,
      effectiveInsuranceShare: '0.000',
      amountDue: '0.000',
      patientCredit: '0.222',
    });
    expect(
      (
        await app
          .get(BillingService)
          .getEncounterBilling(encounterId, hospitalId)
      ).totals,
    ).toMatchObject({ totalCharges: 0, outstanding: 0 });
    const refunds = app.get(InvoiceRefundsService);
    const payload = {
      adjustmentId: posted.id,
      paymentId: paymentId!,
      reason,
      requestId: randomUUID(),
    };
    await expect(
      refunds.request(hospitalId, invoiceId, userId, {
        ...payload,
        amount: '0.223',
      }),
    ).rejects.toThrow('يتجاوز الرصيد');
    const refund = await refunds.request(hospitalId, invoiceId, userId, {
      ...payload,
      amount: '0.222',
    });
    await refunds.review(
      hospitalId,
      invoiceId,
      refund.id,
      reviewerId,
      'APPROVE',
      reason,
    );
    await refunds.prepare(
      hospitalId,
      invoiceId,
      refund.id,
      userId,
      randomUUID(),
    );
    const proof = {
      reference: 'INSURED-RX-REFUND',
      evidence: reason,
      requestId: randomUUID(),
      confirmedPaid: true,
    };
    await refunds.execute(hospitalId, invoiceId, refund.id, userId, proof);
    expect(await refunds.list(hospitalId, invoiceId)).toMatchObject({
      patientCredit: '0.000',
      availableAmount: '0.000',
      refundedAmount: '0.222',
    });
    expect(await db.stockTransaction.count()).toBe(0);
    const replacement = await app
      .get(PharmacyService)
      .createPrescriptionForEncounter({
        hospitalId,
        encounterId,
        doctorId: userId,
        replacement: { originalId: rx.id, reason },
        items: [
          {
            drugItemId: productId,
            dose: 'Synthetic',
            route: 'ORAL',
            frequency: 'DAILY',
            durationDays: 1,
            quantity: 1,
          },
        ],
      });
    expect(replacement.replacesPrescriptionId).toBe(rx.id);
  });

  it('blocks cancellation after an insured prescription was dispensed', async () => {
    await attachInsurance('0.2');
    const rx = await createPrepaid();
    const invoiceId = rx.prepaidInvoiceId!;
    await app.get(CashierService).recordPayment({
      hospitalId,
      invoiceId,
      userId,
      amount: 0.667,
      method: 'TRANSFER',
    });
    const pharmacy = app.get(PharmacyService);
    await pharmacy.verifyOrder(rx.id, userId, hospitalId);
    await pharmacy.dispensePrescription({
      hospitalId,
      prescriptionId: rx.id,
      pharmacistId: userId,
    });
    const { service, dto } = await cancelPrepaid(invoiceId);
    expect((await service.list(hospitalId, invoiceId)).eligible).toBe(false);
    await expect(
      service.request(hospitalId, invoiceId, userId, dto),
    ).rejects.toThrow('لم تُصرف');
    expect(await db.invoiceAdjustment.count({ where: { invoiceId } })).toBe(0);
  });

  it.each(['individual', 'batch'] as const)(
    'closes a partial prescription and uses the posted shares for patient refunds and %s insurer receipts',
    async (collectionMode) => {
      const { provider, policy, patientId } = await attachInsurance('0.2');
      const releaseCoverage = collectionMode === 'batch';
      const insurance = app.get(InsuranceService);
      const coverage = () =>
        insurance.getPatientCoverageBalance(hospitalId, patientId);
      await db.insurancePolicy.update({
        where: { id: policy.id },
        data: {
          maxCoverageAmount: '7.999',
          releaseCoverageOnPartialDispense: releaseCoverage,
        },
      });
      const rx = await createPrepaid(3);
      const invoiceId = rx.prepaidInvoiceId!;
      expect(
        await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
      ).toMatchObject({
        coveragePolicyId: policy.id,
        releaseCoverageOnPartialDispense: releaseCoverage,
      });
      await expect(
        db.invoice.update({
          where: { id: invoiceId },
          data: { releaseCoverageOnPartialDispense: !releaseCoverage },
        }),
      ).rejects.toThrow('coverage term is immutable');
      await db.insurancePolicy.update({
        where: { id: policy.id },
        data: { releaseCoverageOnPartialDispense: !releaseCoverage },
      });
      expect(await coverage()).toMatchObject({
        usedAmount: '7.999',
        remainingAmount: '0.000',
      });
      const cashier = app.get(CashierService);
      const { paymentId } = await cashier.recordPayment({
        hospitalId,
        invoiceId,
        userId,
        amount: 2,
        method: 'TRANSFER',
      });
      const pharmacy = app.get(PharmacyService);
      await pharmacy.verifyOrder(rx.id, userId, hospitalId);
      const worklist = await pharmacy.getWorklist(hospitalId);
      expect(worklist.data).toContainEqual(
        expect.objectContaining({ id: rx.id, partialClosureEligible: true }),
      );
      const item = await db.prescriptionItem.findFirstOrThrow({
        where: { prescriptionId: rx.id },
      });
      const dispense = {
        hospitalId,
        prescriptionId: rx.id,
        pharmacistId: userId,
        items: [{ prescriptionItemId: item.id, quantity: 1 }],
      };
      await expect(pharmacy.dispensePrescription(dispense)).rejects.toThrow();
      const closePartial = () =>
        pharmacy.dispensePrescription({
          ...dispense,
          partialClosureReason: 'Patient declined the remaining quantity',
        });
      const attempts = await Promise.allSettled([
        closePartial(),
        closePartial(),
      ]);
      expect(
        attempts.filter((attempt) => attempt.status === 'fulfilled'),
      ).toHaveLength(1);
      await expect(pharmacy.dispensePrescription(dispense)).rejects.toThrow();
      const record = await db.dispenseRecord.findFirstOrThrow({
        where: { prescriptionId: rx.id },
        include: { items: true },
      });
      expect(record.partialClosureReason).toBe(
        'Patient declined the remaining quantity',
      );
      expect(record.items).toHaveLength(2);
      expect(
        record.items
          .reduce(
            (quantity, row) => quantity.plus(row.quantity),
            new Prisma.Decimal(0),
          )
          .toString(),
      ).toBe('1');
      expect(
        await db.stockTransaction.count({
          where: { dispenseRecordId: record.id },
        }),
      ).toBe(2);
      expect(
        await pharmacy.getEncounterPrescriptions(hospitalId, encounterId),
      ).toContainEqual(
        expect.objectContaining({
          id: rx.id,
          partialClosureReason: 'Patient declined the remaining quantity',
          items: [
            expect.objectContaining({ quantity: 3, dispensedQuantity: '1' }),
          ],
        }),
      );
      expect(
        await app.get(FhirService).getMedicationRequest(rx.id, rx.patientId),
      ).toMatchObject({
        status: 'stopped',
        statusReason: { text: 'Patient declined the remaining quantity' },
      });

      const claims = app.get(ClaimService);
      await expect(claims.createClaim(hospitalId, invoiceId)).rejects.toThrow(
        'تصحيح الصرف الجزئي',
      );
      await expect(
        insurance.updateClaimsStatus(
          hospitalId,
          [invoiceId],
          'SUBMITTED',
          undefined,
          userId,
        ),
      ).rejects.toThrow();
      const { service, dto } = await cancelPrepaid(invoiceId);
      expect(await service.list(hospitalId, invoiceId)).toMatchObject({
        partialDispenseQuote: {
          correctedAmount: '3.333',
          patientShare: '0.667',
          insurerShare: '2.666',
        },
      });
      const request = {
        ...dto,
        partialDispense: true,
        correctedAmount: '3.333',
        reason: 'Correct the undelivered units',
      };
      await expect(
        service.request(hospitalId, invoiceId, userId, {
          ...request,
          correctedAmount: '3.334',
        }),
      ).rejects.toThrow();
      const credit = await service.request(
        hospitalId,
        invoiceId,
        userId,
        request,
      );
      expect(
        await service.request(hospitalId, invoiceId, userId, request),
      ).toMatchObject({ id: credit.id });
      const approve = (actor: number) =>
        service.review(
          hospitalId,
          invoiceId,
          credit.id,
          actor,
          'POST',
          'Matched dispensed quantities',
        );
      await expect(approve(userId)).rejects.toThrow('موظفًا آخر');
      await expect(createPrepaid()).rejects.toThrow('سقف التغطية');
      expect(await coverage()).toMatchObject({
        usedAmount: '7.999',
        remainingAmount: '0.000',
      });
      if (releaseCoverage) {
        const balanceKey = {
          patientId_policyId: { patientId, policyId: policy.id },
        };
        const journalKey = `adjustment:${hospitalId}:${credit.id}`;
        await db.insuranceCoverageBalance.update({
          where: balanceKey,
          data: { usedAmount: '4.000' },
        });
        await expect(approve(reviewerId)).rejects.toThrow(
          'coverage balance requires reconciliation',
        );
        expect(
          await db.accountingEntry.count({ where: { postingKey: journalKey } }),
        ).toBe(0);
        expect(
          await db.invoiceAdjustment.findUniqueOrThrow({
            where: { id: credit.id },
          }),
        ).toMatchObject({ status: 'PENDING' });
        await db.insuranceCoverageBalance.update({
          where: balanceKey,
          data: { usedAmount: '7.999' },
        });
      }
      const [approved, replay] = await Promise.all([
        approve(reviewerId),
        approve(reviewerId),
      ]);
      expect(approved.postingEntryId).toBe(replay.postingEntryId);
      expect(await coverage()).toMatchObject(
        releaseCoverage
          ? { usedAmount: '2.666', remainingAmount: '5.333' }
          : { usedAmount: '7.999', remainingAmount: '0.000' },
      );
      if (releaseCoverage) {
        const next = await createPrepaid();
        expect(next.prepaidInvoiceId).toEqual(expect.any(Number));
        expect(await coverage()).toMatchObject({
          usedAmount: '5.332',
          remainingAmount: '2.667',
        });
      } else {
        await expect(createPrepaid()).rejects.toThrow('سقف التغطية');
      }
      expect(await service.list(hospitalId, invoiceId)).toMatchObject({
        effectivePatientShare: '0.667',
        effectiveInsuranceShare: '2.666',
        patientCredit: '1.333',
        partialDispenseQuote: null,
      });
      const original = await db.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      expect(original.totalAmount.toFixed(3)).toBe('9.999');
      expect(original.insuranceShare.toFixed(3)).toBe('7.999');

      const refunds = app.get(InvoiceRefundsService);
      const refundRequest = {
        adjustmentId: credit.id,
        paymentId: paymentId!,
        requestId: randomUUID(),
        reason: 'Unused medication quantities',
      };
      await expect(
        refunds.request(hospitalId, invoiceId, userId, {
          ...refundRequest,
          amount: '1.334',
        }),
      ).rejects.toThrow('يتجاوز الرصيد');
      const refund = await refunds.request(hospitalId, invoiceId, userId, {
        ...refundRequest,
        amount: '1.333',
      });
      await refunds.review(
        hospitalId,
        invoiceId,
        refund.id,
        reviewerId,
        'APPROVE',
        'Validated refund against the receipt',
      );
      await refunds.prepare(
        hospitalId,
        invoiceId,
        refund.id,
        userId,
        randomUUID(),
      );
      await refunds.execute(hospitalId, invoiceId, refund.id, userId, {
        reference: 'PARTIAL-RX-REFUND',
        evidence: 'Synthetic proof of transfer',
        requestId: randomUUID(),
        confirmedPaid: true,
      });
      expect(await refunds.list(hospitalId, invoiceId)).toMatchObject({
        patientCredit: '0.000',
        refundedAmount: '1.333',
      });

      if (collectionMode === 'batch') {
        await insurance.updateClaimsStatus(
          hospitalId,
          [invoiceId],
          'SUBMITTED',
          undefined,
          userId,
        );
        const settle = (amount: string) =>
          insurance.postInsuranceSettlement(hospitalId, userId, {
            providerId: provider.id,
            invoiceIds: [invoiceId],
            amount,
            allocations: [{ invoiceId, amount }],
            bankReference: 'PARTIAL-RX-INSURER-TRANSFER',
            confirmed: true,
          });
        await expect(settle('2.667')).rejects.toThrow('يتجاوز الرصيد');
        await settle('2.666');
        expect(
          await insurance.getClaims(hospitalId, { providerId: provider.id }),
        ).toContainEqual(
          expect.objectContaining({
            id: invoiceId,
            claimStatus: 'PAID',
            settlementEffectiveShare: '2.666',
            settlementEffectivePatientShare: '0.667',
            settlementOutstanding: '0.000',
          }),
        );
        return;
      }

      const claim = await claims.createClaim(hospitalId, invoiceId);
      expect(claim.claimedAmount.toFixed(3)).toBe('2.666');
      expect(await claims.getClaimById(claim.id, hospitalId)).toMatchObject({
        effectiveClaimedAmount: '2.666',
      });
      await claims.updateClaimStatus(
        claim.id,
        'SUBMITTED',
        'Synthetic submission',
        userId,
        hospitalId,
      );
      const collect = (paidAmount: string) =>
        claims.postPayment(
          claim.id,
          { requestId: randomUUID(), paidAmount },
          hospitalId,
          userId,
        );
      await expect(collect('2.667')).rejects.toThrow();
      await collect('2.666');
      expect(
        (await db.claim.findUniqueOrThrow({ where: { id: claim.id } })).status,
      ).toBe('PAID');
    },
  );

  const submitInsuredClaim = async (accountId?: number) => {
    const { patientId, provider } = await attachInsurance('0.2');
    if (accountId != null) {
      await db.insuranceProvider.update({
        where: { id: provider.id },
        data: { accountId },
      });
    }
    const rx = await createPrepaid();
    const invoiceId = rx.prepaidInvoiceId!;
    await app.get(CashierService).recordPayment({
      hospitalId,
      invoiceId,
      userId,
      amount: 0.667,
      method: 'TRANSFER',
    });
    const pharmacy = app.get(PharmacyService);
    await pharmacy.verifyOrder(rx.id, userId, hospitalId);
    await pharmacy.dispensePrescription({
      hospitalId,
      prescriptionId: rx.id,
      pharmacistId: userId,
    });
    const claims = app.get(ClaimService);
    const claim = await claims.createClaim(hospitalId, invoiceId);
    await claims.updateClaimStatus(
      claim.id,
      'SUBMITTED',
      'Synthetic submission',
      userId,
      hospitalId,
    );
    return { claims, claim, invoiceId, patientId, rx, provider };
  };

  it('credits only the insurer on a fully dispensed prescription and settles its corrected balance', async () => {
    const { provider, patientId } = await attachInsurance('0.2');
    const rx = await createPrepaid();
    const invoiceId = rx.prepaidInvoiceId!;
    const { service, dto } = await cancelPrepaid(invoiceId);
    const credit = {
      ...dto,
      correctedAmount: '2.000',
      insuranceOnly: true,
      reason: 'Verified overstatement of the insurer share',
    };
    await expect(
      service.request(hospitalId, invoiceId, userId, credit),
    ).rejects.toThrow('صُرفت بالكامل');
    await app.get(CashierService).recordPayment({
      hospitalId,
      invoiceId,
      userId,
      amount: 0.667,
      method: 'TRANSFER',
    });
    const pharmacy = app.get(PharmacyService);
    await pharmacy.verifyOrder(rx.id, userId, hospitalId);
    await pharmacy.dispensePrescription({
      hospitalId,
      prescriptionId: rx.id,
      pharmacistId: userId,
    });
    const insurance = app.get(InsuranceService);
    await insurance.updateClaimsStatus(
      hospitalId,
      [invoiceId],
      'SUBMITTED',
      undefined,
      userId,
    );
    const transfer = {
      providerId: provider.id,
      invoiceIds: [invoiceId],
      amount: '1.200',
      allocations: [{ invoiceId, amount: '1.200' }],
      bankReference: 'INS-CREDIT-FIRST',
      confirmed: true,
    };
    const originalCollection = await insurance.postInsuranceSettlement(
      hospitalId,
      userId,
      transfer,
    );
    const before = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(await service.list(hospitalId, invoiceId)).toMatchObject({
      eligible: false,
      eligibleInsuranceCredit: true,
      insuranceNetCollected: '1.200',
    });
    await expect(
      service.request(hospitalId, invoiceId, userId, {
        ...credit,
        correctedAmount: '1.199',
      }),
    ).rejects.toThrow('وثّق رد الفرق');
    const requested = await service.request(
      hospitalId,
      invoiceId,
      userId,
      credit,
    );
    expect(
      await service.request(hospitalId, invoiceId, userId, credit),
    ).toMatchObject({ id: requested.id });
    const review = (actor = reviewerId) =>
      service.review(
        hospitalId,
        invoiceId,
        requested.id,
        actor,
        'POST',
        'Verified prices and bank records',
      );
    await expect(review(userId)).rejects.toThrow('موظفًا آخر');
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(review()).rejects.toThrow('فترة مالية مفتوحة');
    await db.financialPeriod.updateMany({ data: { isOpen: true } });
    const [approved, replay] = await Promise.all([review(), review()]);
    expect(approved).toEqual(replay);
    expect(approved).toMatchObject({
      status: 'POSTED',
      insuranceOnly: true,
      delta: new Prisma.Decimal('0.000'),
      insuranceDelta: new Prisma.Decimal('-0.666'),
    });
    const adjustmentEntry = await db.accountingEntry.findUniqueOrThrow({
      where: { id: approved.postingEntryId! },
      include: { lines: { include: { account: true } } },
    });
    const originalAR = await db.accountingEntryLine.findUniqueOrThrow({
      where: { id: originalCollection.allocations[0].originalReceivableId },
    });
    expect(adjustmentEntry.lines).toHaveLength(2);
    expect(
      adjustmentEntry.lines
        .find((line) => line.accountId === originalAR.accountId)
        ?.credit.toFixed(3),
    ).toBe('0.666');
    expect(
      adjustmentEntry.lines
        .find((line) => line.account.type === 'REVENUE')
        ?.debit.toFixed(3),
    ).toBe('0.666');
    expect(await service.list(hospitalId, invoiceId)).toMatchObject({
      effectiveInsuranceShare: '2.000',
      effectivePatientShare: '0.667',
      patientCredit: '0.000',
    });
    expect(
      await insurance.getClaims(hospitalId, { status: 'PARTIALLY_PAID' }),
    ).toContainEqual(
      expect.objectContaining({
        id: invoiceId,
        settlementEffectiveShare: '2.000',
        settlementOutstanding: '0.800',
      }),
    );
    const remaining = await insurance.postInsuranceSettlement(
      hospitalId,
      userId,
      {
        ...transfer,
        amount: '0.800',
        allocations: undefined,
        bankReference: 'INS-CREDIT-REMAINING',
      },
    );
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toMatchObject({
      status: 'PAID',
      claimStatus: 'PAID',
      paidAmount: before.paidAmount,
      insuranceShare: before.insuranceShare,
      patientShare: before.patientShare,
    });
    const refund = await insurance.requestSettlementRefund(
      hospitalId,
      remaining.id,
      userId,
      {
        requestId: randomUUID(),
        reason: 'Insurer returned part of the second transfer',
        lines: [{ allocationId: remaining.allocations[0].id, amount: '0.500' }],
      },
    );
    await insurance.reviewSettlementRefund(
      hospitalId,
      remaining.id,
      reviewerId,
      refund.id,
      {
        decision: 'POST',
        note: 'Verified bank transfer for insurer refund',
        bankReference: 'INS-CREDIT-REFUND',
        confirmed: true,
      },
    );
    expect(
      await insurance.getClaims(hospitalId, { status: 'PARTIALLY_PAID' }),
    ).toContainEqual(
      expect.objectContaining({
        id: invoiceId,
        settlementEffectiveShare: '2.000',
        settlementOutstanding: '0.500',
      }),
    );
    for (const [settlement, amount] of [
      [originalCollection, '1.200'],
      [remaining, '0.300'],
    ] as const) {
      const refundBalance = await insurance.requestSettlementRefund(
        hospitalId,
        settlement.id,
        userId,
        {
          requestId: randomUUID(),
          reason: 'Return the remaining insurer balance',
          lines: [{ allocationId: settlement.allocations[0].id, amount }],
        },
      );
      await insurance.reviewSettlementRefund(
        hospitalId,
        settlement.id,
        reviewerId,
        refundBalance.id,
        {
          decision: 'POST',
          note: 'Verified bank transfer for final refund',
          bankReference: `INS-CREDIT-FINAL-REFUND-${settlement.id}`,
          confirmed: true,
        },
      );
    }
    await insurance.recordClaimWithdrawal(hospitalId, invoiceId, reviewerId, {
      payerReference: 'INS-CREDIT-WITHDRAWAL',
      reason: 'Verified insurer withdrawal after refund',
      confirmed: true,
    });
    const clear = await service.request(hospitalId, invoiceId, userId, {
      ...credit,
      requestId: randomUUID(),
      correctedAmount: '0.000',
    });
    await service.review(
      hospitalId,
      invoiceId,
      clear.id,
      reviewerId,
      'POST',
      'Verified withdrawal and full refund',
    );
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toMatchObject({
      claimStatus: 'WITHDRAWN',
      paidAmount: before.paidAmount,
    });
    expect(await service.list(hospitalId, invoiceId)).toMatchObject({
      effectiveInsuranceShare: '0.000',
      effectivePatientShare: '0.667',
      insuranceNetCollected: '0.000',
    });
    expect(
      await db.prescription.findUniqueOrThrow({ where: { id: rx.id } }),
    ).toMatchObject({ status: 'COMPLETED' });
    expect(
      await db.dispenseRecord.count({ where: { prescriptionId: rx.id } }),
    ).toBe(1);
    expect(
      await insurance.getPatientCoverageBalance(hospitalId, patientId),
    ).toMatchObject({ usedAmount: '2.666' });
  });

  it('uses the original individual claim receivable after a remap and applies insurer credits to the receipt balance', async () => {
    const original = await db.account.create({
      data: {
        hospitalId,
        code: 'ORIGINAL-INSURER-AR',
        name: 'Synthetic original receivable',
        type: 'ASSET',
      },
    });
    const { claims, claim, invoiceId, provider, patientId, rx } =
      await submitInsuredClaim(original.id);
    await db.insuranceProvider.update({
      where: { id: provider.id },
      data: { accountId: null },
    });
    const collect = (paidAmount: string) =>
      claims.postPayment(
        claim.id,
        { requestId: randomUUID(), paidAmount },
        hospitalId,
        userId,
      );
    await collect('1.200');
    const receipt = await db.claimReceipt.findFirstOrThrow({
      where: { claimId: claim.id },
    });
    const receiptEntry = await db.accountingEntry.findUniqueOrThrow({
      where: { postingKey: `claim-receipt:${hospitalId}:${receipt.id}` },
      include: { lines: true },
    });
    expect(
      receiptEntry.lines
        .find((line) => line.accountId === original.id)
        ?.credit.toFixed(3),
    ).toBe('1.200');
    const origJournal = await db.accountingEntry.findUniqueOrThrow({
      where: { postingKey: `invoice:${hospitalId}:${invoiceId}` },
    });
    await expect(
      app
        .get(AccountingService)
        .reverseEntry(hospitalId, origJournal.id, userId, 'Synthetic reversal'),
    ).rejects.toThrow('تصحيح موثق');
    const { service, dto } = await cancelPrepaid(invoiceId);
    const credit = {
      ...dto,
      insuranceOnly: true,
      reason: 'Validated individual claim correction',
      correctedAmount: '2.000',
    };
    expect(await service.list(hospitalId, invoiceId)).toMatchObject({
      eligibleInsuranceCredit: true,
      insuranceNetCollected: '1.200',
    });
    await expect(
      service.request(hospitalId, invoiceId, userId, {
        ...credit,
        correctedAmount: '1.199',
      }),
    ).rejects.toThrow('وثّق رد الفرق');
    const correction = await service.request(
      hospitalId,
      invoiceId,
      userId,
      credit,
    );
    await expect(collect('0.100')).rejects.toThrow('قبل التحصيل');
    await expect(
      service.review(
        hospitalId,
        invoiceId,
        correction.id,
        userId,
        'POST',
        'Synthetic review',
      ),
    ).rejects.toThrow('موظفًا آخر');
    const posted = await service.review(
      hospitalId,
      invoiceId,
      correction.id,
      reviewerId,
      'POST',
      'Verified individual claim and receipt',
    );
    const journal = await db.accountingEntry.findUniqueOrThrow({
      where: { id: posted.postingEntryId! },
      include: { lines: true },
    });
    expect(
      journal.lines
        .find((line) => line.accountId === original.id)
        ?.credit.toFixed(3),
    ).toBe('0.666');
    expect(await claims.getClaimById(claim.id, hospitalId)).toMatchObject({
      claimedAmount: new Prisma.Decimal('2.666'),
      effectiveClaimedAmount: '2.000',
      status: 'PARTIALLY_PAID',
    });
    await expect(collect('0.801')).rejects.toThrow('يتجاوز متبقي');
    await expect(collect('0.800')).resolves.toMatchObject({
      status: 'PAID',
      paidAmount: new Prisma.Decimal('2.000'),
    });
    const insurance = app.get(InsuranceService);
    const refund = await insurance.requestClaimReceiptRefund(
      hospitalId,
      invoiceId,
      userId,
      {
        receiptId: receipt.id,
        requestId: randomUUID(),
        amount: '0.500',
        reason: 'Verified external insurer refund',
      },
    );
    await insurance.reviewClaimReceiptRefund(
      hospitalId,
      invoiceId,
      reviewerId,
      refund.id,
      {
        decision: 'POST',
        note: 'Verified external insurer transfer',
        bankReference: 'IND-AR-REFUND',
        confirmed: true,
      },
    );
    expect(await claims.getClaimById(claim.id, hospitalId)).toMatchObject({
      effectiveClaimedAmount: '2.000',
      status: 'PARTIALLY_PAID',
      paidAmount: new Prisma.Decimal('1.500'),
    });
    expect(
      await insurance.getClaims(hospitalId, { status: 'PARTIALLY_PAID' }),
    ).toContainEqual(
      expect.objectContaining({
        id: invoiceId,
        settlementEffectiveShare: '2.000',
        settlementOutstanding: '0.500',
      }),
    );
    expect(
      await db.prescription.findUniqueOrThrow({ where: { id: rx.id } }),
    ).toMatchObject({ status: 'COMPLETED' });
    expect(
      await insurance.getPatientCoverageBalance(hospitalId, patientId),
    ).toMatchObject({ usedAmount: '2.666' });
  });

  const withdrawalInput = {
    payerReference: 'INSURER-ACK-0001',
    reason: 'Synthetic insurer confirmation of withdrawal',
    confirmed: true,
  };

  it('records an insurer-confirmed withdrawal once, without releasing the coverage of dispensed care', async () => {
    const { claims, claim, invoiceId, patientId, rx } =
      await submitInsuredClaim();
    const insurance = app.get(InsuranceService);
    const entries = await db.accountingEntry.count({ where: { hospitalId } });
    const manager = await new AuthHelper(
      db,
      app.get(JwtService),
    ).createTestUser('withdrawal-manager', 'synthetic', {
      hospitalId,
      permissions: ['insurance:manage'],
    });
    const submit = (payload = withdrawalInput, access = manager.accessToken) =>
      request(app.getHttpServer())
        .post(`/insurance/claims/${invoiceId}/withdrawal`)
        .auth(access, { type: 'bearer' })
        .send(payload);
    await submit(withdrawalInput, token).expect(403);
    await submit({ ...withdrawalInput, confirmed: false }).expect(400);
    await expect(
      claims.updateClaimStatus(claim.id, 'VOID', reason, userId, hospitalId),
    ).rejects.toThrow('تأكيد شركة التأمين');
    await Promise.all([submit().expect(201), submit().expect(201)]);
    await submit({
      ...withdrawalInput,
      payerReference: 'DIFFERENT-ACK',
    }).expect(409);
    expect(
      await db.insuranceClaimWithdrawal.count({ where: { invoiceId } }),
    ).toBe(1);
    expect(
      await db.claim.findUniqueOrThrow({ where: { id: claim.id } }),
    ).toMatchObject({ status: 'VOID' });
    expect(
      await db.claimHistory.count({
        where: { claimId: claim.id, toStatus: 'VOID' },
      }),
    ).toBe(1);
    expect(await db.accountingEntry.count({ where: { hospitalId } })).toBe(
      entries,
    );
    expect(
      await insurance.getPatientCoverageBalance(hospitalId, patientId),
    ).toMatchObject({ usedAmount: '2.666' });
    expect(
      await db.prescription.findUniqueOrThrow({ where: { id: rx.id } }),
    ).toMatchObject({ status: 'COMPLETED' });
    expect(
      await insurance.getClaims(hospitalId, { status: 'WITHDRAWN' }),
    ).toContainEqual(
      expect.objectContaining({ id: invoiceId, claimStatus: 'WITHDRAWN' }),
    );
    await expect(claims.createClaim(hospitalId, invoiceId)).rejects.toThrow(
      'مسحوبة',
    );
    await expect(
      claims.postPayment(
        claim.id,
        { requestId: randomUUID(), paidAmount: '0.500' },
        hospitalId,
        userId,
      ),
    ).rejects.toThrow('لا تسمح بالتحصيل');
    await expect(
      insurance.updateClaimsStatus(hospitalId, [invoiceId], 'SUBMITTED'),
    ).rejects.toThrow('مسحوبة');
    await expect(
      db.claim.update({
        where: { id: claim.id },
        data: { status: 'SUBMITTED' },
      }),
    ).rejects.toThrow('cannot be reopened');
  });

  it('routes a partially collected claim away from withdrawal without changing its receipt or balance', async () => {
    const { claims, claim, invoiceId, patientId } = await submitInsuredClaim();
    await claims.postPayment(
      claim.id,
      { requestId: randomUUID(), paidAmount: '0.500' },
      hospitalId,
      userId,
    );
    const insurance = app.get(InsuranceService);
    await expect(
      insurance.recordClaimWithdrawal(
        hospitalId,
        invoiceId,
        reviewerId,
        withdrawalInput,
      ),
    ).rejects.toThrow('مسار رد مستقل');
    expect(
      await db.insuranceClaimWithdrawal.count({ where: { invoiceId } }),
    ).toBe(0);
    expect(await db.claimReceipt.count({ where: { claimId: claim.id } })).toBe(
      1,
    );
    expect(
      await db.claim.findUniqueOrThrow({ where: { id: claim.id } }),
    ).toMatchObject({ status: 'PARTIALLY_PAID' });
    expect(
      await insurance.getPatientCoverageBalance(hospitalId, patientId),
    ).toMatchObject({ usedAmount: '2.666' });
  });

  it('reserves and posts exact insurer bank refunds with independent review and immutable receipts', async () => {
    const { claims, claim, invoiceId, patientId } = await submitInsuredClaim();
    await claims.postPayment(
      claim.id,
      { requestId: randomUUID(), paidAmount: '2.666' },
      hospitalId,
      userId,
    );
    const receipt = await db.claimReceipt.findFirstOrThrow({
      where: { claimId: claim.id },
    });
    const original = await db.accountingEntry.findFirstOrThrow({
      where: { postingKey: `claim-receipt:${hospitalId}:${receipt.id}` },
      include: { lines: true },
    });
    const auth = new AuthHelper(db, app.get(JwtService));
    const requester = await auth.createTestUser(
      'refund-requester',
      'synthetic',
      { hospitalId, permissions: ['insurance:manage'] },
    );
    const reviewer = await auth.createTestUser('refund-reviewer', 'synthetic', {
      hospitalId,
      permissions: ['insurance:manage'],
    });
    const url = `/insurance/claims/${invoiceId}/receipt-refunds`;
    const create = (payload: object, access = requester.accessToken) =>
      request(app.getHttpServer())
        .post(url)
        .auth(access, { type: 'bearer' })
        .send(payload);
    const review = (
      id: number,
      payload: object,
      access = reviewer.accessToken,
    ) =>
      request(app.getHttpServer())
        .post(`${url}/${id}/review`)
        .auth(access, { type: 'bearer' })
        .send(payload);
    const payload = {
      receiptId: receipt.id,
      requestId: randomUUID(),
      amount: '2.000',
      reason: 'Synthetic mistaken transfer',
    };
    await create(payload, token).expect(403);
    await create({ ...payload, amount: 2 }).expect(400);
    const [first, competing] = await Promise.all([
      create(payload),
      create({ ...payload, requestId: randomUUID() }),
    ]);
    expect([first.status, competing.status].sort()).toEqual([201, 400]);
    const pending = first.status === 201 ? first : competing;
    const { id } = pending.body as { id: number };
    const approval = {
      decision: 'POST',
      note: 'Matched external payment proof',
      bankReference: 'TEST-BANK-001',
      confirmed: true,
    };
    await review(id, approval, requester.accessToken).expect(403);
    await review(id, { ...approval, confirmed: false }).expect(400);
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await review(id, approval).expect(400);
    expect(
      await db.claimReceiptRefund.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ status: 'PENDING', postingEntryId: null });
    await db.financialPeriod.updateMany({ data: { isOpen: true } });
    const [posted, replay] = await Promise.all([
      review(id, approval).expect(201),
      review(id, approval).expect(201),
    ]);
    expect(replay.body).toEqual(posted.body);
    const journal = await db.accountingEntry.findUniqueOrThrow({
      where: { id: (posted.body as { postingEntryId: number }).postingEntryId },
      include: { lines: true },
    });
    await expect(
      app
        .get(AccountingService)
        .reverseEntry(
          hospitalId,
          journal.id,
          userId,
          'Synthetic manual reversal',
        ),
    ).rejects.toThrow('قيد التسوية المعتمدة محمي');
    const bankAccount = original.lines.find((line) =>
      line.debit.gt(0),
    )!.accountId;
    const receivable = original.lines.find((line) =>
      line.credit.gt(0),
    )!.accountId;
    expect(
      journal.lines.map((line) => [
        line.accountId,
        line.debit.toFixed(3),
        line.credit.toFixed(3),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [receivable, '2.000', '0.000'],
        [bankAccount, '0.000', '2.000'],
      ]),
    );
    expect(
      await db.claim.findUniqueOrThrow({ where: { id: claim.id } }),
    ).toMatchObject({
      status: 'PARTIALLY_PAID',
      paidAmount: new Prisma.Decimal('0.666'),
    });
    const remainder = await create({
      ...payload,
      requestId: randomUUID(),
      amount: '0.666',
    }).expect(201);
    await review((remainder.body as { id: number }).id, {
      decision: 'REJECT',
      note: 'Synthetic refund request rejected',
    }).expect(201);
    const replacement = await create({
      ...payload,
      requestId: randomUUID(),
      amount: '0.666',
    }).expect(201);
    const { id: replacementId } = replacement.body as { id: number };
    await review(replacementId, approval).expect(409);
    await review(replacementId, {
      ...approval,
      bankReference: 'TEST-BANK-002',
    }).expect(201);
    const beforeWithdrawal = await request(app.getHttpServer())
      .get(url)
      .auth(reviewer.accessToken, { type: 'bearer' })
      .expect(200);
    expect(beforeWithdrawal.body).toMatchObject({
      grossAmount: '2.666',
      refundedAmount: '2.666',
      netAmount: '0.000',
    });
    const insurance = app.get(InsuranceService);
    await insurance.recordClaimWithdrawal(
      hospitalId,
      invoiceId,
      reviewerId,
      withdrawalInput,
    );
    await review(id, approval).expect(201);
    expect(
      await db.claimReceipt.findUniqueOrThrow({ where: { id: receipt.id } }),
    ).toEqual(receipt);
    expect(
      await insurance.getPatientCoverageBalance(hospitalId, patientId),
    ).toMatchObject({ usedAmount: '2.666' });
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ).toMatchObject({
      claimStatus: 'WITHDRAWN',
      paidAmount: new Prisma.Decimal('0.667'),
    });
  });

  it('collects only the exact copay and makes the insurer claimable after dispensing', async () => {
    const { provider } = await attachInsurance('0.2');
    const rx = await createPrepaid();
    const invoiceId = rx.prepaidInvoiceId!;
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.patientShare.toFixed(3)).toBe('0.667');
    expect(invoice.insuranceShare.toFixed(3)).toBe('2.666');
    expect(invoice.insuranceProviderId).toBe(provider.id);
    const pharmacy = app.get(PharmacyService);
    const cashier = app.get(CashierService);
    const claim = app.get(ClaimService);
    const insurance = app.get(InsuranceService);
    const release = () =>
      pharmacy.dispensePrescription({
        hospitalId,
        prescriptionId: rx.id,
        pharmacistId: userId,
      });
    const collect = (amount: number) =>
      cashier.recordPayment({
        hospitalId,
        invoiceId,
        userId,
        amount,
        method: 'TRANSFER',
      });
    const queue = async () =>
      (await pharmacy.getWorklist(hospitalId)).data.map(({ id }) => id);
    await pharmacy.verifyOrder(rx.id, userId, hospitalId);
    await expect(collect(3.333)).rejects.toThrow('تتجاوز المستحق');
    await collect(0.111);
    expect(await queue()).not.toContain(rx.id);
    await expect(release()).rejects.toThrow('الخزينة');
    await collect(0.556);
    expect(await queue()).toContain(rx.id);
    await expect(claim.createClaim(hospitalId, invoiceId)).rejects.toThrow(
      'قبل إصدار المطالبة',
    );
    expect(await insurance.getClaims(hospitalId, {})).not.toContainEqual(
      expect.objectContaining({ id: invoiceId }),
    );
    await expect(
      insurance.updateClaimsStatus(hospitalId, [invoiceId], 'SUBMITTED'),
    ).rejects.toThrow('تنفيذ الصرف');
    await release();
    expect(
      await insurance.getClaims(hospitalId, { status: 'PENDING' }),
    ).toContainEqual(expect.objectContaining({ id: invoiceId }));
    expect(
      (await claim.createClaim(hospitalId, invoiceId)).claimedAmount.toFixed(3),
    ).toBe('2.666');
    expect(await db.encounterCharge.count({ where: { invoiceId } })).toBe(1);
  });

  it('requires one valid sufficient authorization and a cashier confirmation for full coverage', async () => {
    const { patientId, policy, service } = await attachInsurance('0', true);
    const manager = await new AuthHelper(
      db,
      app.get(JwtService),
    ).createTestUser('preauth-manager', 'synthetic', {
      hospitalId,
      permissions: ['insurance:manage'],
    });
    const server = app.getHttpServer();
    const serviceList = await request(server)
      .get('/insurance/pre-auth/services')
      .auth(manager.accessToken, { type: 'bearer' })
      .expect(200);
    expect(serviceList.body).toContainEqual(
      expect.objectContaining({ id: service.id }),
    );
    await request(server)
      .post('/insurance/pre-auth')
      .auth(manager.accessToken, { type: 'bearer' })
      .send({
        patientId,
        policyId: policy.id,
        serviceItemId: service.id,
        requestedAmount: '3.333',
      })
      .expect(201);
    const auth = await db.preAuthorization.findFirstOrThrow({
      where: { patientId, policyId: policy.id, serviceItemId: service.id },
    });
    const approve = (approvedAmount: string | null) =>
      request(server)
        .patch(`/insurance/pre-auth/${auth.id}`)
        .auth(manager.accessToken, { type: 'bearer' })
        .send({
          status: 'APPROVED',
          authCode: 'SYNTH-PHARM',
          approvedAmount,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        });
    await approve(null).expect(400);
    await approve('3.332').expect(200);
    await approve('3.333').expect(200);
    const rx = await createPrepaid();
    expect(rx.preAuthorizationId).toBe(auth.id);
    const next = await createPrepaid();
    expect(next).toMatchObject({ status: 'DRAFT', prepaidInvoiceId: null });
    expect(next.preAuthorizationId).not.toBe(auth.id);
    const invoiceId = rx.prepaidInvoiceId!;
    const pharmacy = app.get(PharmacyService);
    const cashier = app.get(CashierService);
    const collect = () =>
      cashier.recordPayment({
        hospitalId,
        invoiceId,
        userId,
        amount: 0,
        method: 'CASH',
      });
    const queue = async () =>
      (await pharmacy.getWorklist(hospitalId)).data.map(({ id }) => id);
    expect(await queue()).not.toContain(rx.id);
    expect(await cashier.getWorklist(hospitalId)).toContainEqual(
      expect.objectContaining({ id: invoiceId, patientShare: 0 }),
    );
    await db.preAuthorization.update({
      where: { id: auth.id },
      data: { status: 'REJECTED' },
    });
    await expect(collect()).rejects.toThrow('الموافقة التأمينية');
    await db.preAuthorization.update({
      where: { id: auth.id },
      data: { status: 'APPROVED' },
    });
    await collect();
    expect(await db.payment.count({ where: { invoiceId } })).toBe(0);
    expect(await queue()).toContain(rx.id);
    await pharmacy.verifyOrder(rx.id, userId, hospitalId);
    await db.preAuthorization.update({
      where: { id: auth.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await queue()).not.toContain(rx.id);
    await expect(
      pharmacy.dispensePrescription({
        hospitalId,
        prescriptionId: rx.id,
        pharmacistId: userId,
      }),
    ).rejects.toThrow('الموافقة التأمينية');
    expect(
      await db.dispenseRecord.count({ where: { prescriptionId: rx.id } }),
    ).toBe(0);
  });

  it('keeps a prescription through refusal and atomically invoices one approval on concurrent retries', async () => {
    const { service } = await attachInsurance('0.2', true);
    const rx = await createPrepaid();
    expect(rx).toMatchObject({ status: 'DRAFT', prepaidInvoiceId: null });
    const authId = rx.preAuthorizationId!;
    const pharmacy = app.get(PharmacyService);
    const cashier = app.get(CashierService);
    expect(
      await db.preAuthorization.findUniqueOrThrow({ where: { id: authId } }),
    ).toMatchObject({
      isPrescriptionRequest: true,
      status: 'PENDING',
      serviceItemId: service.id,
    });
    expect(await db.invoice.count({ where: { encounterId } })).toBe(0);
    expect(await db.encounterCharge.count({ where: { encounterId } })).toBe(0);
    expect(
      await app.get(FhirService).getMedicationRequest(rx.id, rx.patientId),
    ).toMatchObject({ status: 'draft' });
    expect(
      await app.get(PatientPortalService).getMedications(rx.patientId),
    ).not.toContainEqual(expect.objectContaining({ id: rx.id }));
    expect((await pharmacy.getWorklist(hospitalId)).data).not.toContainEqual(
      expect.objectContaining({ id: rx.id }),
    );
    await expect(
      pharmacy.verifyOrder(rx.id, userId, hospitalId),
    ).rejects.toThrow('غير متاحة');
    const manager = await new AuthHelper(
      db,
      app.get(JwtService),
    ).createTestUser('draft-preauth-manager', 'synthetic', {
      hospitalId,
      permissions: ['insurance:manage'],
    });
    const server = app.getHttpServer();
    const update = (payload: object, access = manager.accessToken) =>
      request(server)
        .patch(`/insurance/pre-auth/${authId}`)
        .auth(access, { type: 'bearer' })
        .send(payload);
    const listed = await request(server)
      .get('/insurance/pre-auth')
      .auth(manager.accessToken, { type: 'bearer' })
      .expect(200);
    const entries = listed.body as { id: number; prescription: unknown }[];
    expect(entries.find(({ id }) => id === authId)?.prescription).toMatchObject(
      {
        id: rx.id,
        status: 'DRAFT',
      },
    );
    const rejected = {
      status: 'REJECTED',
      decisionReason: 'Synthetic insurer denial',
    };
    await update(rejected, token).expect(403);
    await update({ status: 'REJECTED' }).expect(400);
    await update(rejected).expect(200);
    const history = await pharmacy.getEncounterPrescriptions(
      hospitalId,
      encounterId,
    );
    expect(
      history.find(({ id }) => id === rx.id)?.preAuthorization,
    ).toMatchObject(rejected);
    const approval = {
      status: 'APPROVED',
      decisionReason: 'Synthetic insurer reconsideration',
      authCode: 'SYNTHETIC-RX',
      approvedAmount: '2.666',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    await update({ ...approval, approvedAmount: '2.665' }).expect(400);
    await update({
      ...approval,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }).expect(400);
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await update(approval).expect(400);
    expect(await db.invoice.count({ where: { encounterId } })).toBe(0);
    expect(
      await db.preAuthorization.findUniqueOrThrow({ where: { id: authId } }),
    ).toMatchObject(rejected);
    await db.financialPeriod.updateMany({ data: { isOpen: true } });
    await db.product.update({
      where: { id: productId },
      data: { sellPrice: '8.000' },
    });
    await Promise.all([
      update(approval).expect(200),
      update(approval).expect(200),
    ]);
    const result = await db.prescription.findUniqueOrThrow({
      where: { id: rx.id },
      include: { prepaidInvoice: true },
    });
    expect(result).toMatchObject({
      status: 'ACTIVE',
      preAuthorizationId: authId,
    });
    expect(result.prepaidInvoice?.totalAmount.toFixed(3)).toBe('3.333');
    expect(result.prepaidInvoice?.patientShare.toFixed(3)).toBe('0.667');
    expect(await db.invoice.count({ where: { encounterId } })).toBe(1);
    expect(await db.encounterCharge.count({ where: { encounterId } })).toBe(1);
    expect(
      await db.auditLog.count({
        where: {
          hospitalId,
          entityId: rx.id,
          action: 'PRESCRIPTION_AUTHORIZATION_APPROVED',
        },
      }),
    ).toBe(1);
    expect(await cashier.getWorklist(hospitalId)).toContainEqual(
      expect.objectContaining({
        id: result.prepaidInvoiceId,
        prescriptionId: rx.id,
        patientShare: 0.667,
      }),
    );
    expect((await pharmacy.getWorklist(hospitalId)).data).not.toContainEqual(
      expect.objectContaining({ id: rx.id }),
    );
  });

  it('keeps the invalid-policy guard and reuses only coverage released by cancellation', async () => {
    const { policy, patientId } = await attachInsurance('0.2');
    await db.insurancePolicy.update({
      where: { id: policy.id },
      data: { isActive: false },
    });
    await expect(createPrepaid()).rejects.toThrow('سريان بوليصة');
    await db.insurancePolicy.update({
      where: { id: policy.id },
      data: { isActive: true, maxCoverageAmount: '4.000' },
    });
    const results = await Promise.allSettled([
      createPrepaid(),
      createPrepaid(),
    ]);
    const successes = results.flatMap((item) =>
      item.status === 'fulfilled' ? [item.value] : [],
    );
    expect(successes).toHaveLength(1);
    expect(await db.invoice.count({ where: { encounterId } })).toBe(1);
    await expect(createPrepaid()).rejects.toThrow('1.334');
    const insurance = app.get(InsuranceService);
    expect(
      await insurance.getPatientCoverageBalance(hospitalId, patientId),
    ).toMatchObject({
      cap: '4.000',
      usedAmount: '2.666',
      remainingAmount: '1.334',
    });
    const manager = await new AuthHelper(
      db,
      app.get(JwtService),
    ).createTestUser('coverage-reader', 'synthetic', {
      hospitalId,
      permissions: ['insurance:view'],
    });
    const route = `/insurance/coverage-balance/${patientId}`;
    await request(app.getHttpServer())
      .get(route)
      .auth(token, { type: 'bearer' })
      .expect(403);
    const balance = await request(app.getHttpServer())
      .get(route)
      .auth(manager.accessToken, { type: 'bearer' })
      .expect(200);
    expect(balance.body).toMatchObject({
      policyId: policy.id,
      remainingAmount: '1.334',
    });
    await app
      .get(BillingService)
      .cancelInvoice(hospitalId, successes[0].prepaidInvoiceId!, userId);
    expect(
      await insurance.getPatientCoverageBalance(hospitalId, patientId),
    ).toMatchObject({
      usedAmount: '0.000',
      remainingAmount: '4.000',
    });
    await expect(createPrepaid()).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('enforces the cap for concurrent invoice writers and isolates members of the same policy', async () => {
    const { policy, provider, patientId } = await attachInsurance('0.2');
    await db.insurancePolicy.update({
      where: { id: policy.id },
      data: { maxCoverageAmount: '4.000' },
    });
    const data = {
      hospitalId,
      patientId,
      encounterId,
      insuranceProviderId: provider.id,
      status: 'ISSUED' as const,
      totalAmount: '3.333',
      insuranceShare: '2.666',
      patientShare: '0.667',
    };
    const outcomes = await Promise.allSettled([
      db.invoice.create({ data }),
      db.invoice.create({ data }),
    ]);
    const successes = outcomes.flatMap((item) =>
      item.status === 'fulfilled' ? [item.value] : [],
    );
    expect(successes).toHaveLength(1);
    expect(successes[0].coveragePolicyId).toBe(policy.id);
    expect(
      await db.insuranceCoverageBalance.count({ where: { patientId } }),
    ).toBe(1);
    await db.invoice.update({
      where: { id: successes[0].id },
      data: { claimStatus: 'SUBMITTED' },
    });
    await expect(
      db.invoice.update({
        where: { id: successes[0].id },
        data: { status: 'CANCELLED' },
      }),
    ).rejects.toThrow('Resolve the insurance claim');
    const other = await db.patient.create({
      data: {
        hospitalId,
        mrn: 'POLICY-MEMBER-2',
        fullName: 'Synthetic member',
        insurancePolicyId: policy.id,
      },
    });
    const encounter = await db.encounter.create({
      data: { hospitalId, patientId: other.id, type: 'OPD' },
    });
    const otherInvoice = {
      ...data,
      patientId: other.id,
      encounterId: encounter.id,
    };
    await expect(
      db.$transaction(async (tx) => {
        await tx.invoice.create({ data: otherInvoice });
        throw new Error('Synthetic posting failure');
      }),
    ).rejects.toThrow('Synthetic posting failure');
    expect(
      await db.insuranceCoverageBalance.count({
        where: { patientId: other.id },
      }),
    ).toBe(0);
    await expect(
      db.invoice.create({ data: otherInvoice }),
    ).resolves.toMatchObject({ coveragePolicyId: policy.id });
    const balances = await db.insuranceCoverageBalance.findMany({
      where: { policyId: policy.id },
    });
    expect(balances.map((entry) => entry.usedAmount.toFixed(3))).toEqual([
      '2.666',
      '2.666',
    ]);
  });

  it('requires reconciliation when a previous insurer share has no known policy attribution', async () => {
    const { policy, provider, patientId } = await attachInsurance('0.2');
    await db.patient.update({
      where: { id: patientId },
      data: { insurancePolicyId: null },
    });
    const legacy = await db.invoice.create({
      data: {
        hospitalId,
        patientId,
        encounterId,
        insuranceProviderId: provider.id,
        status: 'ISSUED',
        totalAmount: '3.333',
        insuranceShare: '2.666',
        patientShare: '0.667',
      },
    });
    expect(legacy.coveragePolicyId).toBeNull();
    await db.patient.update({
      where: { id: patientId },
      data: { insurancePolicyId: policy.id },
    });
    await db.insurancePolicy.update({
      where: { id: policy.id },
      data: { maxCoverageAmount: '4.000' },
    });
    await expect(createPrepaid()).rejects.toThrow('مطابقة');
    expect(
      await app
        .get(InsuranceService)
        .getPatientCoverageBalance(hospitalId, patientId),
    ).toMatchObject({ requiresReconciliation: true, remainingAmount: null });
  });

  const replacementBody = () => ({
    reason: 'Synthetic correction of the prescribed quantity',
    items: [
      {
        drugItemId: productId,
        dose: 'Synthetic corrected dose',
        route: 'ORAL',
        frequency: 'DAILY',
        durationDays: 2,
        quantity: 2,
      },
    ],
  });

  it('authorizes one replacement through HTTP and keeps the original credit available', async () => {
    const rx = await createPrepaid();
    const originalInvoiceId = rx.prepaidInvoiceId!;
    await app.get(CashierService).recordPayment({
      hospitalId,
      invoiceId: originalInvoiceId,
      userId,
      amount: 1.111,
      method: 'TRANSFER',
    });
    const { service, dto } = await cancelPrepaid(originalInvoiceId);
    const cancellation = await service.request(
      hospitalId,
      originalInvoiceId,
      userId,
      dto,
    );
    const doctor = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'replacement-doctor',
      'synthetic',
      {
        hospitalId,
        isDoctor: true,
        roles: ['DOCTOR'],
        permissions: ['pharmacy:prescriptions:replace'],
      },
    );
    const route = `/pharmacy/encounters/${encounterId}/prescriptions/${rx.id}/replacement`;
    const send = (access: string, data: object) =>
      request(app.getHttpServer())
        .post(route)
        .auth(access, { type: 'bearer' })
        .send(data);
    await send(token, replacementBody()).expect(403);
    await send(doctor.accessToken, replacementBody()).expect(400);
    await service.review(
      hospitalId,
      originalInvoiceId,
      cancellation.id,
      reviewerId,
      'POST',
      reason,
    );
    await send(doctor.accessToken, {
      ...replacementBody(),
      reason: '   ',
    }).expect(400);
    const payload = { ...replacementBody(), doctorId: reviewerId };
    const replies = await Promise.all([
      send(doctor.accessToken, payload),
      send(doctor.accessToken, payload),
    ]);
    expect(replies.map(({ status }) => status)).toEqual([201, 201]);
    const replacement = await db.prescription.findUniqueOrThrow({
      where: { replacesPrescriptionId: rx.id },
      include: { prepaidInvoice: true },
    });
    expect(replacement).toMatchObject({
      doctorId: doctor.user.id,
      pharmacistVerificationStatus: 'PENDING',
      replacementReason: payload.reason,
    });
    expect(replacement.prepaidInvoice?.totalAmount.toFixed(3)).toBe('6.666');
    expect(replacement.prepaidInvoice?.status).toBe('ISSUED');
    expect(await db.invoice.count({ where: { encounterId } })).toBe(2);
    await send(doctor.accessToken, {
      ...payload,
      reason: 'Changed after issuing',
    }).expect(409);
    expect(await service.list(hospitalId, originalInvoiceId)).toMatchObject({
      replacementPrescriptionInvoiceId: replacement.prepaidInvoiceId,
      patientCredit: '1.111',
    });
    expect(
      await service.list(hospitalId, replacement.prepaidInvoiceId!),
    ).toMatchObject({
      originalPrescriptionInvoiceId: originalInvoiceId,
      amountDue: '6.666',
    });
    expect(
      await app.get(CashierService).getWorklist(hospitalId),
    ).toContainEqual(
      expect.objectContaining({
        id: replacement.prepaidInvoiceId,
        prescriptionId: replacement.id,
      }),
    );
    const history = await app
      .get(PharmacyService)
      .getEncounterPrescriptions(hospitalId, encounterId);
    expect(history).toContainEqual(
      expect.objectContaining({
        id: rx.id,
        status: 'CANCELLED',
        replacement: {
          id: replacement.id,
          prepaidInvoiceId: replacement.prepaidInvoiceId,
        },
      }),
    );
    expect(
      await db.auditLog.count({
        where: {
          hospitalId,
          action: 'REPLACE_PREPAID_PRESCRIPTION',
          entity: 'Prescription',
          entityId: replacement.id,
        },
      }),
    ).toBe(1);
  });

  it('keeps an unpaid cancelled prescription eligible after a failed replacement posting', async () => {
    const rx = await createPrepaid();
    await app
      .get(BillingService)
      .cancelInvoice(hospitalId, rx.prepaidInvoiceId!, userId);
    const pharmacy = app.get(PharmacyService);
    const { items, reason: correctionReason } = replacementBody();
    const args = {
      hospitalId,
      encounterId,
      doctorId: userId,
      items,
      replacement: { originalId: rx.id, reason: correctionReason },
    };
    const encounter = await db.encounter.findUniqueOrThrow({
      where: { id: encounterId },
    });
    const otherEncounter = await db.encounter.create({
      data: { hospitalId, patientId: encounter.patientId, type: 'OPD' },
    });
    await expect(
      pharmacy.createPrescriptionForEncounter({
        ...args,
        encounterId: otherEncounter.id,
      }),
    ).rejects.toThrow('الوصفة الأصلية غير موجودة');
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(pharmacy.createPrescriptionForEncounter(args)).rejects.toThrow(
      'فترة مالية مفتوحة',
    );
    expect(
      await db.prescription.findUnique({
        where: { replacesPrescriptionId: rx.id },
      }),
    ).toBeNull();
    expect(await db.invoice.count({ where: { encounterId } })).toBe(1);
    await db.financialPeriod.updateMany({ data: { isOpen: true } });
    const replacement = await pharmacy.createPrescriptionForEncounter(args);
    expect(replacement).toMatchObject({
      replacesPrescriptionId: rx.id,
      status: 'ACTIVE',
    });
  });

  it('holds a settled prescription until review and releases it after rejection', async () => {
    const rx = await createPrepaid();
    const invoiceId = rx.prepaidInvoiceId!;
    const pharmacy = app.get(PharmacyService);
    await app.get(CashierService).recordPayment({
      hospitalId,
      invoiceId,
      userId,
      amount: 3.333,
      method: 'TRANSFER',
    });
    await pharmacy.verifyOrder(rx.id, userId, hospitalId);
    const { service, dto } = await cancelPrepaid(invoiceId);
    const pending = await service.request(hospitalId, invoiceId, userId, dto);
    expect((await pharmacy.getWorklist(hospitalId)).data).not.toContainEqual(
      expect.objectContaining({ id: rx.id }),
    );
    const release = () =>
      pharmacy.dispensePrescription({
        hospitalId,
        prescriptionId: rx.id,
        pharmacistId: userId,
      });
    await expect(release()).rejects.toThrow('الخزينة');
    await service.review(
      hospitalId,
      invoiceId,
      pending.id,
      reviewerId,
      'REJECT',
      reason,
    );
    expect((await pharmacy.getWorklist(hospitalId)).data).toContainEqual(
      expect.objectContaining({ id: rx.id }),
    );
    const results = await Promise.allSettled([
      service.request(hospitalId, invoiceId, userId, {
        ...dto,
        requestId: randomUUID(),
      }),
      release(),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const dispenses = await db.dispenseRecord.count({
      where: { prescriptionId: rx.id },
    });
    const holds = await db.invoiceAdjustment.count({
      where: { invoiceId, status: 'PENDING' },
    });
    expect(dispenses + holds).toBe(1);
  });

  it('can credit a paid stock shortage and rolls back when the cancellation cannot be audited', async () => {
    const rx = await createPrepaid();
    const invoiceId = rx.prepaidInvoiceId!;
    const pharmacy = app.get(PharmacyService);
    await app.get(CashierService).recordPayment({
      hospitalId,
      invoiceId,
      userId,
      amount: 3.333,
      method: 'TRANSFER',
    });
    await pharmacy.verifyOrder(rx.id, userId, hospitalId);
    await db.productStock.updateMany({
      where: { hospitalId, productId },
      data: { expiryDate: new Date(Date.now() - 86400000) },
    });
    await expect(
      pharmacy.dispensePrescription({
        hospitalId,
        prescriptionId: rx.id,
        pharmacistId: userId,
      }),
    ).rejects.toThrow('رصيد غير كافٍ');
    expect(
      await db.dispenseRecord.count({ where: { prescriptionId: rx.id } }),
    ).toBe(0);
    const { service, dto } = await cancelPrepaid(invoiceId);
    const pending = await service.request(hospitalId, invoiceId, userId, dto);
    const approve = () =>
      service.review(
        hospitalId,
        invoiceId,
        pending.id,
        reviewerId,
        'POST',
        reason,
      );
    const postingKey = `adjustment:${hospitalId}:${pending.id}`;
    await db.$executeRawUnsafe(`
      CREATE FUNCTION repair_prepaid_cancellation_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'CANCEL_PREPAID_PRESCRIPTION' THEN
          RAISE EXCEPTION 'synthetic prescription cancellation audit failure';
        END IF;
        RETURN NEW;
      END $$
    `);
    try {
      await db.$executeRawUnsafe(
        'CREATE TRIGGER repair_prepaid_cancellation_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION repair_prepaid_cancellation_failure()',
      );
      await expect(approve()).rejects.toThrow(
        'synthetic prescription cancellation audit failure',
      );
      expect(
        await db.accountingEntry.findUnique({ where: { postingKey } }),
      ).toBeNull();
      expect(
        await db.prescription.findUniqueOrThrow({ where: { id: rx.id } }),
      ).toMatchObject({ status: 'ACTIVE' });
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS repair_prepaid_cancellation_failure ON "AuditLog"',
      );
      await db.$executeRawUnsafe(
        'DROP FUNCTION repair_prepaid_cancellation_failure()',
      );
    }
    await expect(approve()).resolves.toMatchObject({ status: 'POSTED' });
    expect(await service.list(hospitalId, invoiceId)).toMatchObject({
      amountDue: '0.000',
      patientCredit: '3.333',
    });
    expect(await db.stockTransaction.count()).toBe(0);
  });

  it('allows a zero-price prescription only after clinical verification and creates no payment', async () => {
    await db.serviceItem.deleteMany({
      where: { hospitalId, code: 'PHARMACY-DRUGS' },
    });
    await db.product.update({
      where: { id: productId },
      data: { sellPrice: '0.000' },
    });
    const rx = await createPrepaid();
    const pharmacy = app.get(PharmacyService);
    const release = () =>
      pharmacy.dispensePrescription({
        hospitalId,
        prescriptionId: rx.id,
        pharmacistId: userId,
      });
    await expect(release()).rejects.toThrow('الاعتماد الصيدلاني');
    await pharmacy.verifyOrder(rx.id, userId, hospitalId);
    await release();
    expect(
      await db.serviceItem.count({
        where: { hospitalId, code: `PHARMACY-DRUGS-${hospitalId}` },
      }),
    ).toBe(1);
    expect(await db.payment.count()).toBe(0);
    expect(await db.encounterCharge.count()).toBe(1);
    expect(
      await db.dispenseRecord.count({ where: { prescriptionId: rx.id } }),
    ).toBe(1);
    await expect(
      app
        .get(BillingService)
        .cancelInvoice(hospitalId, rx.prepaidInvoiceId!, userId),
    ).rejects.toThrow('صرف منفذ');
  });

  it('rolls back prescription creation when the financial period is closed', async () => {
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(createPrepaid()).rejects.toThrow('فترة مالية مفتوحة');
    expect(await db.prescription.count()).toBe(1);
    expect(await db.invoice.count()).toBe(0);
    expect(await db.encounterCharge.count()).toBe(0);
  });

  it('cancels an unpaid prescription and preserves the original charge link', async () => {
    const rx = await createPrepaid();
    await app
      .get(BillingService)
      .cancelInvoice(hospitalId, rx.prepaidInvoiceId!, userId);
    expect(
      (await db.prescription.findUniqueOrThrow({ where: { id: rx.id } }))
        .status,
    ).toBe('CANCELLED');
    expect(
      await db.encounterCharge.count({
        where: {
          sourceType: 'PHARMACY_PRESCRIPTION',
          invoiceId: rx.prepaidInvoiceId,
        },
      }),
    ).toBe(1);
    expect(await db.dispenseRecord.count()).toBe(0);
  });

  it.each(['-0.500', '0.500'])(
    'posts signed adjustment %s and balanced HALF_EVEN money atomically',
    async (quantity) => {
      const movement = await adjustment(quantity);
      expect(movement.quantity.toString()).toBe(
        quantity.startsWith('-') ? '-0.5' : '0.5',
      );
      expect(movement.baseQuantity.eq(movement.quantity)).toBe(true);
      expect(movement.totalCost.toString()).toBe(
        quantity.startsWith('-') ? '-1.173' : '1.173',
      );
      expect(
        (
          await db.product.findUniqueOrThrow({ where: { id: productId } })
        ).stockOnHand.toString(),
      ).toBe(quantity.startsWith('-') ? '0.5' : '1.5');
      const entry = await db.accountingEntry.findFirstOrThrow({
        include: { lines: { include: { account: true } } },
      });
      expect(
        entry.lines.filter((l) => l.debit.gt(0)).map((l) => l.debit.toString()),
      ).toEqual(['1.173']);
      expect(
        entry.lines
          .filter((l) => l.credit.gt(0))
          .map((l) => l.credit.toString()),
      ).toEqual(['1.173']);
      expect(
        entry.lines.find(
          (l) =>
            l.account.code ===
            (quantity.startsWith('-') ? 'INVENTORY_LOSS' : 'INVENTORY_GAIN'),
        )?.account.type,
      ).toBe(quantity.startsWith('-') ? 'EXPENSE' : 'REVENUE');
      expect(
        await db.auditLog.count({ where: { action: 'ADJUST_PHARMACY_STOCK' } }),
      ).toBe(1);
    },
  );
  it('replays an identical adjustment once, including concurrent submissions', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      adjustment('-0.500', key),
      adjustment('-0.500', key),
    ]);
    expect(a.id).toBe(b.id);
    expect((await adjustment('-0.500', key)).id).toBe(a.id);
    await expect(adjustment('0.500', key)).rejects.toThrow();
    expect(await db.stockTransaction.count()).toBe(1);
    expect(await db.accountingEntry.count()).toBe(1);
    expect(
      await db.auditLog.count({ where: { action: 'ADJUST_PHARMACY_STOCK' } }),
    ).toBe(1);
  });
  it('carries the rounding remainder through two removals until inventory is zero', async () => {
    await db.productStock.updateMany({
      where: { batchNumber: 'A' },
      data: { quantity: 1 },
    });
    await db.productStock.updateMany({
      where: { batchNumber: 'B' },
      data: { quantity: 0 },
    });
    await adjustment();
    await adjustment();
    expect(
      (
        await db.stockTransaction.aggregate({ _sum: { totalCost: true } })
      )._sum.totalCost?.toString(),
    ).toBe('-2.345');
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('0');
    expect(
      (
        await db.accountingEntryLine.aggregate({
          where: { account: { code: 'INVENTORY_LOSS' } },
          _sum: { debit: true },
        })
      )._sum.debit?.toString(),
    ).toBe('2.345');
  });
  it('can reconcile an already posted request after the source policy changes', async () => {
    const key = randomUUID();
    const posted = await adjustment('-0.500', key);
    await db.pharmacyWarehousePolicy.deleteMany();
    expect((await adjustment('-0.500', key)).id).toBe(posted.id);
    await expect(adjustment('-0.500')).rejects.toThrow();
    expect(await db.stockTransaction.count()).toBe(1);
    expect(await db.accountingEntry.count()).toBe(1);
  });
  it('enforces the adjustment identity at the database boundary', async () => {
    await expect(
      db.stockTransaction.create({
        data: {
          hospitalId,
          warehouseId,
          productId,
          type: 'ADJUST',
          quantity: '0.500',
          baseQuantity: '0.500',
          unitCost: '2.345',
          totalCost: '1.173',
          createdById: userId,
          referenceType: 'PHARMACY_ADJUSTMENT',
          notes: 'Synthetic documented invalid identity',
          manualRequestKey: 'synthetic-incomplete-identity',
        },
      }),
    ).rejects.toThrow();
    await unchanged();
  });
  it('rejects inactive and foreign products before an adjustment', async () => {
    await db.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
    await expect(adjustment()).rejects.toThrow();
    await unchanged();
    const foreign = await db.hospital.create({
      data: { code: 'ADJUST-FOREIGN', name: 'Synthetic foreign' },
    });
    await db.product.update({
      where: { id: productId },
      data: { isActive: true, hospitalId: foreign.id },
    });
    await expect(adjustment()).rejects.toThrow();
    await unchanged();
  });
  it('does not overdraw a batch with two distinct concurrent adjustments', async () => {
    const result = await Promise.allSettled([adjustment(), adjustment()]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.stockTransaction.count()).toBe(1);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('0.5');
  });
  it('serializes manual correction against dispensing', async () => {
    const result = await Promise.allSettled([adjustment(), dispense()]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const product = await db.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockOnHand.gte(0)).toBe(true);
    expect(
      (
        await db.productStock.aggregate({ _sum: { quantity: true } })
      )._sum.quantity?.eq(product.stockOnHand),
    ).toBe(true);
  });
  it('holds the reconciled batch balances stable through the adjustment journal', async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const reached = new Promise<void>((r) => {
      entered = r;
    });
    const accounting = app.get(AccountingService);
    const original = accounting.recordPharmacyAdjustmentEntry.bind(
      accounting,
    ) as AccountingService['recordPharmacyAdjustmentEntry'];
    const hook = jest
      .spyOn(accounting, 'recordPharmacyAdjustmentEntry')
      .mockImplementationOnce(async (params) => {
        entered();
        await gate;
        return original(params);
      });
    const pending = adjustment();
    const observed = pending.then(() => {
      throw new Error('Adjustment bypassed the journal gate');
    });
    try {
      await Promise.race([reached, observed]);
      await expect(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '200ms'");
          await tx.productStock.updateMany({
            where: { productId, batchNumber: 'B' },
            data: { quantity: 0 },
          });
        }),
      ).rejects.toThrow();
    } finally {
      release();
      hook.mockRestore();
      await pending;
    }
    expect(
      (
        await db.productStock.findFirstOrThrow({
          where: { productId, batchNumber: 'B' },
        })
      ).quantity.toString(),
    ).toBe('0.5');
  });
  it.each(['0', '-0.501', '0.0001', 'NaN', 'Infinity', '1000000000000000'])(
    'rejects invalid or excessive correction %s',
    async (quantity) => {
      await expect(adjustment(quantity)).rejects.toThrow();
      await unchanged();
    },
  );
  it('rejects missing batches, wrong product types and unsupported valuation', async () => {
    await db.productStock.deleteMany({ where: { batchNumber: 'A' } });
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: '0.5' },
    });
    await expect(adjustment()).rejects.toThrow();
    await db.product.update({
      where: { id: productId },
      data: { type: 'SUPPLY' },
    });
    await expect(adjustment()).rejects.toThrow();
    const category = await db.itemCategory.create({
      data: { hospitalId, name: 'Synthetic FIFO', valuationMethod: 'FIFO' },
    });
    await db.product.update({
      where: { id: productId },
      data: { type: 'DRUG', categoryId: category.id },
    });
    await expect(adjustment()).rejects.toThrow();
    expect(await db.stockTransaction.count()).toBe(0);
    expect(await db.accountingEntry.count()).toBe(0);
  });
  it('rejects an inconsistent summary without changing stock', async () => {
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: 2 },
    });
    await expect(adjustment()).rejects.toThrow();
    expect(await db.stockTransaction.count()).toBe(0);
    expect(
      (
        await db.productStock.aggregate({ _sum: { quantity: true } })
      )._sum.quantity?.toString(),
    ).toBe('1');
  });
  it('allows expired stock reduction but refuses adding expired stock', async () => {
    await db.productStock.updateMany({
      where: { batchNumber: 'A' },
      data: { expiryDate: new Date(Date.now() - 86400000) },
    });
    await expect(adjustment('0.500')).rejects.toThrow();
    await unchanged();
    await adjustment();
    expect(await db.accountingEntry.count()).toBe(1);
  });
  it('requires an open financial period even for a zero value correction', async () => {
    await db.product.update({
      where: { id: productId },
      data: { costPrice: 0 },
    });
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(adjustment()).rejects.toThrow();
    await unchanged();
    await db.financialPeriod.updateMany({ data: { isOpen: true } });
    await adjustment();
    expect(await db.accountingEntry.count()).toBe(0);
    expect(await db.stockTransaction.count()).toBe(1);
  });
  it('rejects wrong adjustment account types', async () => {
    await db.account.updateMany({
      where: { code: 'INVENTORY_LOSS' },
      data: { type: 'REVENUE' },
    });
    await expect(adjustment()).rejects.toThrow();
    await unchanged();
  });
  it.each(['AccountingEntry', 'AuditLog'])(
    'rolls back the full adjustment on %s failure',
    async (table) => {
      await db.$executeRawUnsafe(
        `CREATE FUNCTION repair_adjustment_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic adjustment failure'; END $$`,
      );
      try {
        await db.$executeRawUnsafe(
          `CREATE TRIGGER repair_adjustment_failure BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION repair_adjustment_failure()`,
        );
        await expect(adjustment()).rejects.toThrow();
        await unchanged();
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS repair_adjustment_failure ON "${table}"`,
        );
        await db.$executeRawUnsafe('DROP FUNCTION repair_adjustment_failure()');
      }
    },
  );
  it('requires dedicated adjustment permission and validates the exact HTTP contract', async () => {
    const body = {
      drugItemId: productId,
      type: 'ADJUST',
      quantity: '-0.500',
      batchNumber: 'A',
      reason: 'Synthetic documented HTTP variance',
      requestId: randomUUID(),
    };
    const post = (value: object, access: string) =>
      request(app.getHttpServer())
        .post('/pharmacy/stock/transactions')
        .auth(access, { type: 'bearer' })
        .send(value);
    await post(body, token).expect(403);
    const actor = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'adjuster',
      'synthetic',
      { hospitalId, permissions: ['pharmacy:stock:adjust'] },
    );
    for (const patch of [
      { type: 'IN' },
      { quantity: -0.5 },
      { quantity: '0.0001' },
      { batchNumber: '' },
      { reason: 'short' },
      { unitCost: '0' },
      { expiryDate: '2030-01-01' },
      { requestId: 'invalid' },
    ])
      await post({ ...body, ...patch }, actor.accessToken).expect(400);
    await unchanged();
    await post(body, actor.accessToken).expect(201);
    await post(body, actor.accessToken).expect(201);
    expect(await db.stockTransaction.count()).toBe(1);
  });
  it('exposes the current policy to viewers but protects configuration separately', async () => {
    await request(app.getHttpServer())
      .get(source)
      .auth(token, { type: 'bearer' })
      .expect('Cache-Control', 'no-store')
      .expect(200);
    await configure(warehouseId, token).expect(403);
    await request(app.getHttpServer())
      .get(source + '/warehouses')
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer()).get(source).expect(401);
    await unchanged();
  });
  it('saves an explicitly selected source with an atomic audit trail', async () => {
    const next = await db.warehouse.create({
      data: { hospitalId, name: 'Arabic named source مستودع الأدوية' },
    });
    const access = await manager();
    await configure(next.id, access).expect(200);
    const policy = await db.pharmacyWarehousePolicy.findUniqueOrThrow({
      where: { hospitalId },
    });
    expect(policy.warehouseId).toBe(next.id);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'CONFIGURE_PHARMACY_WAREHOUSE' },
    });
    expect(audit.details).toMatchObject({
      payload: {
        reason,
        previousWarehouseId: warehouseId,
        warehouseId: next.id,
      },
    });
    expect(policy.updatedById).toBe(audit.userId);
  });
  it('lists only active warehouses from the actor hospital', async () => {
    const foreign = await db.hospital.create({
      data: { code: 'FOREIGN-SOURCE', name: 'Synthetic foreign' },
    });
    await db.warehouse.create({
      data: { hospitalId: foreign.id, name: 'Foreign warehouse' },
    });
    await db.warehouse.create({
      data: { hospitalId, name: 'Inactive warehouse', isActive: false },
    });
    const response = await request(app.getHttpServer())
      .get(source + '/warehouses')
      .auth(await manager(), { type: 'bearer' })
      .expect(200);
    expect(response.body).toEqual([
      { id: warehouseId, name: 'Synthetic Pharmacy' },
    ]);
  });
  it.each([
    { warehouseId: 0, reason },
    { warehouseId: -1, reason },
    { warehouseId: 1.5, reason },
    { warehouseId: '1', reason },
    { warehouseId: 1, reason: '   ' },
    { warehouseId: 1, reason: 'x'.repeat(501) },
    { reason },
    { warehouseId: 1 },
  ])('rejects malformed source configuration %#', async (body) => {
    await request(app.getHttpServer())
      .put(source)
      .auth(await manager(), { type: 'bearer' })
      .send(body)
      .expect(400);
    expect(
      (
        await db.pharmacyWarehousePolicy.findUniqueOrThrow({
          where: { hospitalId },
        })
      ).warehouseId,
    ).toBe(warehouseId);
    expect(
      await db.auditLog.count({
        where: { action: 'CONFIGURE_PHARMACY_WAREHOUSE' },
      }),
    ).toBe(0);
  });
  it('rejects foreign and inactive source warehouses and isolates policy reads', async () => {
    const foreign = await db.hospital.create({
      data: { code: 'FOREIGN-SOURCE', name: 'Synthetic foreign' },
    });
    const other = await db.warehouse.create({
      data: { hospitalId: foreign.id, name: 'Foreign warehouse' },
    });
    const inactive = await db.warehouse.create({
      data: { hospitalId, name: 'Inactive warehouse', isActive: false },
    });
    const access = await manager();
    await configure(other.id, access).expect(400);
    await configure(inactive.id, access).expect(400);
    const actor = await new AuthHelper(db, app.get(JwtService)).createTestUser(
      'foreign-reader',
      'synthetic',
      { hospitalId: foreign.id, permissions: ['pharmacy:view'] },
    );
    const response = await request(app.getHttpServer())
      .get(source)
      .auth(actor.accessToken, { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({
      hospitalId: foreign.id,
      warehouseId: null,
    });
    await expect(
      db.pharmacyWarehousePolicy.update({
        where: { hospitalId },
        data: { warehouseId: other.id },
      }),
    ).rejects.toThrow();
    expect(
      (
        await db.pharmacyWarehousePolicy.findUniqueOrThrow({
          where: { hospitalId },
        })
      ).warehouseId,
    ).toBe(warehouseId);
  });
  it('fails closed without configuration despite the presence of a named stocked warehouse', async () => {
    await db.pharmacyWarehousePolicy.deleteMany();
    await expect(dispense()).rejects.toThrow();
    await expect(pos()).rejects.toThrow();
    await expect(
      app.get(PharmacyService).createManualStockTransaction({
        hospitalId,
        userId,
        drugItemId: productId,
        type: 'ADJUST',
        quantity: '1',
        batchNumber: 'A',
        reason: 'Synthetic documented source check',
        requestId: randomUUID(),
      }),
    ).rejects.toThrow();
    await unchanged();
  });
  it('fails closed after disabling the configured warehouse', async () => {
    await db.warehouse.update({
      where: { id: warehouseId },
      data: { isActive: false },
    });
    await expect(dispense()).rejects.toThrow();
    await expect(pos()).rejects.toThrow();
    await expect(
      app.get(PharmacyService).createManualStockTransaction({
        hospitalId,
        userId,
        drugItemId: productId,
        type: 'ADJUST',
        quantity: '1',
        batchNumber: 'A',
        reason: 'Synthetic documented source check',
        requestId: randomUUID(),
      }),
    ).rejects.toThrow();
    await unchanged();
  });
  it('does not consume another warehouse after the configured source runs out', async () => {
    const next = await db.warehouse.create({
      data: { hospitalId, name: 'Dedicated next source' },
    });
    await app.get(PharmacyService).configurePharmacySource(hospitalId, userId, {
      warehouseId: next.id,
      reason,
    });
    await expect(dispense()).rejects.toThrow();
    await unchanged();
  });
  it('rolls back the configuration when the mandatory audit insert fails', async () => {
    const next = await db.warehouse.create({
      data: { hospitalId, name: 'Dedicated next source' },
    });
    await db.$executeRawUnsafe(
      `CREATE FUNCTION repair_source_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic source audit failure'; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        'CREATE TRIGGER repair_source_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION repair_source_failure()',
      );
      await expect(
        app.get(PharmacyService).configurePharmacySource(hospitalId, userId, {
          warehouseId: next.id,
          reason,
        }),
      ).rejects.toThrow();
      expect(
        (
          await db.pharmacyWarehousePolicy.findUniqueOrThrow({
            where: { hospitalId },
          })
        ).warehouseId,
      ).toBe(warehouseId);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS repair_source_failure ON "AuditLog"',
      );
      await db.$executeRawUnsafe('DROP FUNCTION repair_source_failure()');
    }
  });
  it('serializes a source change against dispensing without mixing warehouses', async () => {
    const next = await db.warehouse.create({
      data: { hospitalId, name: 'Empty replacement source' },
    });
    const [dispensed, configured] = await Promise.allSettled([
      dispense(),
      app.get(PharmacyService).configurePharmacySource(hospitalId, userId, {
        warehouseId: next.id,
        reason,
      }),
    ]);
    expect(configured.status).toBe('fulfilled');
    if (dispensed.status === 'fulfilled') {
      expect(await db.stockTransaction.count({ where: { warehouseId } })).toBe(
        2,
      );
      expect(
        await db.stockTransaction.count({ where: { warehouseId: next.id } }),
      ).toBe(0);
      expect(await db.accountingEntry.count()).toBe(1);
    } else await unchanged();
    expect(
      (
        await db.pharmacyWarehousePolicy.findUniqueOrThrow({
          where: { hospitalId },
        })
      ).warehouseId,
    ).toBe(next.id);
  });
  it('holds the active warehouse stable until the dispensing transaction commits', async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const accounting = app.get(AccountingService);
    const original = accounting.recordCogsEntry.bind(
      accounting,
    ) as AccountingService['recordCogsEntry'];
    const hook = jest
      .spyOn(accounting, 'recordCogsEntry')
      .mockImplementationOnce(async (params) => {
        entered();
        await gate;
        return original(params);
      });
    const pending = dispense();
    // Propagate an early failure rather than waiting indefinitely for the hook.
    const observed = pending.then(() => {
      throw new Error('Dispensing bypassed the accounting gate');
    });
    try {
      await Promise.race([reached, observed]);
      await expect(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '200ms'");
          await tx.warehouse.update({
            where: { id: warehouseId },
            data: { isActive: false },
          });
        }),
      ).rejects.toThrow();
      expect(
        (await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId } }))
          .isActive,
      ).toBe(true);
    } finally {
      release();
      hook.mockRestore();
      await pending;
    }
    await db.warehouse.update({
      where: { id: warehouseId },
      data: { isActive: false },
    });
    expect(await db.dispenseRecord.count()).toBe(1);
  });
  it('preserves the rounded line total across batches and posts cost once', async () => {
    const result = await dispense();
    expect(result.totalAmount).toBe(3.333);
    expect(
      (
        await db.dispenseItem.aggregate({ _sum: { totalAmount: true } })
      )._sum.totalAmount?.toString(),
    ).toBe('3.333');
    expect(
      (
        await db.stockTransaction.aggregate({ _sum: { totalCost: true } })
      )._sum.totalCost?.toString(),
    ).toBe('2.345');
    expect(await db.accountingEntry.count()).toBe(1);
    const lines = await db.accountingEntryLine.findMany();
    expect(lines.find((l) => l.debit.gt(0))?.debit.toString()).toBe('2.345');
    expect(lines.find((l) => l.credit.gt(0))?.credit.toString()).toBe('2.345');
    expect(
      await db.auditLog.count({ where: { action: 'PHARMACY_DISPENSE' } }),
    ).toBe(1);
    await expect(dispense()).rejects.toThrow();
    expect(await db.dispenseRecord.count()).toBe(1);
    expect(await db.accountingEntry.count()).toBe(1);
  });
  it('allows only one concurrent dispense', async () => {
    const results = await Promise.allSettled([dispense(), dispense()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.dispenseRecord.count()).toBe(1);
    expect(await db.accountingEntry.count()).toBe(1);
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: productId } })
      ).stockOnHand.toString(),
    ).toBe('0');
  });
  it('serializes regular dispensing against POS for the same prescription', async () => {
    const results = await Promise.allSettled([dispense(), pos()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.dispenseRecord.count()).toBe(1);
    expect(await db.payment.count()).toBeLessThanOrEqual(1);
    expect(
      (
        await db.stockTransaction.aggregate({ _sum: { totalCost: true } })
      )._sum.totalCost?.toString(),
    ).toBe('2.345');
  });
  it('posts invoice, payment and cost atomically and links cash custody', async () => {
    const result = await pos();
    expect(result.payment.sessionId).toBe(sessionId);
    expect(result.invoice.totalAmount.toString()).toBe('3.333');
    expect(result.invoice.patientShare.toString()).toBe('3.333');
    expect(await db.accountingEntry.count()).toBe(3);
    expect(
      await db.auditLog.count({ where: { action: 'PHARMACY_DISPENSE_POS' } }),
    ).toBe(1);
    await expect(pos()).rejects.toThrow();
    expect(await db.payment.count()).toBe(1);
  });
  it.each([3, 4])(
    'rejects incomplete or excessive payment %s',
    async (amount) => {
      await expect(pos(amount)).rejects.toThrow();
      await unchanged();
    },
  );
  it.each(['CLOSING', 'CLOSED'])(
    'rejects POS in %s custody',
    async (status) => {
      await db.cashierSession.update({
        where: { id: sessionId },
        data: {
          status,
          countReason: 'Synthetic witnessed count',
          countedAmount: 0,
          countedAt: new Date(),
          countedById: userId,
          ...(status === 'CLOSED'
            ? { closedAt: new Date(), closedById: reviewerId }
            : {}),
        },
      });
      await expect(pos()).rejects.toThrow();
      await unchanged();
    },
  );
  it('rejects POS without a cash session', async () => {
    await db.cashierSession.deleteMany();
    await expect(pos()).rejects.toThrow();
    await unchanged();
  });
  it.each(['CANCELLED', 'COMPLETED', 'DRAFT', 'PARTIALLY_COMPLETED'] as const)(
    'rejects prescription status %s in both paths',
    async (status) => {
      await db.prescription.update({
        where: { id: prescriptionId },
        data: { status },
      });
      await expect(dispense()).rejects.toThrow();
      await expect(pos()).rejects.toThrow();
      expect(await db.dispenseRecord.count()).toBe(0);
    },
  );
  it('rejects unverified prescriptions', async () => {
    await db.prescription.update({
      where: { id: prescriptionId },
      data: { pharmacistVerificationStatus: 'PENDING' },
    });
    await expect(dispense()).rejects.toThrow();
    await expect(pos()).rejects.toThrow();
    await unchanged();
  });
  it('rejects malformed dispensing selections and substitutions', async () => {
    for (const items of [
      [],
      [{ prescriptionItemId: lineId, quantity: 0 }],
      [{ prescriptionItemId: lineId, quantity: 2 }],
      [
        { prescriptionItemId: lineId, quantity: 1 },
        { prescriptionItemId: lineId, quantity: 1 },
      ],
      [{ prescriptionItemId: lineId + 1, quantity: 1 }],
      [
        {
          prescriptionItemId: lineId,
          quantity: 1,
          dispensedDrugItemId: productId + 1,
        },
      ],
    ]) {
      await expect(
        app.get(PharmacyService).dispensePrescription({
          hospitalId,
          prescriptionId,
          pharmacistId: userId,
          items,
        }),
      ).rejects.toThrow();
    }
    await unchanged();
  });
  it('validates prescription ownership and related patient identity', async () => {
    const foreign = await db.hospital.create({
      data: { code: 'PHARM-FOREIGN', name: 'Synthetic foreign' },
    });
    await expect(
      app.get(PharmacyService).dispensePrescription({
        hospitalId: foreign.id,
        prescriptionId,
        pharmacistId: userId,
      }),
    ).rejects.toThrow();
    const patient = await db.patient.create({
      data: {
        hospitalId: foreign.id,
        mrn: 'FOREIGN',
        fullName: 'Synthetic foreign',
      },
    });
    await db.prescription.update({
      where: { id: prescriptionId },
      data: { patientId: patient.id },
    });
    await expect(dispense()).rejects.toThrow();
    await expect(pos()).rejects.toThrow();
    await unchanged();
  });
  it('rejects closed encounters and unauthorized partial quantities', async () => {
    await expect(
      app.get(PharmacyService).dispensePrescription({
        hospitalId,
        prescriptionId,
        pharmacistId: userId,
        items: [{ prescriptionItemId: lineId, quantity: 0.5 }],
      }),
    ).rejects.toThrow();
    await db.encounter.update({
      where: { id: encounterId },
      data: { status: 'CLOSED' },
    });
    await expect(dispense()).rejects.toThrow();
    await expect(pos()).rejects.toThrow();
    await unchanged();
  });
  it('rejects a missing billing service without losing stock', async () => {
    await db.serviceItem.deleteMany();
    await expect(dispense()).rejects.toThrow();
    await expect(pos()).rejects.toThrow();
    await unchanged();
  });
  it('rolls back both paths on a closed financial period', async () => {
    await db.financialPeriod.updateMany({ data: { isOpen: false } });
    await expect(dispense()).rejects.toThrow();
    await expect(pos()).rejects.toThrow();
    await unchanged();
  });
  it('blocks recalled batches across warehouses and releases temporary quarantine only', async () => {
    const a = await db.productStock.findFirstOrThrow({
      where: { hospitalId, productId, batchNumber: 'A' },
    });
    const b = await db.productStock.findFirstOrThrow({
      where: { hospitalId, productId, batchNumber: 'B' },
    });
    const auth = new AuthHelper(db, app.get(JwtService));
    const inventoryManager = await auth.createTestUser(
      'batch-manager',
      'synthetic',
      {
        hospitalId,
        permissions: ['inventory:manage', 'inventory:view'],
      },
    );
    const reader = await auth.createTestUser('batch-reader', 'synthetic', {
      hospitalId,
      permissions: ['inventory:view'],
    });
    const route = (access: string, stockId: number, status: string) =>
      request(app.getHttpServer())
        .post(`/inventory/stock/${stockId}/batch-restriction`)
        .auth(access, { type: 'bearer' })
        .send({
          status,
          reason: 'Synthetic investigation of a suspected defect',
        });
    await route(reader.accessToken, a.id, 'RECALLED').expect(403);
    await route(inventoryManager.accessToken, a.id, 'QUARANTINED').expect(201);
    await expect(dispense()).rejects.toThrow();
    await expect(pos()).rejects.toThrow();
    await unchanged();
    await route(inventoryManager.accessToken, a.id, 'RELEASED').expect(201);
    await route(inventoryManager.accessToken, b.id, 'RECALLED').expect(201);
    await route(inventoryManager.accessToken, b.id, 'RELEASED').expect(409);
    await expect(
      db.stockTransaction.create({
        data: {
          hospitalId,
          productId,
          warehouseId,
          createdById: userId,
          type: 'OUT',
          referenceType: 'DISPENSE',
          batchNumber: 'B',
          quantity: '0.500',
          baseQuantity: '0.500',
          unitCost: '2.345',
          totalCost: '1.173',
        },
      }),
    ).rejects.toThrow('Restricted stock batch cannot be issued');
    const warehouse = await db.warehouse.create({
      data: { hospitalId, name: 'Second synthetic warehouse' },
    });
    await db.productStock.create({
      data: {
        hospitalId,
        productId,
        warehouseId: warehouse.id,
        batchNumber: 'B',
        quantity: 0,
      },
    });
    const visible = await request(app.getHttpServer())
      .get(`/inventory/warehouses/${warehouse.id}/stock`)
      .auth(inventoryManager.accessToken, { type: 'bearer' })
      .expect(200);
    expect(responseBody(visible)).toMatchObject([
      { batchRestriction: { status: 'RECALLED' } },
    ]);
    await expect(dispense()).rejects.toThrow();
    await unchanged();
    expect(
      await db.auditLog.count({
        where: { hospitalId, action: 'INVENTORY_BATCH_SAFETY' },
      }),
    ).toBe(3);
  });

  it('observes a quarantine committed while dispensing is waiting for the product lock', async () => {
    const stock = await db.productStock.findFirstOrThrow({
      where: { hospitalId, batchNumber: 'A' },
    });
    let entered!: () => void;
    let commit!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      commit = resolve;
    });
    const restriction = db.$transaction(async (tx) => {
      await changeBatchRestriction(
        tx,
        hospitalId,
        userId,
        stock.id,
        'QUARANTINED',
        'Synthetic concurrent safety review',
      );
      entered();
      await gate;
    });
    await reached;
    const dispensed = Promise.allSettled([dispense()]);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 40 && !waiting; attempt++) {
        const locks = await db.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query LIKE '%type=''DRUG'' FOR UPDATE%') AS waiting
        `;
        waiting = locks[0].waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 30));
      }
      expect(waiting).toBe(true);
    } finally {
      commit();
      await restriction;
      expect(await dispensed).toMatchObject([{ status: 'rejected' }]);
    }
    await unchanged();
  });

  it('traces pre-recall dispensing with separate patient access and records immutable isolation evidence once', async () => {
    const batch = await db.productStock.findFirstOrThrow({
      where: { hospitalId, productId, batchNumber: 'A' },
    });
    await db.productStock.update({
      where: { id: batch.id },
      data: { quantity: '1.500' },
    });
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: '2.000' },
    });
    await dispense();
    const auth = new AuthHelper(db, app.get(JwtService));
    const manager = await auth.createTestUser('recall-manager', 'synthetic', {
      hospitalId,
      permissions: ['inventory:manage'],
    });
    const clinician = await auth.createTestUser(
      'recall-clinician',
      'synthetic',
      {
        hospitalId,
        permissions: ['inventory:manage', 'patients:view'],
      },
    );
    const foreign = await db.hospital.create({
      data: { code: 'RECALL-FOREIGN', name: 'Synthetic foreign facility' },
    });
    const outsider = await auth.createTestUser('recall-foreign', 'synthetic', {
      hospitalId: foreign.id,
      permissions: ['inventory:manage', 'patients:view'],
    });
    const api = `/inventory/stock/${batch.id}`;
    const read = (access: string) =>
      request(app.getHttpServer())
        .get(`${api}/recall-followup`)
        .auth(access, { type: 'bearer' });
    await read(manager.accessToken).expect(404);
    await request(app.getHttpServer())
      .post(`${api}/batch-restriction`)
      .auth(manager.accessToken, { type: 'bearer' })
      .send({ status: 'RECALLED', reason: 'Synthetic recall notification' })
      .expect(201);
    await read(outsider.accessToken).expect(404);
    const redacted = responseBody(await read(manager.accessToken).expect(200));
    expect(redacted).toMatchObject({
      canViewPatientIdentity: false,
      movements: [
        {
          linked: true,
          referenceType: 'DISPENSE',
          patient: null,
          mrn: null,
          encounterId: null,
        },
      ],
    });
    const trace = responseBody(await read(clinician.accessToken).expect(200));
    expect(trace).toMatchObject({
      canViewPatientIdentity: true,
      movements: [
        {
          linked: true,
          referenceType: 'DISPENSE',
          patient: 'Synthetic pharmacy patient',
          mrn: 'SYNTHETIC',
          encounterId,
        },
      ],
      stocks: [{ quantity: '0.5', latestIsolation: null }],
    });
    expect(
      await db.auditLog.count({
        where: { hospitalId, action: 'READ_RECALL_PATIENT_TRACE' },
      }),
    ).toBe(1);
    const movement = await db.stockTransaction.findFirstOrThrow({
      where: {
        hospitalId,
        productId,
        batchNumber: 'A',
        referenceType: 'DISPENSE',
      },
    });
    const contactPath = `${api}/recall-contacts/${movement.id}`;
    const history = (access: string) =>
      request(app.getHttpServer())
        .get(contactPath)
        .query({ audience: 'PATIENT' })
        .auth(access, { type: 'bearer' });
    const contact = {
      audience: 'PATIENT',
      outcome: 'ATTEMPTED',
      channel: 'PHONE',
      note: 'Synthetic attempt with no answer',
      requestId: randomUUID(),
    };
    const saveContact = (
      data: typeof contact,
      access = clinician.accessToken,
      path = contactPath,
    ) =>
      request(app.getHttpServer())
        .post(path)
        .auth(access, { type: 'bearer' })
        .send(data);
    await history(manager.accessToken).expect(403);
    await history(outsider.accessToken).expect(404);
    await saveContact(contact, manager.accessToken).expect(403);
    await saveContact(contact, outsider.accessToken).expect(404);
    await saveContact(
      contact,
      clinician.accessToken,
      `${api}/recall-contacts/0`,
    ).expect(404);
    await saveContact({ ...contact, outcome: 'RESOLVED' }).expect(409);
    await saveContact({ ...contact, channel: 'INTERNAL_HANDOFF' }).expect(400);
    await saveContact(contact).expect(201);
    const notification = {
      ...contact,
      outcome: 'NOTIFIED',
      note: 'Synthetic patient acknowledgement',
      requestId: randomUUID(),
    };
    const sameRequest = await Promise.all([
      saveContact(notification).expect(201),
      saveContact(notification).expect(201),
    ]);
    expect(responseBody(sameRequest[0])).toEqual(responseBody(sameRequest[1]));
    await saveContact({ ...contact, requestId: randomUUID() }).expect(409);
    await saveContact({
      ...notification,
      note: 'Synthetic changed acknowledgement',
    }).expect(409);
    await saveContact({
      ...notification,
      outcome: 'RESOLVED',
      note: 'Synthetic clinical follow-up completed',
      requestId: randomUUID(),
    }).expect(201);
    expect(
      responseBody(await history(clinician.accessToken).expect(200)),
    ).toMatchObject({
      records: [
        { outcome: 'RESOLVED' },
        { outcome: 'NOTIFIED' },
        { outcome: 'ATTEMPTED' },
      ],
    });
    expect(
      responseBody(await read(clinician.accessToken).expect(200)),
    ).toMatchObject({
      movements: [{ canContactPatient: true, patientOutcome: 'RESOLVED' }],
    });
    expect(
      responseBody(await read(manager.accessToken).expect(200)),
    ).toMatchObject({
      movements: [{ canContactPatient: false, patientOutcome: null }],
    });
    expect(
      await db.auditLog.count({
        where: { hospitalId, action: 'RECORD_RECALL_CONTACT' },
      }),
    ).toBe(3);
    expect(
      await db.auditLog.count({
        where: { hospitalId, action: 'READ_RECALL_CONTACT_HISTORY' },
      }),
    ).toBe(1);
    const contactRow = await db.inventoryRecallContact.findFirstOrThrow();
    expect(
      await db.auditLog.count({
        where: {
          hospitalId,
          entity: 'InventoryRecallContact',
          action: 'CREATE',
        },
      }),
    ).toBe(0);
    await expect(
      db.inventoryRecallContact.update({
        where: { id: contactRow.id },
        data: { note: 'Synthetic overwriting attempt' },
      }),
    ).rejects.toThrow('append-only');
    const stock = await db.productStock.findUniqueOrThrow({
      where: { id: batch.id },
    });
    const evidence = {
      stockVersion: stock.version,
      isolatedQuantity: '0.500',
      location: 'Locked isolation shelf',
      reason: 'Synthetic physical count witnessed',
      requestId: randomUUID(),
    };
    const save = (body: typeof evidence, access = manager.accessToken) =>
      request(app.getHttpServer())
        .post(`${api}/recall-isolation`)
        .auth(access, { type: 'bearer' })
        .send(body);
    await save(evidence, outsider.accessToken).expect(404);
    await save({ ...evidence, stockVersion: 1 }).expect(409);
    await save({ ...evidence, isolatedQuantity: '0.501' }).expect(400);
    const financialEntries = await db.accountingEntry.count({
      where: { hospitalId },
    });
    const submissions = await Promise.all([
      save(evidence).expect(201),
      save(evidence).expect(201),
    ]);
    expect(responseBody(submissions[0])).toEqual(responseBody(submissions[1]));
    expect(await db.inventoryRecallIsolation.count()).toBe(1);
    const check = await db.inventoryRecallIsolation.findFirstOrThrow();
    await expect(
      db.inventoryRecallIsolation.update({
        where: { id: check.id },
        data: { isolatedQuantity: 0 },
      }),
    ).rejects.toThrow('append-only');
    await save({ ...evidence, isolatedQuantity: '0.300' }).expect(409);
    expect(await db.accountingEntry.count({ where: { hospitalId } })).toBe(
      financialEntries,
    );
    expect(
      responseBody(await read(manager.accessToken).expect(200)),
    ).toMatchObject({
      stocks: [
        {
          quantity: '0.5',
          isolationCurrent: true,
          latestIsolation: { isolatedQuantity: '0.5' },
        },
      ],
    });
    await db.productStock.update({
      where: { id: batch.id },
      data: { version: { increment: 1 } },
    });
    expect(
      responseBody(await read(manager.accessToken).expect(200)),
    ).toMatchObject({
      stocks: [
        {
          isolationCurrent: false,
          latestIsolation: { isolatedQuantity: '0.5' },
        },
      ],
    });
  });

  it('uses a printed expiry date through the facility day and preserves exact timestamp expiry', async () => {
    const today = new Date(
      `${TimeZoneUtils.localDateKey(new Date())}T00:00:00.000Z`,
    );
    await db.productStock.updateMany({
      data: { expiryDate: new Date(Date.now() - 1000) },
    });
    await expect(dispense()).rejects.toThrow();
    await unchanged();
    await db.productStock.updateMany({ data: { expiryDate: today } });
    await expect(dispense()).resolves.toBeDefined();
    expect(await db.stockTransaction.count()).toBe(2);
  });

  it('rejects expired stock and rolls back incomplete summary balances', async () => {
    await db.productStock.updateMany({
      data: { expiryDate: new Date(Date.now() - 86400000) },
    });
    await expect(dispense()).rejects.toThrow();
    await unchanged();
    await db.productStock.updateMany({ data: { expiryDate: null } });
    await db.product.update({
      where: { id: productId },
      data: { stockOnHand: 0 },
    });
    await expect(dispense()).rejects.toThrow();
    expect(await db.stockTransaction.count()).toBe(0);
    expect(await db.dispenseRecord.count()).toBe(0);
    expect(
      (
        await db.productStock.aggregate({ _sum: { quantity: true } })
      )._sum.quantity?.toString(),
    ).toBe('1');
  });
  it('rejects foreign or inactive drug identities', async () => {
    await db.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
    await expect(dispense()).rejects.toThrow();
    await unchanged();
    const foreign = await db.hospital.create({
      data: { code: 'PHARM-FOREIGN', name: 'Synthetic foreign' },
    });
    await db.product.update({
      where: { id: productId },
      data: { isActive: true, hospitalId: foreign.id },
    });
    await expect(dispense()).rejects.toThrow();
    await unchanged();
  });
  it.each(['AccountingEntry', 'AuditLog'])(
    'rolls back POS including prior journal writes on %s insert failure',
    async (table) => {
      await db.$executeRawUnsafe(
        `CREATE FUNCTION repair_pharmacy_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic pharmacy failure'; END $$`,
      );
      try {
        await db.$executeRawUnsafe(
          `CREATE TRIGGER repair_pharmacy_failure BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION repair_pharmacy_failure()`,
        );
        await expect(pos()).rejects.toThrow();
        await unchanged();
        await expect(dispense()).rejects.toThrow();
        await unchanged();
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS repair_pharmacy_failure ON "${table}"`,
        );
        await db.$executeRawUnsafe('DROP FUNCTION repair_pharmacy_failure()');
      }
    },
  );
});
