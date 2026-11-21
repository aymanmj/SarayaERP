import { responseBody } from '../http-response';
type TestResponse = {
  id: number;
  daysCount: number;
  totalBasic: string;
  totalAllowances: string;
  totalDeductions: string;
  totalNet: string;
  slips: {
    userId: number;
    basicSalary: string;
    housingAllowance: string;
    transportAllowance: string;
    commissionAmount: string;
    otherAllowance: string;
    totalAllowances: string;
    deductions: string;
    netSalary: string;
  }[];
};
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccountingService } from '../../src/accounting/accounting.service';
import { Money } from '../../src/common/utils/money.util';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('HR, Leave Balance, Roster Tenant Isolation & Payroll Accounting Integrity (HR01 / FLOW04 / SEC03 / OPS03)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let auth: AuthHelper;
  let hospitalId: number;
  let otherHospitalId: number;
  let adminUserId: number;
  let adminToken: string;
  let otherToken: string;
  let expenseAccountId: number;
  let payableAccountId: number;

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
    if (db) {
      await db
        .$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS trg_fail_payroll_approve_audit ON "AuditLog"`,
        )
        .catch(() => undefined);
      await db
        .$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS fail_payroll_approve_audit()`,
        )
        .catch(() => undefined);
    }
    if (app) await app.close();
  });

  beforeEach(async () => {
    await db
      .$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS trg_fail_payroll_approve_audit ON "AuditLog"`,
      )
      .catch(() => undefined);
    await db
      .$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_payroll_approve_audit()`)
      .catch(() => undefined);
    await resetDatabase(db);

    auth = new AuthHelper(db, app.get(JwtService));
    const admin = await auth.createTestUser('hr-payroll-admin', 'synthetic', {
      permissions: [
        'hr:view',
        'hr:manage',
        'attendance:manage',
        'payroll:view',
        'payroll:manage',
      ],
    });
    hospitalId = admin.user.hospitalId;
    adminUserId = admin.user.id;
    adminToken = admin.accessToken;

    // Give admin 0 salary so payroll tests focus on explicit employees
    await db.user.update({
      where: { id: adminUserId },
      data: {
        basicSalary: '0.000',
        housingAllowance: '0.000',
        transportAllowance: '0.000',
        otherAllowance: '0.000',
      },
    });

    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_OTHER_HR_${Date.now()}`,
        name: 'Other HR Hospital',
        isActive: true,
      },
    });
    otherHospitalId = otherHospital.id;

    const otherAdmin = await auth.createTestUser(
      'other-hr-admin',
      'synthetic',
      {
        hospitalId: otherHospitalId,
        permissions: [
          'hr:view',
          'hr:manage',
          'attendance:manage',
          'payroll:view',
          'payroll:manage',
        ],
      },
    );
    otherToken = otherAdmin.accessToken;

    // Set up open financial year & November 2026 period + payroll system accounts
    const fy = await db.financialYear.create({
      data: {
        hospitalId,
        name: 'FY 2026',
        code: 'FY-2026',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T23:59:59.999Z'),
        status: 'OPEN',
        isCurrent: true,
      },
    });

    await db.financialPeriod.create({
      data: {
        financialYearId: fy.id,
        periodIndex: 11,
        periodCode: '2026-11',
        monthStartDate: new Date('2026-11-01T00:00:00.000Z'),
        monthEndDate: new Date('2026-11-30T23:59:59.999Z'),
        numberOfDays: 30,
        isOpen: true,
      },
    });

    const expAcc = await db.account.create({
      data: {
        hospitalId,
        code: '500100',
        name: 'مصروف الرواتب والأجور',
        type: 'EXPENSE',
        isActive: true,
      },
    });
    expenseAccountId = expAcc.id;

    const payAcc = await db.account.create({
      data: {
        hospitalId,
        code: '200300',
        name: 'رواتب وأجور مستحقة',
        type: 'LIABILITY',
        isActive: true,
      },
    });
    payableAccountId = payAcc.id;

    await db.systemAccountMapping.createMany({
      data: [
        {
          hospitalId,
          key: 'SALARIES_EXPENSE',
          accountId: expenseAccountId,
          isActive: true,
        },
        {
          hospitalId,
          key: 'SALARIES_PAYABLE',
          accountId: payableAccountId,
          isActive: true,
        },
      ],
    });
  });

  it('enforces shift/roster/attendance tenant isolation, leave date & pending balance validation, and atomic single approval with audit', async () => {
    const empAuth = await auth.createTestUser('emp-leave-user', 'synthetic', {
      hospitalId,
      permissions: ['hr:view', 'hr:manage'],
    });
    const empId = empAuth.user.id;
    const empToken = empAuth.accessToken;

    await db.user.update({
      where: { id: empId },
      data: { annualLeaveBalance: 10 },
    });

    // 1. Invalid shift time rejected
    await request(app.getHttpServer())
      .post('/hr/shifts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'وردية خاطئة',
        type: 'MORNING',
        startTime: '25:00',
        endTime: '16:00',
      })
      .expect(400);

    // 2. Valid shift creation
    const shiftRes = await request(app.getHttpServer())
      .post('/hr/shifts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'وردية صباحية',
        type: 'MORNING',
        startTime: '08:00',
        endTime: '16:00',
        graceMinutes: 15,
      })
      .expect(201);
    const shiftId = responseBody<TestResponse>(shiftRes).id;

    // 3. Roster inverted dates rejected
    await request(app.getHttpServer())
      .post('/hr/roster/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: empId,
        workShiftId: shiftId,
        fromDate: '2026-11-05',
        toDate: '2026-11-01',
      })
      .expect(400);

    // 4. Cross-tenant roster & attendance punch rejected
    await request(app.getHttpServer())
      .post('/hr/roster/assign')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        userId: empId,
        workShiftId: shiftId,
        fromDate: '2026-11-01',
        toDate: '2026-11-04',
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/attendance/punch')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        userId: empId,
        timestamp: '2026-11-01T08:00:00.000Z',
      })
      .expect(404);

    // 5. Valid roster assignment
    await request(app.getHttpServer())
      .post('/hr/roster/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: empId,
        workShiftId: shiftId,
        fromDate: '2026-11-01',
        toDate: '2026-11-04',
      })
      .expect(201);

    // 6. Leave request with inverted dates rejected
    await request(app.getHttpServer())
      .post('/hr/leaves')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        type: 'ANNUAL',
        startDate: '2026-11-06',
        endDate: '2026-11-01',
        reason: 'تواريخ معكوسة',
      })
      .expect(400);

    // 7. Submit 6-day ANNUAL leave request (balance = 10)
    const leaveRes = await request(app.getHttpServer())
      .post('/hr/leaves')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        type: 'ANNUAL',
        startDate: '2026-11-01',
        endDate: '2026-11-06',
        reason: 'إجازة سنوية',
      })
      .expect(201);
    expect(responseBody<TestResponse>(leaveRes).daysCount).toBe(6);

    // 8. Overlapping leave request rejected
    await request(app.getHttpServer())
      .post('/hr/leaves')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        type: 'SICK',
        startDate: '2026-11-04',
        endDate: '2026-11-08',
        reason: 'تداخل',
      })
      .expect(400);

    // 9. Second ANNUAL leave request exceeding remaining available balance (10 - 6 = 4 < 5) rejected
    await request(app.getHttpServer())
      .post('/hr/leaves')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        type: 'ANNUAL',
        startDate: '2026-11-10',
        endDate: '2026-11-14',
        reason: 'تجاوز الرصيد المتاح مع المعلق',
      })
      .expect(400);

    // 10. Concurrent approval of the 6-day leave request: only one succeeds, balance decremented once
    const [app1, app2] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/hr/leaves/${responseBody<TestResponse>(leaveRes).id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' }),
      request(app.getHttpServer())
        .patch(`/hr/leaves/${responseBody<TestResponse>(leaveRes).id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' }),
    ]);

    expect([app1.status, app2.status].sort()).toEqual([200, 400]);

    const updatedEmp = await db.user.findUniqueOrThrow({
      where: { id: empId },
    });
    expect(updatedEmp.annualLeaveBalance).toBe(4);

    const audit = await db.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'APPROVE_LEAVE_REQUEST',
        entity: 'LeaveRequest',
        entityId: responseBody<TestResponse>(leaveRes).id,
      },
    });
    expect(audit).toBeTruthy();
  });

  it('computes payroll with exact Money precision for paid leave, absence, late/overtime, doctor & surgical commissions, and draft regeneration', async () => {
    const docAuth = await auth.createTestUser('doc-payroll-user', 'synthetic', {
      hospitalId,
      permissions: ['hr:view', 'hr:manage'],
    });
    const docId = docAuth.user.id;
    const docToken = docAuth.accessToken;

    await db.user.update({
      where: { id: docId },
      data: {
        isActive: true,
        isDoctor: true,
        basicSalary: '3000.000',
        housingAllowance: '500.000',
        transportAllowance: '250.000',
        otherAllowance: '100.000',
        annualLeaveBalance: 15,
      },
    });

    const shiftRes = await request(app.getHttpServer())
      .post('/hr/shifts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'وردية الأطباء',
        type: 'MORNING',
        startTime: '08:00',
        endTime: '16:00',
        graceMinutes: 15,
      })
      .expect(201);
    const shiftId = responseBody<TestResponse>(shiftRes).id;

    // Roster 3 workdays (Nov 1, 2, 3)
    await request(app.getHttpServer())
      .post('/hr/roster/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: docId,
        workShiftId: shiftId,
        fromDate: '2026-11-01',
        toDate: '2026-11-03',
        isOffDay: false,
      })
      .expect(201);

    // Day 1 (Nov 1): Approved paid ANNUAL leave -> not counted as absent
    const leaveRes = await request(app.getHttpServer())
      .post('/hr/leaves')
      .set('Authorization', `Bearer ${docToken}`)
      .send({
        type: 'ANNUAL',
        startDate: '2026-11-01',
        endDate: '2026-11-01',
        reason: 'إجازة يوم واحد',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/hr/leaves/${responseBody<TestResponse>(leaveRes).id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);

    // Day 2 (Nov 2): Absent (no attendance record) -> 1 absent day = 3000 / 30 = 100.000
    // Day 3 (Nov 3): Check-in 08:30 UTC, Check-out 18:00 UTC (30 mins late = 6.250 deduction, 2h overtime = 37.500 addition)
    const nov3In = new Date('2026-11-03T08:30:00.000Z');
    const nov3Out = new Date('2026-11-03T18:00:00.000Z');

    await request(app.getHttpServer())
      .post('/attendance/punch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: docId, timestamp: nov3In.toISOString() })
      .expect(201);

    await request(app.getHttpServer())
      .post('/attendance/punch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: docId, timestamp: nov3Out.toISOString() })
      .expect(201);

    // Commission rule: CONSULTATION = 25%
    await db.commissionRule.create({
      data: {
        hospitalId,
        serviceType: 'CONSULTATION',
        doctorId: docId,
        doctorRate: '25.00',
        hospitalRate: '75.00',
        isActive: true,
      },
    });

    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: `MRN-PAY-${Date.now()}`,
        fullName: 'مريض كشف الرواتب',
        gender: 'MALE',
      },
    });

    const encounter = await db.encounter.create({
      data: {
        hospitalId,
        patientId: patient.id,
        doctorId: docId,
        type: 'OPD',
        status: 'OPEN',
      },
    });

    const consultService = await db.serviceItem.create({
      data: {
        hospitalId,
        code: `CONS-${Date.now()}`,
        name: 'استشارة تخصصية',
        type: 'CONSULTATION',
        defaultPrice: '400.000',
        isActive: true,
        isBillable: true,
      },
    });

    const surgService = await db.serviceItem.create({
      data: {
        hospitalId,
        code: `SURG-${Date.now()}`,
        name: 'عملية جراحية',
        type: 'SURGERY',
        defaultPrice: '1000.000',
        isActive: true,
        isBillable: true,
      },
    });

    const invoice = await db.invoice.create({
      data: {
        hospitalId,
        patientId: patient.id,
        encounterId: encounter.id,
        status: 'ISSUED',
        totalAmount: '1400.000',
        discountAmount: '0.000',
        paidAmount: '0.000',
        patientShare: '1400.000',
        insuranceShare: '0.000',
      },
    });

    const theatre = await db.operatingTheatre.create({
      data: {
        hospitalId,
        name: 'غرفة عمليات 1',
        isActive: true,
      },
    });

    const surgeryCase = await db.surgeryCase.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        theatreId: theatre.id,
        surgeryName: 'عملية منظار',
        serviceItemId: surgService.id,
        scheduledStart: new Date('2026-11-10T09:00:00.000Z'),
        scheduledEnd: new Date('2026-11-10T11:00:00.000Z'),
        actualStart: new Date('2026-11-10T09:05:00.000Z'),
        actualEnd: new Date('2026-11-10T10:55:00.000Z'),
        status: 'COMPLETED',
      },
    });

    await db.surgeryTeam.create({
      data: {
        surgeryCaseId: surgeryCase.id,
        userId: docId,
        role: 'SURGEON',
        commissionAmount: '150.000',
      },
    });

    // Consultation charge (invoiced) -> 25% of 400.000 = 100.000
    await db.encounterCharge.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        serviceItemId: consultService.id,
        sourceType: 'MANUAL',
        quantity: 1,
        unitPrice: '400.000',
        totalAmount: '400.000',
        performerId: docId,
        invoiceId: invoice.id,
        createdAt: new Date('2026-11-05T12:00:00.000Z'),
      },
    });

    // Surgery charge (invoiced) linked to surgeryCase.id -> must NOT be double-counted on top of SurgeryTeam.commissionAmount
    await db.encounterCharge.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        serviceItemId: surgService.id,
        sourceType: 'SURGERY',
        sourceId: surgeryCase.id,
        quantity: 1,
        unitPrice: '1000.000',
        totalAmount: '1000.000',
        performerId: docId,
        invoiceId: invoice.id,
        createdAt: new Date('2026-11-10T11:00:00.000Z'),
      },
    });

    // Generate payroll for 11/2026
    const gen1 = await request(app.getHttpServer())
      .post('/payroll/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ month: 11, year: 2026 })
      .expect(201);

    expect(Money.toDbString(responseBody<TestResponse>(gen1).totalBasic)).toBe(
      '3000.000',
    );
    expect(
      Money.toDbString(responseBody<TestResponse>(gen1).totalAllowances),
    ).toBe('1137.500');
    expect(
      Money.toDbString(responseBody<TestResponse>(gen1).totalDeductions),
    ).toBe('106.250');
    expect(Money.toDbString(responseBody<TestResponse>(gen1).totalNet)).toBe(
      '4031.250',
    );

    // Regenerate DRAFT payroll for 11/2026 cleanly
    const gen2 = await request(app.getHttpServer())
      .post('/payroll/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ month: 11, year: 2026 })
      .expect(201);

    const detailRes = await request(app.getHttpServer())
      .get(`/payroll/${responseBody<TestResponse>(gen2).id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const docSlip = responseBody<TestResponse>(detailRes).slips.find(
      (s) => s.userId === docId,
    )!;
    expect(docSlip).toBeTruthy();
    expect(Money.toDbString(docSlip.basicSalary)).toBe('3000.000');
    expect(Money.toDbString(docSlip.housingAllowance)).toBe('500.000');
    expect(Money.toDbString(docSlip.transportAllowance)).toBe('250.000');
    expect(Money.toDbString(docSlip.commissionAmount)).toBe('250.000');
    expect(Money.toDbString(docSlip.otherAllowance)).toBe('387.500');
    expect(Money.toDbString(docSlip.totalAllowances)).toBe('1137.500');
    expect(Money.toDbString(docSlip.deductions)).toBe('106.250');
    expect(Money.toDbString(docSlip.netSalary)).toBe('4031.250');
  });

  it('rolls back approval on audit failure, serializes concurrent approvals, posts balanced accounting entry, and blocks deletion/regeneration/reversal after approval', async () => {
    const empAuth = await auth.createTestUser('emp-approve-user', 'synthetic', {
      hospitalId,
    });

    await db.user.update({
      where: { id: empAuth.user.id },
      data: {
        isActive: true,
        basicSalary: '2000.000',
        housingAllowance: '300.000',
        transportAllowance: '150.000',
        otherAllowance: '50.000',
      },
    });

    const genRes = await request(app.getHttpServer())
      .post('/payroll/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ month: 11, year: 2026 })
      .expect(201);
    const runId = responseBody<TestResponse>(genRes).id;

    // 1. Simulate audit failure on APPROVE_PAYROLL_RUN -> atomic rollback of status and accounting entry
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_payroll_approve_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'APPROVE_PAYROLL_RUN' THEN
          RAISE EXCEPTION 'Simulated audit failure on payroll approval';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS trg_fail_payroll_approve_audit ON "AuditLog"`,
    );
    await db.$executeRawUnsafe(`
      CREATE TRIGGER trg_fail_payroll_approve_audit
      BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION fail_payroll_approve_audit();
    `);

    const failedApprove = await request(app.getHttpServer())
      .post(`/payroll/${runId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(failedApprove.status).toBeGreaterThanOrEqual(400);

    const runAfterFailedApprove = await db.payrollRun.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(runAfterFailedApprove.status).toBe('DRAFT');
    expect(runAfterFailedApprove.accountingEntryId).toBeNull();

    const entriesAfterFail = await db.accountingEntry.count({
      where: { hospitalId, sourceModule: 'PAYROLL', sourceId: runId },
    });
    expect(entriesAfterFail).toBe(0);

    // 2. Remove fault trigger and fire two concurrent approval requests
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS trg_fail_payroll_approve_audit ON "AuditLog"`,
    );
    await db.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS fail_payroll_approve_audit()`,
    );

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/payroll/${runId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app.getHttpServer())
        .post(`/payroll/${runId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);

    expect([res1.status, res2.status].sort()).toEqual([201, 400]);

    const approvedRun = await db.payrollRun.findUniqueOrThrow({
      where: { id: runId },
      include: { accountingEntry: { include: { lines: true } } },
    });
    expect(approvedRun.status).toBe('APPROVED');
    expect(approvedRun.accountingEntry).toBeTruthy();
    expect(approvedRun.accountingEntry?.postingKey).toBe(
      `payroll-run:${hospitalId}:${runId}`,
    );

    const debitLine = approvedRun.accountingEntry!.lines.find(
      (l) => l.accountId === expenseAccountId,
    );
    const creditLine = approvedRun.accountingEntry!.lines.find(
      (l) => l.accountId === payableAccountId,
    );
    expect(Money.toDbString(debitLine?.debit)).toBe('2500.000');
    expect(Money.toDbString(creditLine?.credit)).toBe('2500.000');

    // 3. Approved payroll cannot be regenerated, deleted, or manually reversed
    await request(app.getHttpServer())
      .post('/payroll/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ month: 11, year: 2026 })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/payroll/${runId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const accountingService = app.get(AccountingService);
    await expect(
      accountingService.reverseEntry(
        hospitalId,
        approvedRun.accountingEntryId!,
        adminUserId,
        'محاولة عكس يدوي لكشف رواتب معتمد',
      ),
    ).rejects.toThrow();
  });
});
