// server/test/e2e/hr-employees-rostering-batch45.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import express from 'express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { buildEicarTestSignature } from '../../src/common/security/attachment-av-scanner.service';

describe('Batch 45 Phase 2 — Enterprise HR Employees Separation, Rostering, Overnight Biometric Hours, Encrypted Docs & Payroll', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let auth: AuthHelper;
  let tempDocRoot: string;
  let prevDocRoot: string | undefined;

  beforeAll(async () => {
    tempDocRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saraya-hr-docs-'));
    prevDocRoot = process.env.HR_DOCUMENT_ROOT;
    process.env.HR_DOCUMENT_ROOT = tempDocRoot;

    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    const expressApp = app.getHttpAdapter().getInstance() as express.Express;
    expressApp.use(
      '/iclock',
      express.text({ type: 'text/plain', limit: '2mb' }),
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    db = app.get(PrismaService);
    auth = new AuthHelper(db, app.get(JwtService));
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prevDocRoot !== undefined) process.env.HR_DOCUMENT_ROOT = prevDocRoot;
    else delete process.env.HR_DOCUMENT_ROOT;
    fs.rmSync(tempDocRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('supports separated Employee lifecycle, Altamam toggle & Excel import, encrypted docs, D/N/24 monthly roster grid, ADMS non-login biometric hours, non-login payroll slip, and tenant isolation', async () => {
    const hrPerms = [
      'hr:view',
      'hr:manage',
      'hr:employees:view',
      'hr:employees:manage',
      'hr:shifts:manage',
      'hr:payroll:manage',
      'attendance:manage',
      'payroll:view',
      'payroll:manage',
      'admin:view',
      'admin:manage',
      'admin:users:manage',
      'departments:view',
      'departments:manage',
    ];

    const hrAdmin = await auth.createTestUser('b45-hr-admin', 'synthetic', {
      permissions: hrPerms,
    });
    const hospitalId = hrAdmin.user.hospitalId;

    const otherHospital = await db.hospital.create({
      data: {
        code: `HOSP_B45_OTHER_${Date.now()}`,
        name: 'Other Hospital B',
        isActive: true,
      },
    });
    const foreignHr = await auth.createTestUser('b45-foreign-hr', 'synthetic', {
      hospitalId: otherHospital.id,
      permissions: hrPerms,
    });

    // 1. Default HR Config & SystemSettings toggle for Altamam integration
    const cfgBefore = await request(app.getHttpServer())
      .get('/hr/employees/config')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .expect(200);
    expect(cfgBefore.body).toEqual({
      altamamIntegrationEnabled: false,
      defaultCurrency: 'LYD',
    });

    await request(app.getHttpServer())
      .patch('/system-settings/hr.altamamIntegrationEnabled')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({ value: 'true' })
      .expect(200);

    const cfgAfter = await request(app.getHttpServer())
      .get('/hr/employees/config')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .expect(200);
    expect(
      (cfgAfter.body as { altamamIntegrationEnabled: boolean })
        .altamamIntegrationEnabled,
    ).toBe(true);

    // 2. Org structure: Department -> Section + JobTitle
    const dept = await db.department.create({
      data: { hospitalId, name: 'الأمن والسلامة', nameAr: 'الأمن والسلامة' },
    });

    const secRes = await request(app.getHttpServer())
      .post('/hr/org/sections')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({ departmentId: dept.id, name: 'بوابة الطوارئ', code: 'SEC-SEC1' })
      .expect(201);
    const sectionId = (secRes.body as { id: number }).id;

    const jtRes = await request(app.getHttpServer())
      .post('/hr/org/job-titles')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({ name: 'مشرف أمن', code: 'JT-SEC', level: 3 })
      .expect(201);
    const jobTitleId = (jtRes.body as { id: number }).id;

    // 3. Create Non-Login Employee (userId: null, LYD, Altamam No, Qualification, Course)
    const empRes = await request(app.getHttpServer())
      .post('/hr/employees')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({
        altamamEmployeeNo: 'TM-9001',
        biometricId: '5010',
        firstNameAr: 'خالد',
        secondNameAr: 'عمران',
        thirdNameAr: 'مفتاح',
        lastNameAr: 'المصراتي',
        firstNameEn: 'Khaled',
        lastNameEn: 'Al-Misrati',
        departmentId: dept.id,
        sectionId,
        jobTitleId,
        staffCategory: 'SUPPORT_SERVICES',
        basicSalary: 1850,
        housingAllowance: 150,
        currency: 'LYD',
        qualifications: [
          {
            degree: 'دبلوم عالي',
            major: 'إدارة أمنية',
            institution: 'معهد طرابلس',
            graduationYear: 2018,
          },
        ],
        trainingCourses: [
          {
            courseName: 'السلامة المهنية والطوارئ',
            provider: 'الهلال الأحمر',
            hoursCount: 24,
          },
        ],
      })
      .expect(201);
    const empBody = empRes.body as {
      id: number;
      userId: number | null;
      employeeNo: string;
      currency: string;
      qualifications: unknown[];
      trainingCourses: unknown[];
    };
    const nonLoginEmpId = empBody.id;
    expect(empBody.userId).toBeNull();
    expect(empBody.employeeNo).toBe('EMP-0001');
    expect(empBody.currency).toBe('LYD');
    expect(empBody.qualifications).toHaveLength(1);
    expect(empBody.trainingCourses).toHaveLength(1);

    // Record HR Action (Promotion)
    await request(app.getHttpServer())
      .post(`/hr/employees/${nonLoginEmpId}/actions`)
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({
        actionType: 'SALARY_CHANGE',
        fromValue: '1600.000 LYD',
        toValue: '1850.000 LYD',
        effectiveDate: '2026-11-01',
        notes: 'تعديل سنوي',
      })
      .expect(201);

    // 4. Encrypted EmployeeDocument Upload + EICAR Rejection + Download
    const eicarBuffer = Buffer.from(buildEicarTestSignature(), 'ascii');
    await request(app.getHttpServer())
      .post(`/hr/employees/${nonLoginEmpId}/documents`)
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .field('title', 'ملف مشبوه')
      .attach('file', eicarBuffer, {
        filename: 'eicar.pdf',
        contentType: 'application/pdf',
      })
      .expect(422);

    const pdfContent = Buffer.from('%PDF-1.4\n%Saraya-HR-Test-Document\n%%EOF');
    const docUploadRes = await request(app.getHttpServer())
      .post(`/hr/employees/${nonLoginEmpId}/documents`)
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .field('title', 'عقد عمل 2026')
      .field('category', 'عقد')
      .attach('file', pdfContent, {
        filename: 'contract-2026.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const docId = (docUploadRes.body as { id: number; storagePath: string }).id;
    const storedFilePath = path.resolve(
      tempDocRoot,
      (docUploadRes.body as { storagePath: string }).storagePath,
    );
    const rawDiskBytes = fs.readFileSync(storedFilePath);
    expect(rawDiskBytes.subarray(0, 8).toString('ascii')).toBe('SRYENC1\0');

    const docDlRes = await request(app.getHttpServer())
      .get(`/hr/employees/${nonLoginEmpId}/documents/${docId}/download`)
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .expect(200);
    expect(Buffer.compare(docDlRes.body as Buffer, pdfContent)).toBe(0);

    // Cross-tenant isolation check on document & employee
    await request(app.getHttpServer())
      .get(`/hr/employees/${nonLoginEmpId}`)
      .auth(foreignHr.accessToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/hr/employees/${nonLoginEmpId}/documents/${docId}/download`)
      .auth(foreignHr.accessToken, { type: 'bearer' })
      .expect(404);

    // 5. Bulk Altamam Excel Import + Link/Unlink Optional User Account
    const importRes = await request(app.getHttpServer())
      .post('/hr/employees/bulk-import')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({
        employees: [
          {
            altamamEmployeeNo: 'TM-9002',
            fullName: 'سالم محمد عبد الله الفيتوري',
            departmentName: 'التمريض العام',
            jobTitle: 'ممرض طوارئ',
            staffCategory: 'تمريض',
            basicSalary: 2200,
            qualification: 'بكالوريوس تمريض',
          },
        ],
      })
      .expect(201);
    expect((importRes.body as { imported: number }).imported).toBe(1);

    const listRes = await request(app.getHttpServer())
      .get('/hr/employees?search=TM-9002')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .expect(200);
    const importedEmpId = (listRes.body as { items: Array<{ id: number }> })
      .items[0].id;

    // Link optional login account to imported employee, then unlink
    const linkedRes = await request(app.getHttpServer())
      .post(`/hr/employees/${importedEmpId}/link-user`)
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({
        username: 'salem_nurse_b45',
        password: 'Password123!',
        roleNames: ['NURSE'],
      })
      .expect(201);
    expect(
      (linkedRes.body as { user?: { username?: string } }).user?.username,
    ).toBe('salem_nurse_b45');

    const unlinkedRes = await request(app.getHttpServer())
      .post(`/hr/employees/${importedEmpId}/unlink-user`)
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .expect(201);
    expect((unlinkedRes.body as { userId: number | null }).userId).toBeNull();

    // 6. Overnight WorkShift ('N') + Monthly Grid + CSV Roster Import
    const shiftRes = await request(app.getHttpServer())
      .post('/hr/shifts')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({
        code: 'N',
        name: 'مناوبة ليلية',
        type: 'NIGHT',
        startTime: '20:00',
        endTime: '08:00',
        workHours: 12,
        nightAllowance: 35,
        isOvernight: true,
      })
      .expect(201);
    const nightShiftId = (shiftRes.body as { id: number }).id;

    const csvPayload = [
      'employeeNo,date,code,notes',
      'EMP-0001,2026-11-24,N,مناوبة بوابة الطوارئ',
      'EMP-0001,2026-11-25,REST,راحة بعد الليلي',
    ].join('\n');

    const previewRes = await request(app.getHttpServer())
      .post('/hr/shifts/roster-import/preview')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({ content: csvPayload })
      .expect(201);
    const previewBody = previewRes.body as {
      errors: unknown[];
      rows: unknown[];
    };
    expect(previewBody.errors).toEqual([]);
    expect(previewBody.rows).toHaveLength(2);

    const applyRes = await request(app.getHttpServer())
      .post('/hr/shifts/roster-import/apply')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({ content: csvPayload })
      .expect(201);
    expect((applyRes.body as { count: number }).count).toBe(2);

    const gridRes = await request(app.getHttpServer())
      .get('/hr/shifts/roster-days?month=2026-11')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .expect(200);
    const gridBody = gridRes.body as {
      shifts: Array<{ id: number }>;
      days: unknown[];
    };
    expect(gridBody.shifts.some((s) => s.id === nightShiftId)).toBe(true);
    expect(gridBody.days).toHaveLength(2);

    // 7. Biometric ADMS Overnight Push for Non-Login Employee ('5010') + Hours Report
    await request(app.getHttpServer())
      .post('/attendance/biometric/devices')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({
        name: 'ER Gate',
        serialNumber: 'ZK-B45-01',
        ipAddress: '127.0.0.1',
        deviceSecret: 'b45-secret',
      })
      .expect(201);

    // Local UTC+2: 2026-11-24 22:00 (=20:00 UTC) -> 2026-11-25 10:00 (=08:00 UTC next morning) = 12h overnight shift!
    const attlog = [
      '5010\t2026-11-24 22:00:00\t0\t1',
      '5010\t2026-11-25 10:00:00\t1\t1',
    ].join('\n');
    await request(app.getHttpServer())
      .post('/iclock/cdata?SN=ZK-B45-01&table=ATTLOG&token=b45-secret')
      .set('Content-Type', 'text/plain')
      .send(attlog)
      .expect(200);

    const nonLoginAtt = await db.attendanceRecord.findFirst({
      where: { hospitalId, employeeId: nonLoginEmpId },
    });
    expect(nonLoginAtt).not.toBeNull();
    expect(nonLoginAtt!.userId).toBeNull();

    const hoursRes = await request(app.getHttpServer())
      .get(
        '/attendance/biometric/hours-report?startDate=2026-11-24&endDate=2026-11-25',
      )
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .expect(200);
    const hoursBody = hoursRes.body as {
      rows: Array<{
        employeeId: number;
        totalHours: number;
        sessions: Array<{ workDate: string; totalMinutes: number }>;
      }>;
    };
    const empRow = hoursBody.rows.find((r) => r.employeeId === nonLoginEmpId);
    expect(empRow).toBeDefined();
    expect(empRow!.totalHours).toBe(12);
    expect(empRow!.sessions[0].workDate).toBe('2026-11-24');

    // 8. Payroll Generation Includes Standalone Non-Login Employee (userId: null, employeeId set)
    const payGenRes = await request(app.getHttpServer())
      .post('/payroll/generate')
      .auth(hrAdmin.accessToken, { type: 'bearer' })
      .send({ month: 11, year: 2026 })
      .expect(201);
    const runId = (payGenRes.body as { id: number }).id;

    const slip = await db.payrollSlip.findFirst({
      where: { payrollRunId: runId, employeeId: nonLoginEmpId },
    });
    expect(slip).not.toBeNull();
    expect(slip!.userId).toBeNull();
    expect(slip!.basicSalary.toFixed(3)).toBe('1850.000');
    expect(slip!.housingAllowance.toFixed(3)).toBe('150.000');
    expect(slip!.netSalary.toFixed(3)).toBe('2000.000');
  });
});
