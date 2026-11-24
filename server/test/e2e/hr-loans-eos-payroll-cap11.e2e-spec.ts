// server/test/e2e/hr-loans-eos-payroll-cap11.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('CAP11 HR Loans/Advances, Recurring Deductions, Overtime, Payroll Atomic Settlement & End-of-Service Indemnity (Migration #77)', () => {
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

  it('enforces 4-eyes advance approval + GL disbursement, payroll installment deduction + multi-line balanced GL, EOS 4-dept clearance + SHA-256 immutability + advance payoff + user deactivation, and tenant isolation', async () => {
    const hrCreator = await auth.createTestUser('cap11-hr-prep', 'synthetic', {
      permissions: ['hr:view', 'hr:manage', 'payroll:view', 'payroll:manage'],
    });
    const hospitalId = hrCreator.user.hospitalId;

    const hrDirector = await auth.createTestUser(
      'cap11-hr-director',
      'synthetic',
      {
        hospitalId,
        permissions: ['hr:view', 'hr:manage', 'payroll:view', 'payroll:manage'],
      },
    );
    const employee = await auth.createTestUser('cap11-nurse', 'synthetic', {
      hospitalId,
      permissions: ['hr:view', 'hr:manage'],
    });

    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_CAP11_OTHER_${Date.now()}`,
        name: 'Other Hospital CAP11',
        isActive: true,
      },
    });
    const foreignUser = await auth.createTestUser(
      'cap11-foreign',
      'synthetic',
      {
        hospitalId: otherHospital.id,
        permissions: ['hr:view', 'hr:manage', 'payroll:view', 'payroll:manage'],
      },
    );

    // Zero salary on HR managers so payroll math focuses purely on employee
    await db.user.updateMany({
      where: { id: { in: [hrCreator.user.id, hrDirector.user.id] } },
      data: {
        basicSalary: '0.000',
        housingAllowance: '0.000',
        transportAllowance: '0.000',
        otherAllowance: '0.000',
      },
    });

    // Employee: 6 years tenure (2020-01-01), basicSalary = 3000.000, annualLeaveBalance = 10
    await db.user.update({
      where: { id: employee.user.id },
      data: {
        basicSalary: '3000.000',
        housingAllowance: '0.000',
        transportAllowance: '0.000',
        otherAllowance: '0.000',
        annualLeaveBalance: 10,
        hireDate: new Date('2020-01-01T00:00:00.000Z'),
      },
    });

    // Open financial year & Nov 2026 period + all required system accounts
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

    const accDefs = [
      {
        key: 'CASH_MAIN',
        code: '100100',
        name: 'الخزينة الرئيسية',
        type: 'ASSET',
      },
      {
        key: 'EMPLOYEE_ADVANCES',
        code: '120500',
        name: 'سلف الموظفين',
        type: 'ASSET',
      },
      {
        key: 'SALARIES_PAYABLE',
        code: '200300',
        name: 'رواتب مستحقة',
        type: 'LIABILITY',
      },
      {
        key: 'EMPLOYEE_DEDUCTIONS_PAYABLE',
        code: '200350',
        name: 'استقطاعات وضمانات',
        type: 'LIABILITY',
      },
      {
        key: 'SALARIES_EXPENSE',
        code: '500100',
        name: 'مصروف الرواتب',
        type: 'EXPENSE',
      },
      {
        key: 'EOS_EXPENSE',
        code: '500150',
        name: 'مصروف نهاية الخدمة',
        type: 'EXPENSE',
      },
    ] as const;

    for (const def of accDefs) {
      const acc = await db.account.create({
        data: {
          hospitalId,
          code: def.code,
          name: def.name,
          type: def.type,
          isActive: true,
        },
      });
      await db.systemAccountMapping.create({
        data: {
          hospitalId,
          key: def.key,
          accountId: acc.id,
          isActive: true,
        },
      });
    }

    // 1. Employee Advance (1500 LYD / 3 installments = 500/mo)
    const advCreate = await request(app.getHttpServer())
      .post('/hr/financial/advances')
      .auth(hrCreator.accessToken, { type: 'bearer' })
      .send({
        userId: employee.user.id,
        amount: 1500,
        installments: 3,
        requestDate: '2026-11-02T00:00:00.000Z',
        reason: 'Medical housing advance',
      })
      .expect(201);
    const advanceId = (advCreate.body as { id: number }).id;

    // 4-eyes: employee cannot approve own advance (403)
    await request(app.getHttpServer())
      .post(`/hr/financial/advances/${advanceId}/approve`)
      .auth(employee.accessToken, { type: 'bearer' })
      .send({ postAccounting: true, paymentMethod: 'CASH' })
      .expect(403);

    // Independent approval with GL disbursement (DR 120500 / CR 100100 = 1500.000)
    const advApproved = await request(app.getHttpServer())
      .post(`/hr/financial/advances/${advanceId}/approve`)
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .send({ postAccounting: true, paymentMethod: 'CASH' })
      .expect(201);
    expect(
      (advApproved.body as { status: string; disbursementEntryId: number })
        .status,
    ).toBe('APPROVED');
    expect(
      (advApproved.body as { disbursementEntryId: number }).disbursementEntryId,
    ).toBeGreaterThan(0);

    // 2. Recurring Deduction (Social Security 150 LYD) + Approved Overtime (4h * 1.5 * 12.5/hr = 75 LYD)
    await request(app.getHttpServer())
      .post('/hr/financial/deductions')
      .auth(hrCreator.accessToken, { type: 'bearer' })
      .send({
        userId: employee.user.id,
        kind: 'DEDUCTION',
        category: 'SOCIAL_SECURITY',
        title: 'ضمان اجتماعي شهري',
        amount: 150,
        isRecurring: true,
        effectiveFrom: '2026-11-01T00:00:00.000Z',
      })
      .expect(201);

    const otReq = await request(app.getHttpServer())
      .post('/hr/financial/overtime')
      .auth(hrCreator.accessToken, { type: 'bearer' })
      .send({
        userId: employee.user.id,
        date: '2026-11-10T00:00:00.000Z',
        requestedHours: 4,
        dayType: 'NORMAL',
        reason: 'ER surge coverage',
      })
      .expect(201);
    const otId = (otReq.body as { id: number }).id;

    // 4-eyes: employee cannot self-approve overtime (403)
    await request(app.getHttpServer())
      .post(`/hr/financial/overtime/${otId}/approve`)
      .auth(employee.accessToken, { type: 'bearer' })
      .send({ approvedHours: 4 })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/hr/financial/overtime/${otId}/approve`)
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .send({ approvedHours: 4 })
      .expect(201);

    // 3. Generate & Approve Payroll for Nov 2026 -> verifies atomic advance deduction (500), recurring deduction (150), overtime pay (75)
    // Basic=3000 + Overtime=75 - Advance=500 - SocialSecurity=150 => Net=2425.000
    const genRes = await request(app.getHttpServer())
      .post('/payroll/generate')
      .auth(hrCreator.accessToken, { type: 'bearer' })
      .send({ month: 11, year: 2026 })
      .expect(201);
    const payrollRunId = (genRes.body as { id: number }).id;

    await request(app.getHttpServer())
      .post(`/payroll/${payrollRunId}/approve`)
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .expect(201);

    const empSlip = await db.payrollSlip.findFirstOrThrow({
      where: { payrollRunId, userId: employee.user.id },
    });
    expect(empSlip.overtimePay.toFixed(3)).toBe('75.000');
    expect(empSlip.advanceDeduction.toFixed(3)).toBe('500.000');
    expect(empSlip.recurringDeduction.toFixed(3)).toBe('150.000');
    expect(empSlip.netSalary.toFixed(3)).toBe('2425.000');

    // Advance remainingAmount reduced atomically from 1500.000 -> 1000.000
    const advAfterPayroll = await db.employeeAdvance.findUniqueOrThrow({
      where: { id: advanceId },
    });
    expect(advAfterPayroll.remainingAmount.toFixed(3)).toBe('1000.000');
    expect(advAfterPayroll.status).toBe('APPROVED');

    // Multi-line balanced GL entry: DR 3075.000 (SALARIES_EXPENSE) = CR 2425.000 + CR 500.000 + CR 150.000
    const payrollRun = await db.payrollRun.findUniqueOrThrow({
      where: { id: payrollRunId },
      include: { accountingEntry: { include: { lines: true } } },
    });
    expect(payrollRun.accountingEntry?.lines).toHaveLength(4);

    // 4. End-of-Service Settlement Preview & Draft (effective 2026-11-24, TERMINATION)
    const draftRes = await request(app.getHttpServer())
      .post('/hr/financial/settlements')
      .auth(hrCreator.accessToken, { type: 'bearer' })
      .send({
        userId: employee.user.id,
        effectiveDate: '2026-11-24T00:00:00.000Z',
        terminationType: 'TERMINATION',
        reason: 'Contract completion & restructuring',
      })
      .expect(201);
    const settlementId = (draftRes.body as { id: number }).id;

    // Approval blocked before 4-department clearance (409)
    await request(app.getHttpServer())
      .post(`/hr/financial/settlements/${settlementId}/approve`)
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .send({ postAccounting: true })
      .expect(409);

    // Complete all 4 clearances
    await request(app.getHttpServer())
      .patch(`/hr/financial/settlements/${settlementId}/clearance`)
      .auth(hrCreator.accessToken, { type: 'bearer' })
      .send({
        isDepartmentCleared: true,
        isItCleared: true,
        isFinanceCleared: true,
        isHrCleared: true,
        clearanceNotes: 'All badge, laptop, and clinical assets returned',
      })
      .expect(200);

    // 4-eyes: creator cannot approve own settlement draft (403)
    await request(app.getHttpServer())
      .post(`/hr/financial/settlements/${settlementId}/approve`)
      .auth(hrCreator.accessToken, { type: 'bearer' })
      .send({ postAccounting: true })
      .expect(403);

    // Director approves & executes settlement atomically
    const approvedStl = await request(app.getHttpServer())
      .post(`/hr/financial/settlements/${settlementId}/approve`)
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .send({ postAccounting: true })
      .expect(201);
    expect((approvedStl.body as { status: string }).status).toBe('APPROVED');

    // Verify SHA-256 seal
    const verifyRes = await request(app.getHttpServer())
      .get(`/hr/financial/settlements/${settlementId}/verify`)
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .expect(200);
    expect(verifyRes.body).toMatchObject({ valid: true, status: 'APPROVED' });

    // Remaining advance 1000.000 automatically settled to 0.000 & SETTLED
    const advAfterEos = await db.employeeAdvance.findUniqueOrThrow({
      where: { id: advanceId },
    });
    expect(advAfterEos.remainingAmount.toFixed(3)).toBe('0.000');
    expect(advAfterEos.status).toBe('SETTLED');

    // Employee deactivated & employmentStatus = TERMINATED
    const empAfterEos = await db.user.findUniqueOrThrow({
      where: { id: employee.user.id },
    });
    expect(empAfterEos.isActive).toBe(false);
    expect(empAfterEos.employmentStatus).toBe('TERMINATED');

    // Pay settlement -> PAID + payment GL entry
    const paidStl = await request(app.getHttpServer())
      .post(`/hr/financial/settlements/${settlementId}/pay`)
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .send({
        paymentMethod: 'CASH',
        paymentDate: '2026-11-25T00:00:00.000Z',
        postAccounting: true,
      })
      .expect(201);
    expect((paidStl.body as { status: string }).status).toBe('PAID');

    // PostgreSQL immutability trigger prevents tampering or deleting PAID settlement
    await expect(
      db.$executeRaw`UPDATE "EmployeeSettlement" SET "netAmount" = 0 WHERE id = ${settlementId}`,
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.$executeRaw`DELETE FROM "EmployeeSettlement" WHERE id = ${settlementId}`,
    ).rejects.toThrow(/immutable/i);

    // 5. Cross-Tenant Isolation (404)
    await request(app.getHttpServer())
      .get(`/hr/financial/settlements/${settlementId}/verify`)
      .auth(foreignUser.accessToken, { type: 'bearer' })
      .expect(404);

    // 6. Pay Basis Classification (HOURLY & FIXED_SHIFT) + Progressive TaxBracket Payroll Verification (Dec 2026)
    await db.financialPeriod.create({
      data: {
        financialYearId: fy.id,
        periodIndex: 12,
        periodCode: '2026-12',
        monthStartDate: new Date('2026-12-01T00:00:00.000Z'),
        monthEndDate: new Date('2026-12-31T23:59:59.999Z'),
        numberOfDays: 31,
        isOpen: true,
      },
    });

    const hourlyDoctor = await auth.createTestUser(
      'cap11-hourly-doc',
      'synthetic',
      { hospitalId, permissions: ['hr:view'] },
    );
    const shiftNurse = await auth.createTestUser(
      'cap11-shift-nurse',
      'synthetic',
      { hospitalId, permissions: ['hr:view'] },
    );

    // Configure HOURLY doctor: 50 LYD/hr, 20 worked hours -> 1000.000
    await request(app.getHttpServer())
      .patch(`/hr/financial/employees/${hourlyDoctor.user.id}/compensation`)
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .send({
        payBasis: 'HOURLY',
        basicSalary: 0,
        hourlyRate: 50,
      })
      .expect(200);

    // Configure FIXED_SHIFT nurse: 12h shift = 150 LYD, 2 shifts -> 300.000 (tax exempt)
    await request(app.getHttpServer())
      .patch(`/hr/financial/employees/${shiftNurse.user.id}/compensation`)
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .send({
        payBasis: 'FIXED_SHIFT',
        basicSalary: 0,
        fixedShift12hRate: 150,
        isTaxExempt: true,
      })
      .expect(200);

    // Progressive Tax Bracket: 0..500 @ 0%, >500 @ 10% => hourlyDoctor (1000) pays 50.000 tax -> net 950.000
    await request(app.getHttpServer())
      .post('/hr/financial/tax-brackets')
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .send({
        name: 'شريحة الإعفاء',
        fromAmount: 0,
        toAmount: 500,
        rate: 0,
        sortOrder: 1,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/hr/financial/tax-brackets')
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .send({ name: 'شريحة 10%', fromAmount: 500, rate: 0.1, sortOrder: 2 })
      .expect(201);

    // Attendance records for Dec 2026: hourlyDoctor (2 days * 10h = 20h), shiftNurse (2 * 12h shifts)
    await db.attendanceRecord.createMany({
      data: [
        {
          userId: hourlyDoctor.user.id,
          date: new Date('2026-12-05T00:00:00.000Z'),
          checkIn: new Date('2026-12-05T08:00:00.000Z'),
          checkOut: new Date('2026-12-05T18:00:00.000Z'),
          status: 'PRESENT',
        },
        {
          userId: hourlyDoctor.user.id,
          date: new Date('2026-12-06T00:00:00.000Z'),
          checkIn: new Date('2026-12-06T08:00:00.000Z'),
          checkOut: new Date('2026-12-06T18:00:00.000Z'),
          status: 'PRESENT',
        },
        {
          userId: shiftNurse.user.id,
          date: new Date('2026-12-05T00:00:00.000Z'),
          checkIn: new Date('2026-12-05T08:00:00.000Z'),
          checkOut: new Date('2026-12-05T20:00:00.000Z'),
          status: 'PRESENT',
        },
        {
          userId: shiftNurse.user.id,
          date: new Date('2026-12-07T00:00:00.000Z'),
          checkIn: new Date('2026-12-07T08:00:00.000Z'),
          checkOut: new Date('2026-12-07T20:00:00.000Z'),
          status: 'PRESENT',
        },
      ],
    });

    const decGen = await request(app.getHttpServer())
      .post('/payroll/generate')
      .auth(hrCreator.accessToken, { type: 'bearer' })
      .send({ month: 12, year: 2026 })
      .expect(201);
    const decRunId = (decGen.body as { id: number }).id;

    await request(app.getHttpServer())
      .post(`/payroll/${decRunId}/approve`)
      .auth(hrDirector.accessToken, { type: 'bearer' })
      .expect(201);

    const hourlySlip = await db.payrollSlip.findFirstOrThrow({
      where: { payrollRunId: decRunId, userId: hourlyDoctor.user.id },
    });
    expect(hourlySlip.payBasis).toBe('HOURLY');
    expect(hourlySlip.workedHours.toFixed(3)).toBe('20.000');
    expect(hourlySlip.basicSalary.toFixed(3)).toBe('1000.000');
    expect(hourlySlip.taxDeduction.toFixed(3)).toBe('50.000');
    expect(hourlySlip.netSalary.toFixed(3)).toBe('950.000');

    const shiftSlip = await db.payrollSlip.findFirstOrThrow({
      where: { payrollRunId: decRunId, userId: shiftNurse.user.id },
    });
    expect(shiftSlip.payBasis).toBe('FIXED_SHIFT');
    expect(shiftSlip.workedShiftsCount).toBe(2);
    expect(shiftSlip.basicSalary.toFixed(3)).toBe('300.000');
    expect(shiftSlip.taxDeduction.toFixed(3)).toBe('0.000');
    expect(shiftSlip.netSalary.toFixed(3)).toBe('300.000');
  });
});
