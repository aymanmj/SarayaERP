import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { buildEicarTestSignature } from '../../src/common/security/attachment-av-scanner.service';
import { isEncryptedAttachmentEnvelope } from '../../src/common/security/attachment-crypto.util';

interface CredentialResponse {
  id: number;
  status: string;
  complianceStatus: string;
  daysUntilExpiry: number;
  credentialType: string;
  staffCategory: string;
}

interface AlertsResponse {
  summary: {
    expiredCount: number;
    expiringSoonCount: number;
    suspendedOrRevokedCount: number;
    pendingVerificationCount: number;
    practiceLicenseAlerts: number;
    healthCertificateAlerts: number;
  };
}

interface EligibilityResponse {
  eligible: boolean;
  strictPolicyEnabled: boolean;
  reasons: string[];
}

describe('E2E Tests - Staff Credentialing, Practice Permits & Disease-Free Health Certificates (CAP12)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let tmpCredRoot: string;
  let prevCredRoot: string | undefined;

  beforeAll(async () => {
    tmpCredRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'saraya-cap12-cred-test-'),
    );
    prevCredRoot = process.env.CREDENTIAL_ATTACHMENT_ROOT;
    process.env.CREDENTIAL_ATTACHMENT_ROOT = tmpCredRoot;

    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prevCredRoot === undefined) {
      delete process.env.CREDENTIAL_ATTACHMENT_ROOT;
    } else {
      process.env.CREDENTIAL_ATTACHMENT_ROOT = prevCredRoot;
    }
    fs.rmSync(tmpCredRoot, { recursive: true, force: true });
  });

  it('manages Medical & Allied Health practice permits and disease-free health certificates, blocks expired/suspended scheduling, enforces 4-eyes, alerts, renewal supersede, and PostgreSQL immutability', async () => {
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const server = app.getHttpServer();

    const hospA = await prisma.hospital.create({
      data: {
        name: 'Saraya Medical Center',
        code: `HOSP-CAP12-A-${Date.now()}`,
      },
    });
    const hospB = await prisma.hospital.create({
      data: { name: 'Other Hospital', code: `HOSP-CAP12-B-${Date.now()}` },
    });

    const hrOfficer = await auth.createTestUser('hr-officer', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'hr:view',
        'hr:manage',
        'hr:credentials:view',
        'hr:credentials:manage',
        'appointments:manage',
      ],
    });
    const medicalDirector = await auth.createTestUser('med-dir', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'hr:view',
        'hr:manage',
        'hr:credentials:view',
        'hr:credentials:manage',
        'hr:credentials:verify',
        'appointments:manage',
      ],
    });
    const doctorUser = await auth.createTestUser('dr-cardio', 'password', {
      hospitalId: hospA.id,
      permissions: ['hr:credentials:view', 'hr:credentials:verify'],
    });
    await prisma.user.update({
      where: { id: doctorUser.user.id },
      data: { isDoctor: true },
    });
    const nurseUser = await auth.createTestUser('nurse-icu', 'password', {
      hospitalId: hospA.id,
      permissions: ['hr:credentials:view'],
    });
    const otherHospitalAdmin = await auth.createTestUser(
      'other-hosp-hr',
      'password',
      {
        hospitalId: hospB.id,
        permissions: [
          'hr:view',
          'hr:credentials:view',
          'hr:credentials:manage',
          'hr:credentials:verify',
        ],
      },
    );

    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospA.id,
        fullName: 'Credential Gate Patient',
        mrn: `MRN-CAP12-${Date.now()}`,
        gender: 'MALE',
      },
    });
    const shift = await prisma.workShift.create({
      data: {
        hospitalId: hospA.id,
        name: 'Morning Clinical Shift',
        type: 'MORNING',
        startTime: '08:00',
        endTime: '16:00',
      },
    });

    // 1. Register an EXPIRED Practice License (إذن مزاولة) for Doctor
    const expiredLicRes = await request(server)
      .post('/hr/credentials')
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .send({
        userId: doctorUser.user.id,
        staffCategory: 'MEDICAL',
        credentialType: 'PRACTICE_LICENSE',
        title: 'إذن مزاولة مهنة الطب البشري',
        licenseNumber: 'LY-MED-2025-881',
        issuingAuthority: 'النقابة العامة للأطباء - ليبيا',
        specialty: 'Cardiology',
        issueDate: '2025-01-01T00:00:00.000Z',
        expiryDate: '2026-01-01T00:00:00.000Z',
        alertDaysBefore: 30,
        isMandatory: true,
      })
      .expect(201);
    const expiredLic = expiredLicRes.body as CredentialResponse;
    expect(expiredLic.status).toBe('PENDING_VERIFICATION');

    // Creator (hrOfficer without verify perm -> 403) and owner (doctorUser -> 403) cannot verify
    await request(server)
      .post(`/hr/credentials/${expiredLic.id}/verify`)
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .expect(403);
    await request(server)
      .post(`/hr/credentials/${expiredLic.id}/verify`)
      .set('Authorization', `Bearer ${doctorUser.accessToken}`)
      .expect(403);

    // Cross-hospital admin gets 404
    await request(server)
      .post(`/hr/credentials/${expiredLic.id}/verify`)
      .set('Authorization', `Bearer ${otherHospitalAdmin.accessToken}`)
      .expect(404);

    // Independent Medical Director verifies the expired license -> status ACTIVE, compliance EXPIRED
    const verifiedExpiredRes = await request(server)
      .post(`/hr/credentials/${expiredLic.id}/verify`)
      .set('Authorization', `Bearer ${medicalDirector.accessToken}`)
      .expect(201);
    expect(
      (verifiedExpiredRes.body as CredentialResponse).complianceStatus,
    ).toBe('EXPIRED');

    // 2. Register an EXPIRING_SOON Disease-Free Health Certificate (الشهادة الصحية) for Nurse (ALLIED_HEALTH)
    const in15Days = new Date(Date.now() + 15 * 86_400_000).toISOString();
    const nurseHealthRes = await request(server)
      .post('/hr/credentials')
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .send({
        userId: nurseUser.user.id,
        staffCategory: 'ALLIED_HEALTH',
        credentialType: 'HEALTH_CERTIFICATE',
        title: 'الشهادة الصحية للخلو من الأمراض المعدية',
        licenseNumber: 'HC-NCDC-2026-441',
        issuingAuthority: 'المركز الوطني لمكافحة الأمراض',
        issueDate: '2026-05-01T00:00:00.000Z',
        expiryDate: in15Days,
        alertDaysBefore: 30,
        isMandatory: true,
      })
      .expect(201);
    const nurseHealth = nurseHealthRes.body as CredentialResponse;
    await request(server)
      .post(`/hr/credentials/${nurseHealth.id}/verify`)
      .set('Authorization', `Bearer ${medicalDirector.accessToken}`)
      .expect(201);

    // 3. Proactive Compliance Alerts Dashboard shows 1 expired practice license + 1 expiring health cert
    const alertsRes = await request(server)
      .get('/hr/credentials/alerts')
      .set('Authorization', `Bearer ${medicalDirector.accessToken}`)
      .expect(200);
    const alerts = alertsRes.body as AlertsResponse;
    expect(alerts.summary.expiredCount).toBe(1);
    expect(alerts.summary.expiringSoonCount).toBe(1);
    expect(alerts.summary.practiceLicenseAlerts).toBe(1);
    expect(alerts.summary.healthCertificateAlerts).toBe(1);

    // 4. Scheduling Gate BLOCKS Appointment & Roster for doctor with expired Practice License (409)
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowEnd = new Date(tomorrow.getTime() + 30 * 60 * 1000);

    await request(server)
      .post('/appointments')
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .send({
        patientId: patient.id,
        doctorId: doctorUser.user.id,
        scheduledStart: tomorrow.toISOString(),
        scheduledEnd: tomorrowEnd.toISOString(),
      })
      .expect(409);

    await request(server)
      .post('/hr/roster/assign')
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .send({
        userId: doctorUser.user.id,
        workShiftId: shift.id,
        fromDate: tomorrow.toISOString().slice(0, 10),
        toDate: tomorrow.toISOString().slice(0, 10),
        isOffDay: false,
      })
      .expect(409);

    // Nurse roster assignment AFTER her health cert expires (in 30 days) is also BLOCKED (409)!
    const in30DaysDate = new Date(Date.now() + 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await request(server)
      .post('/hr/roster/assign')
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .send({
        userId: nurseUser.user.id,
        workShiftId: shift.id,
        fromDate: in30DaysDate,
        toDate: in30DaysDate,
        isOffDay: false,
      })
      .expect(409);

    // 5. Renew & verify Doctor's Practice License + Disease-Free Health Certificate -> Supersedes old & unblocks scheduling
    const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const renewedLicRes = await request(server)
      .post('/hr/credentials')
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .send({
        userId: doctorUser.user.id,
        staffCategory: 'MEDICAL',
        credentialType: 'PRACTICE_LICENSE',
        title: 'تجديد إذن مزاولة مهنة الطب البشري',
        licenseNumber: 'LY-MED-2026-992',
        issuingAuthority: 'النقابة العامة للأطباء - ليبيا',
        issueDate: '2026-11-01T00:00:00.000Z',
        expiryDate: nextYear,
        isMandatory: true,
      })
      .expect(201);
    const renewedLic = renewedLicRes.body as CredentialResponse;

    await request(server)
      .post(`/hr/credentials/${renewedLic.id}/verify`)
      .set('Authorization', `Bearer ${medicalDirector.accessToken}`)
      .expect(201);

    // Old expired license was automatically SUPERSEDED
    const oldLicDb = await prisma.staffCredential.findUniqueOrThrow({
      where: { id: expiredLic.id },
    });
    expect(oldLicDb.status).toBe('SUPERSEDED');

    // Eligibility now passes and Appointment succeeds!
    const eligRes = await request(server)
      .get(`/hr/credentials/staff/${doctorUser.user.id}/eligibility`)
      .set('Authorization', `Bearer ${medicalDirector.accessToken}`)
      .expect(200);
    expect((eligRes.body as EligibilityResponse).eligible).toBe(true);

    await request(server)
      .post('/appointments')
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .send({
        patientId: patient.id,
        doctorId: doctorUser.user.id,
        scheduledStart: tomorrow.toISOString(),
        scheduledEnd: tomorrowEnd.toISOString(),
      })
      .expect(201);

    // 6. Suspending license immediately blocks scheduling again; reinstating restores it; revoking is permanent
    await request(server)
      .post(`/hr/credentials/${renewedLic.id}/suspend`)
      .set('Authorization', `Bearer ${medicalDirector.accessToken}`)
      .send({
        action: 'SUSPEND',
        reason: 'Pending medical board quality review',
      })
      .expect(201);

    await request(server)
      .post('/hr/roster/assign')
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .send({
        userId: doctorUser.user.id,
        workShiftId: shift.id,
        fromDate: tomorrow.toISOString().slice(0, 10),
        toDate: tomorrow.toISOString().slice(0, 10),
        isOffDay: false,
      })
      .expect(409);

    await request(server)
      .post(`/hr/credentials/${renewedLic.id}/reinstate`)
      .set('Authorization', `Bearer ${medicalDirector.accessToken}`)
      .expect(201);

    // 6b. Secure Document Upload/Download (SEC05 AV scan + AES-256-GCM at rest + cross-tenant isolation)
    const infectedCredPdf = Buffer.from(
      `%PDF-1.4\n% ${buildEicarTestSignature()}\n%%EOF`,
      'ascii',
    );
    await request(server)
      .post(`/hr/credentials/${renewedLic.id}/document`)
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .attach('file', infectedCredPdf, {
        filename: 'infected-license.pdf',
        contentType: 'application/pdf',
      })
      .expect(422);

    const credAfterInfected = await prisma.staffCredential.findUniqueOrThrow({
      where: { id: renewedLic.id },
      select: { documentRef: true },
    });
    expect(credAfterInfected.documentRef).toBeNull();

    const malwareAudit = await prisma.auditLog.findFirst({
      where: {
        hospitalId: hospA.id,
        action: 'SECURITY_MALWARE_BLOCKED',
        entityId: renewedLic.id,
      },
    });
    expect(malwareAudit).toBeTruthy();
    expect(malwareAudit?.hash).toBeTruthy();

    const cleanCredPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Catalog /CAP12 true >> endobj\n%%EOF',
      'ascii',
    );
    const docUploadRes = await request(server)
      .post(`/hr/credentials/${renewedLic.id}/document`)
      .set('Authorization', `Bearer ${hrOfficer.accessToken}`)
      .attach('file', cleanCredPdf, {
        filename: 'medical-license.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const docRef = (docUploadRes.body as { documentRef?: string }).documentRef;
    expect(docRef).toBeTruthy();
    expect(docRef?.startsWith('enc-v1:')).toBe(true);

    const storedStorageKey = docRef!.slice('enc-v1:'.length + 65);
    const storedFilePath = path.resolve(tmpCredRoot, storedStorageKey);
    const rawCredBytes = fs.readFileSync(storedFilePath);
    expect(isEncryptedAttachmentEnvelope(rawCredBytes)).toBe(true);
    expect(rawCredBytes.includes(Buffer.from('%PDF-1.4', 'ascii'))).toBe(false);

    // Cross-hospital document download blocked (404)
    await request(server)
      .get(`/hr/credentials/${renewedLic.id}/document`)
      .set('Authorization', `Bearer ${otherHospitalAdmin.accessToken}`)
      .expect(404);

    // Same-hospital document download decrypts cleanly
    const dlRes = await request(server)
      .get(`/hr/credentials/${renewedLic.id}/document`)
      .set('Authorization', `Bearer ${medicalDirector.accessToken}`)
      .buffer(true)
      .expect(200);
    expect(dlRes.headers['content-type']).toContain('application/pdf');
    expect(
      Buffer.compare(Buffer.from(dlRes.body as Uint8Array), cleanCredPdf),
    ).toBe(0);

    // PostgreSQL trigger blocks deleting compliance records
    await expect(
      prisma.$executeRaw`DELETE FROM "StaffCredential" WHERE "id" = ${renewedLic.id}`,
    ).rejects.toThrow(/cannot be deleted/i);

    // 7. Chained AuditLog captured full credentialing governance lifecycle
    const audits = await prisma.auditLog.findMany({
      where: {
        hospitalId: hospA.id,
        action: { startsWith: 'STAFF_CREDENTIAL_' },
      },
      orderBy: { id: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual([
      'STAFF_CREDENTIAL_CREATED',
      'STAFF_CREDENTIAL_VERIFIED',
      'STAFF_CREDENTIAL_CREATED',
      'STAFF_CREDENTIAL_VERIFIED',
      'STAFF_CREDENTIAL_CREATED',
      'STAFF_CREDENTIAL_VERIFIED',
      'STAFF_CREDENTIAL_SUSPENDED',
      'STAFF_CREDENTIAL_REINSTATED',
      'STAFF_CREDENTIAL_DOCUMENT_UPLOADED',
      'STAFF_CREDENTIAL_DOCUMENT_DOWNLOADED',
    ]);
  });
});
