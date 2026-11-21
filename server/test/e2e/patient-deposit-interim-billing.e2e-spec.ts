import { responseBody } from '../http-response';
type TestResponse = {
  id: number;
  type: string;
  status: string;
  amount: string;
  code: string;
  totalAmount: string;
  patientShare: string;
  paidAmount: string;
  totalDeposited: string;
  totalApplied: string;
  totalRefunded: string;
  availableBalance: string;
  deposits: unknown[];
  payments: { id: number }[];
  appliedAmount: string;
  invoiceStatus: string;
  remainingInvoiceBalance: string;
  financialClearance: boolean;
  medicalClearance: boolean;
  ready: boolean;
  patientDepositBalance: string;
  hasSurplusDeposit: boolean;
  surplusDepositAmount: string;
};
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  AccountingService,
  ACCOUNT_CODES,
} from '../../src/accounting/accounting.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { Money } from '../../src/common/utils/money.util';
import {
  AdmissionStatus,
  DischargeDisposition,
  AdmissionType,
  EncounterStatus,
  EncounterType,
  InvoiceStatus,
  PaymentMethod,
  ServiceType,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';

describe('Patient Deposit / Trust Account, Interim Staged Billing & Discharge Settlement (CAP01)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let jwt: JwtService;
  let accountingService: AccountingService;
  let auth: AuthHelper;

  let hospitalId: number;
  let otherHospitalId: number;
  let staffToken: string;
  let staffUserId: number;
  let otherStaffToken: string;

  let patientId: number;
  let encounterId: number;
  let admissionId: number;
  let doctorUserId: number;

  let labServiceItemId: number;
  let consultServiceItemId: number;
  let extraServiceItemId: number;

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
    jwt = app.get(JwtService);
    accountingService = app.get(AccountingService);
    auth = new AuthHelper(db, jwt);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(db);

    // 1. Primary Hospital setup
    const hospital = await db.hospital.create({
      data: {
        code: `HOSP_DEP_A_${Date.now()}`,
        name: 'Hospital A - Patient Trust & Inpatient Center',
        isActive: true,
      },
    });
    hospitalId = hospital.id;

    // 2. Secondary Hospital setup for tenant isolation tests
    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_DEP_B_${Date.now()}`,
        name: 'Hospital B - External Facility',
        isActive: true,
      },
    });
    otherHospitalId = otherHospital.id;

    // 3. Create staff users
    const staff = await auth.createTestUser('deposit-cashier', 'synthetic', {
      hospitalId,
      permissions: [
        'billing:view',
        'billing:manage',
        'admission:view',
        'admission:manage',
      ],
    });
    staffToken = staff.accessToken;
    staffUserId = staff.user.id;
    const supervisor = await auth.createTestUser(
      'deposit-supervisor',
      'synthetic',
      { hospitalId },
    );
    await db.cashierSession.create({
      data: {
        hospitalId,
        cashierId: staffUserId,
        reviewedById: supervisor.user.id,
        status: 'OPEN',
        openingAmount: '0.000',
        reason: 'Synthetic approved session',
        requestKey: randomUUID(),
        openedAt: new Date(),
      },
    });

    const otherStaff = await auth.createTestUser('other-cashier', 'synthetic', {
      hospitalId: otherHospitalId,
      permissions: [
        'billing:view',
        'billing:manage',
        'admission:view',
        'admission:manage',
      ],
    });
    otherStaffToken = otherStaff.accessToken;

    const doctor = await auth.createTestUser('attending-doc', 'synthetic', {
      hospitalId,
      isDoctor: true,
      permissions: ['admission:manage'],
    });
    doctorUserId = doctor.user.id;

    // 4. Financial Year & Open Period
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

    // Ensure Chart of Accounts & Mappings
    await accountingService.ensureDefaultAccountsForHospital(hospitalId);
    await accountingService.ensureDefaultAccountsForHospital(otherHospitalId);

    // 5. Patients setup
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-DEP-${Date.now()}`,
        fullName: 'أحمد محمود الترهوني',
        phone: '0912345678',
      },
    });
    patientId = patient.id;

    await db.patient.create({
      data: {
        hospitalId: otherHospitalId,
        mrn: `MRN-OTHER-${Date.now()}`,
        fullName: 'خالد مصطفى',
        phone: '0922334455',
      },
    });

    // 6. Ward, Room, Bed setup
    const ward = await db.ward.create({
      data: {
        hospitalId,
        name: 'جناح الجراحة العامة',
        isActive: true,
      },
    });

    const room = await db.room.create({
      data: {
        hospitalId,
        wardId: ward.id,
        roomNumber: '305',
        isActive: true,
      },
    });

    const bed = await db.bed.create({
      data: {
        hospitalId,
        roomId: room.id,
        wardId: ward.id,
        bedNumber: '305-A',
        isActive: true,
      },
    });

    // 7. Inpatient Encounter & Admission setup
    const encounter = await db.encounter.create({
      data: {
        hospitalId,
        patientId,
        type: EncounterType.IPD,
        status: EncounterStatus.OPEN,
        admissionDate: now,
      },
    });
    encounterId = encounter.id;

    const admission = await db.admission.create({
      data: {
        hospitalId,
        patientId,
        encounterId,
        admissionType: AdmissionType.ELECTIVE,
        admissionStatus: AdmissionStatus.ADMITTED,
        priority: 'MEDIUM',
        actualAdmissionDate: now,
        bedId: bed.id,
        roomId: room.id,
        wardId: ward.id,
        admittingDoctorId: doctorUserId,
        primaryPhysicianId: doctorUserId,
        admissionReason: 'إقامة واستئصال مرارة بالمنظار',
        createdBy: staffUserId,
      },
    });
    admissionId = admission.id;

    // 8. Service Items setup
    const cat = await db.serviceCategory.create({
      data: {
        hospitalId,
        name: 'خدمات إقامة وعمليات',
      },
    });

    const labService = await db.serviceItem.create({
      data: {
        hospitalId,
        categoryId: cat.id,
        code: `SRV-LAB-${Date.now()}`,
        name: 'تحليل وظائف كبد وكلى شامل',
        type: ServiceType.LAB,
        defaultPrice: 300,
        isActive: true,
      },
    });
    labServiceItemId = labService.id;

    const consultService = await db.serviceItem.create({
      data: {
        hospitalId,
        categoryId: cat.id,
        code: `SRV-CON-${Date.now()}`,
        name: 'استشارة طبيب تخدير وتجهيز عمليات',
        type: ServiceType.CONSULTATION,
        defaultPrice: 200,
        isActive: true,
      },
    });
    consultServiceItemId = consultService.id;

    const extraService = await db.serviceItem.create({
      data: {
        hospitalId,
        categoryId: cat.id,
        code: `SRV-EXT-${Date.now()}`,
        name: 'فحص أشعة تلفزيونية بعد العملية',
        type: ServiceType.RADIOLOGY,
        defaultPrice: 150,
        isActive: true,
      },
    });
    extraServiceItemId = extraService.id;
  });

  it('Scenario 1: Collects patient deposit, generates posted voucher, and posts custodial liability journal entry', async () => {
    // 1.1 Collect deposit of 2500.000 LYD
    const res = await request(app.getHttpServer())
      .post('/billing/deposits')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        patientId,
        encounterId,
        amount: '2500',
        requestId: randomUUID(),
        method: PaymentMethod.CASH,
        notes: 'دفعة أمانات تحت حساب الإقامة والعملية الجراحية',
      })
      .expect(201);

    expect(responseBody<TestResponse>(res)).toBeDefined();
    expect(responseBody<TestResponse>(res).id).toBeDefined();
    expect(responseBody<TestResponse>(res).type).toBe(VoucherType.RECEIPT);
    expect(responseBody<TestResponse>(res).status).toBe(VoucherStatus.POSTED);
    expect(Money.toDbString(responseBody<TestResponse>(res).amount)).toBe(
      '2500.000',
    );
    expect(responseBody<TestResponse>(res).code).toMatch(/^RV-DEP-\d+/);

    // 1.2 Verify accounting entry posted with correct custodial liability accounts
    const entry = await db.accountingEntry.findFirst({
      where: {
        hospitalId,
        sourceModule: 'VOUCHER',
        sourceId: responseBody<TestResponse>(res).id,
      },
      include: {
        lines: { include: { account: true } },
      },
    });

    expect(entry).toBeDefined();
    expect(entry!.lines).toHaveLength(2);

    const debitLine = entry!.lines.find((l) => Money.gt(l.debit, 0));
    const creditLine = entry!.lines.find((l) => Money.gt(l.credit, 0));

    expect(debitLine).toBeDefined();
    expect(debitLine!.account.code).toBe(ACCOUNT_CODES.CASH_MAIN);
    expect(Money.toDbString(debitLine!.debit)).toBe('2500.000');

    expect(creditLine).toBeDefined();
    expect(creditLine!.account.code).toBe(ACCOUNT_CODES.PATIENT_DEPOSITS);
    expect(Money.toDbString(creditLine!.credit)).toBe('2500.000');

    // 1.3 Verify audit log generated
    const audit = await db.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'PATIENT_DEPOSIT_COLLECTED',
        entityId: responseBody<TestResponse>(res).id,
      },
    });
    expect(audit).toBeDefined();

    // 1.4 Check deposit balance query
    const balRes = await request(app.getHttpServer())
      .get(`/billing/patients/${patientId}/deposits`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(
      Money.toDbString(responseBody<TestResponse>(balRes).totalDeposited),
    ).toBe('2500.000');
    expect(
      Money.toDbString(responseBody<TestResponse>(balRes).totalApplied),
    ).toBe('0.000');
    expect(
      Money.toDbString(responseBody<TestResponse>(balRes).totalRefunded),
    ).toBe('0.000');
    expect(
      Money.toDbString(responseBody<TestResponse>(balRes).availableBalance),
    ).toBe('2500.000');
    expect(responseBody<TestResponse>(balRes).deposits).toHaveLength(1);
  });

  it('Scenario 2: Issues interim staged invoice for accrued charges, auto-applies deposit, and keeps remaining charges unbilled', async () => {
    // 2.1 First collect deposit of 2000.000 LYD
    await request(app.getHttpServer())
      .post('/billing/deposits')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        patientId,
        encounterId,
        amount: '2000',
        requestId: randomUUID(),
        method: PaymentMethod.TRANSFER,
      })
      .expect(201);

    // 2.2 Add three charges to encounter
    const charge1 = await db.encounterCharge.create({
      data: {
        hospitalId,
        encounterId,
        serviceItemId: labServiceItemId,
        sourceType: 'LAB_ORDER',
        quantity: 1,
        unitPrice: 300,
        totalAmount: 300,
        createdAt: new Date(Date.now() - 3600 * 1000 * 48), // 2 days ago
      },
    });

    const charge2 = await db.encounterCharge.create({
      data: {
        hospitalId,
        encounterId,
        serviceItemId: consultServiceItemId,
        sourceType: 'MANUAL',
        quantity: 1,
        unitPrice: 200,
        totalAmount: 200,
        createdAt: new Date(Date.now() - 3600 * 1000 * 24), // 1 day ago
      },
    });

    const charge3 = await db.encounterCharge.create({
      data: {
        hospitalId,
        encounterId,
        serviceItemId: extraServiceItemId,
        sourceType: 'RADIOLOGY_ORDER',
        quantity: 1,
        unitPrice: 150,
        totalAmount: 150,
        createdAt: new Date(), // Today
      },
    });

    // 2.3 Create interim invoice selecting charges 1 and 2, with autoApplyDeposit = true
    const interimRes = await request(app.getHttpServer())
      .post(`/billing/encounters/${encounterId}/interim-invoice`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        chargeIds: [charge1.id, charge2.id],
        autoApplyDeposit: true,
      })
      .expect(201);

    const interimInvoice = responseBody<TestResponse>(interimRes);
    expect(interimInvoice.id).toBeDefined();
    expect(Money.toDbString(interimInvoice.totalAmount)).toBe('500.000');
    expect(Money.toDbString(interimInvoice.patientShare)).toBe('500.000');

    // Because autoApplyDeposit was true, 500.000 deposit was automatically applied!
    expect(Money.toDbString(interimInvoice.paidAmount)).toBe('500.000');
    expect(interimInvoice.status).toBe(InvoiceStatus.PAID);

    // Verify charge3 remains unbilled on encounter
    const remainingCharge = await db.encounterCharge.findUnique({
      where: { id: charge3.id },
    });
    expect(remainingCharge!.invoiceId).toBeNull();

    // 2.4 Verify accounting entry for the deposit application:
    // Debit 200500 (Patient Deposits), Credit 120100 (AR Patients)
    const depositEntry = await db.accountingEntry.findFirst({
      where: {
        hospitalId,
        postingKey: `deposit:apply:${hospitalId}:${interimInvoice.payments[0].id}`,
      },
      include: { lines: { include: { account: true } } },
    });

    expect(depositEntry).toBeDefined();
    const debitLine = depositEntry!.lines.find((l) => Money.gt(l.debit, 0));
    const creditLine = depositEntry!.lines.find((l) => Money.gt(l.credit, 0));

    expect(debitLine!.account.code).toBe(ACCOUNT_CODES.PATIENT_DEPOSITS);
    expect(Money.toDbString(debitLine!.debit)).toBe('500.000');

    expect(creditLine!.account.code).toBe(ACCOUNT_CODES.AR_PATIENTS);
    expect(Money.toDbString(creditLine!.credit)).toBe('500.000');

    // 2.5 Verify updated deposit balance:
    // 2000 total - 500 applied = 1500 available
    const balRes = await request(app.getHttpServer())
      .get(`/billing/patients/${patientId}/deposits`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(
      Money.toDbString(responseBody<TestResponse>(balRes).totalDeposited),
    ).toBe('2000.000');
    expect(
      Money.toDbString(responseBody<TestResponse>(balRes).totalApplied),
    ).toBe('500.000');
    expect(
      Money.toDbString(responseBody<TestResponse>(balRes).availableBalance),
    ).toBe('1500.000');
  });

  it('Scenario 3 & 4 & 5: Manual deposit application, discharge readiness surplus detection, auto-settle, and surplus refund', async () => {
    // 3.1 Collect deposit of 1000.000 LYD
    await request(app.getHttpServer())
      .post('/billing/deposits')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        patientId,
        amount: '1000',
        requestId: randomUUID(),
        method: PaymentMethod.CASH,
      })
      .expect(201);

    // 3.2 Add a charge of 350.000 and bill it normally via createInvoice
    const specLab = await db.serviceItem.create({
      data: {
        hospitalId,
        code: `SRV-SPEC-350-${Date.now()}`,
        name: 'تحليل تخصصي متقدم',
        type: ServiceType.LAB,
        defaultPrice: 350,
        isActive: true,
      },
    });

    await db.encounterCharge.create({
      data: {
        hospitalId,
        encounterId,
        serviceItemId: specLab.id,
        sourceType: 'LAB_ORDER',
        quantity: 1,
        unitPrice: 350,
        totalAmount: 350,
      },
    });

    const invRes = await request(app.getHttpServer())
      .post(`/billing/encounters/${encounterId}/invoices`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(201);

    const invoiceId = responseBody<TestResponse>(invRes).id;
    expect(
      Money.toDbString(responseBody<TestResponse>(invRes).paidAmount),
    ).toBe('0.000');
    expect(responseBody<TestResponse>(invRes).status).toBe(
      InvoiceStatus.ISSUED,
    );

    // 3.3 Apply deposit manually to this invoice
    const applyRes = await request(app.getHttpServer())
      .post(`/billing/invoices/${invoiceId}/apply-deposit`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        invoiceId,
        amount: '350',
        requestId: randomUUID(),
      })
      .expect(201);

    expect(
      Money.toDbString(responseBody<TestResponse>(applyRes).appliedAmount),
    ).toBe('350.000');
    expect(responseBody<TestResponse>(applyRes).invoiceStatus).toBe(
      InvoiceStatus.PAID,
    );
    expect(
      Money.toDbString(
        responseBody<TestResponse>(applyRes).remainingInvoiceBalance,
      ),
    ).toBe('0.000');

    // Available deposit now = 1000 - 350 = 650.000
    // 4.1 Check discharge readiness: patient has surplus deposit of 650.000 LYD
    // First satisfy medical summary and discharge planning requirements
    await db.dischargePlanning.create({
      data: {
        admissionId,
        hospitalId,
        plannedDischargeDate: new Date(),
        medicalStability: true,
        vitalsStable: true,
        painControlled: true,
        dischargeDisposition: DischargeDisposition.HOME,
        createdBy: staffUserId,
      },
    });

    await db.dischargeSummary.create({
      data: {
        admissionId,
        encounterId,
        hospitalId,
        admissionDate: new Date(),
        dischargeDate: new Date(),
        lengthOfStay: 1,
        admissionDiagnosis: 'Cholecystitis',
        hospitalCourse: 'Course uncomplicated',
        dischargeDiagnosis: 'Post-op Recovery Uncomplicated',
        createdById: doctorUserId,
        completedAt: new Date(),
      },
    });

    const readinessRes = await request(app.getHttpServer())
      .get(`/admissions/${admissionId}/discharge-readiness`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(responseBody<TestResponse>(readinessRes).financialClearance).toBe(
      true,
    );
    expect(responseBody<TestResponse>(readinessRes).medicalClearance).toBe(
      true,
    );
    expect(responseBody<TestResponse>(readinessRes).ready).toBe(true);
    expect(
      Money.toDbString(
        responseBody<TestResponse>(readinessRes).patientDepositBalance,
      ),
    ).toBe('650.000');
    expect(responseBody<TestResponse>(readinessRes).hasSurplusDeposit).toBe(
      true,
    );
    expect(
      Money.toDbString(
        responseBody<TestResponse>(readinessRes).surplusDepositAmount,
      ),
    ).toBe('650.000');

    // 4.2 Discharge patient
    await request(app.getHttpServer())
      .post(`/admissions/${admissionId}/discharge`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        dischargeDisposition: 'HOME',
        notes: 'مريض متعافٍ مع رصيد أمانات فائض قيد الاسترداد',
      })
      .expect(201);

    const updatedAdm = await db.admission.findUnique({
      where: { id: admissionId },
    });
    expect(updatedAdm!.admissionStatus).toBe(AdmissionStatus.DISCHARGED);

    // 5.1 Refund remaining surplus deposit of 650.000 LYD to the patient
    const refundRes = await request(app.getHttpServer())
      .post('/billing/deposits/refund')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        patientId,
        amount: '650',
        requestId: randomUUID(),
        method: PaymentMethod.CASH,
        reason: 'تسوية خروج نهائي وصرف فائض الأمانات نقداً',
      })
      .expect(201);

    expect(responseBody<TestResponse>(refundRes).id).toBeDefined();
    expect(responseBody<TestResponse>(refundRes).type).toBe(
      VoucherType.PAYMENT,
    );
    expect(responseBody<TestResponse>(refundRes).status).toBe(
      VoucherStatus.POSTED,
    );
    expect(Money.toDbString(responseBody<TestResponse>(refundRes).amount)).toBe(
      '650.000',
    );
    expect(responseBody<TestResponse>(refundRes).code).toMatch(/^PV-DEP-\d+/);

    // Verify refund journal entry:
    // Debit 200500 (Patient Deposits), Credit 100100 (Cash Main)
    const refundEntry = await db.accountingEntry.findFirst({
      where: {
        hospitalId,
        sourceModule: 'VOUCHER',
        sourceId: responseBody<TestResponse>(refundRes).id,
      },
      include: { lines: { include: { account: true } } },
    });

    expect(refundEntry).toBeDefined();
    const refundDebit = refundEntry!.lines.find((l) => Money.gt(l.debit, 0));
    const refundCredit = refundEntry!.lines.find((l) => Money.gt(l.credit, 0));

    expect(refundDebit!.account.code).toBe(ACCOUNT_CODES.PATIENT_DEPOSITS);
    expect(Money.toDbString(refundDebit!.debit)).toBe('650.000');

    expect(refundCredit!.account.code).toBe(ACCOUNT_CODES.CASH_MAIN);
    expect(Money.toDbString(refundCredit!.credit)).toBe('650.000');

    // 5.2 Final check on patient deposit balance: exactly 0.000 remaining
    const finalBalRes = await request(app.getHttpServer())
      .get(`/billing/patients/${patientId}/deposits`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(
      Money.toDbString(responseBody<TestResponse>(finalBalRes).totalDeposited),
    ).toBe('1000.000');
    expect(
      Money.toDbString(responseBody<TestResponse>(finalBalRes).totalApplied),
    ).toBe('350.000');
    expect(
      Money.toDbString(responseBody<TestResponse>(finalBalRes).totalRefunded),
    ).toBe('650.000');
    expect(
      Money.toDbString(
        responseBody<TestResponse>(finalBalRes).availableBalance,
      ),
    ).toBe('0.000');
  });

  it('Scenario 6: Enforces strict validation, over-refund rejection, and multi-tenant isolation', async () => {
    // 6.1 Deposit 300.000
    await request(app.getHttpServer())
      .post('/billing/deposits')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        patientId,
        amount: '300',
        requestId: randomUUID(),
        method: PaymentMethod.CASH,
      })
      .expect(201);

    // 6.2 Attempting to refund 500.000 (> 300 available) must be rejected with 400 Bad Request
    await request(app.getHttpServer())
      .post('/billing/deposits/refund')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        patientId,
        amount: '500',
        requestId: randomUUID(),
        method: PaymentMethod.CASH,
        reason: 'محاولة استرداد تتجاوز الرصيد',
      })
      .expect(400);

    expect(
      await db.voucher.count({ where: { hospitalId, type: 'PAYMENT' } }),
    ).toBe(0);

    // 6.3 Attempting negative or zero deposit must be rejected
    await request(app.getHttpServer())
      .post('/billing/deposits')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        patientId,
        amount: -100,
        method: PaymentMethod.CASH,
      })
      .expect(400);

    // 6.4 Multi-tenant isolation: Hospital B staff cannot view or deposit to Hospital A patient
    await request(app.getHttpServer())
      .get(`/billing/patients/${patientId}/deposits`)
      .set('Authorization', `Bearer ${otherStaffToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post('/billing/deposits')
      .set('Authorization', `Bearer ${otherStaffToken}`)
      .send({
        patientId, // Patient belonging to Hospital A
        amount: '200',
        requestId: randomUUID(),
        method: PaymentMethod.CASH,
      })
      .expect(404);
  });
});
