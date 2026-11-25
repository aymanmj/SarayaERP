// server/test/e2e/sec05-av-attachment-scanning.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { buildEicarTestSignature } from '../../src/common/security/attachment-av-scanner.service';
import { isEncryptedAttachmentEnvelope } from '../../src/common/security/attachment-crypto.util';

describe('Phase 6 Batch 30 — SEC05 Antivirus Attachment Scanning (ClamAV / EICAR)', () => {
  let app: INestApplication<Server>;
  let db: PrismaService;
  let auth: AuthHelper;
  let tmpUploadRoot: string;
  let prevAttachmentRoot: string | undefined;

  beforeAll(async () => {
    tmpUploadRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'saraya-sec05-av-test-'),
    );
    prevAttachmentRoot = process.env.INSURANCE_ATTACHMENT_ROOT;
    process.env.INSURANCE_ATTACHMENT_ROOT = tmpUploadRoot;

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
    if (prevAttachmentRoot === undefined) {
      delete process.env.INSURANCE_ATTACHMENT_ROOT;
    } else {
      process.env.INSURANCE_ATTACHMENT_ROOT = prevAttachmentRoot;
    }
    fs.rmSync(tmpUploadRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  it('blocks EICAR-infected PDF upload with 422 + chained SECURITY_MALWARE_BLOCKED audit without writing to disk, and accepts clean PDF with avScanStatus=CLEAN', async () => {
    const staff = await auth.createTestUser('sec05-av-staff', 'synthetic', {
      permissions: ['insurance:view', 'insurance:manage'],
    });
    const hospitalId = staff.user.hospitalId;

    const provider = await db.insuranceProvider.create({
      data: {
        hospitalId,
        code: 'PROV-SEC05',
        name: 'شركة تأمين SEC05',
        isActive: true,
      },
    });
    const policy = await db.insurancePolicy.create({
      data: {
        insuranceProviderId: provider.id,
        name: 'بوليصة SEC05',
        policyNumber: 'POL-SEC05-001',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T23:59:59.999Z'),
        isActive: true,
      },
    });
    const patient = await db.patient.create({
      data: {
        hospitalId,
        mrn: 'SEC05-MRN-1',
        fullName: 'مريض فحص الفيروسات',
        gender: 'MALE',
        isActive: true,
      },
    });
    const preAuth = await db.preAuthorization.create({
      data: {
        hospitalId,
        patientId: patient.id,
        policyId: policy.id,
        requestedAmount: '500.000',
        status: 'PENDING',
      },
    });

    // 1. Infected PDF (valid PDF magic header + EICAR signature) -> 422 Unprocessable Entity
    const infectedPdf = Buffer.from(
      `%PDF-1.4\n% ${buildEicarTestSignature()}\n%%EOF`,
      'ascii',
    );
    await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuth.id}/attachments`)
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .field('category', 'MEDICAL_REPORT')
      .field('title', 'Infected Payload Test')
      .attach('file', infectedPdf, {
        filename: 'infected.pdf',
        contentType: 'application/pdf',
      })
      .expect(422);

    // Confirm ZERO attachment rows persisted and ZERO files written to disk
    const attachmentsAfterBlocked = await db.preAuthorizationAttachment.count({
      where: { hospitalId, preAuthId: preAuth.id },
    });
    expect(attachmentsAfterBlocked).toBe(0);
    const filesAfterBlocked = fs.existsSync(
      path.join(tmpUploadRoot, String(hospitalId)),
    )
      ? fs.readdirSync(path.join(tmpUploadRoot, String(hospitalId)), {
          recursive: true,
        })
      : [];
    expect(filesAfterBlocked).toHaveLength(0);

    // Confirm chained SECURITY_MALWARE_BLOCKED audit log recorded
    const malwareAudit = await db.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'SECURITY_MALWARE_BLOCKED',
      },
    });
    expect(malwareAudit).toBeTruthy();
    expect(malwareAudit?.hash).toBeTruthy();

    // 2. Clean PDF -> 201 Created with avScanStatus=CLEAN in chained AuditLog
    const cleanPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF',
      'ascii',
    );
    const uploadRes = await request(app.getHttpServer())
      .post(`/insurance/pre-auth/${preAuth.id}/attachments`)
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .field('category', 'MEDICAL_REPORT')
      .field('title', 'Clean Report')
      .attach('file', cleanPdf, {
        filename: 'clean-report.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const attachmentId = (uploadRes.body as { id: number }).id;
    expect(attachmentId).toBeGreaterThan(0);

    const uploadAudit = await db.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'UPLOAD_PREAUTH_ATTACHMENT',
        entityId: attachmentId,
      },
    });
    expect(uploadAudit).toBeTruthy();
    expect(uploadAudit?.hash).toBeTruthy();
    const auditPayload = (
      uploadAudit?.details as { payload?: Record<string, unknown> }
    )?.payload;
    expect(auditPayload?.avScanStatus).toBe('CLEAN');

    // 3. SEC05 AES-256-GCM encryption-at-rest: disk file has SRYENC1\0 envelope & no plaintext %PDF-1.4
    const attRow = await db.preAuthorizationAttachment.findUniqueOrThrow({
      where: { id: attachmentId },
      select: { storageKey: true },
    });
    const storedPath = path.resolve(tmpUploadRoot, attRow.storageKey);
    const rawStored = fs.readFileSync(storedPath);
    expect(isEncryptedAttachmentEnvelope(rawStored)).toBe(true);
    expect(rawStored.includes(Buffer.from('%PDF-1.4', 'ascii'))).toBe(false);

    // Download endpoint transparently decrypts back to exact cleanPdf bytes
    const downloadRes = await request(app.getHttpServer())
      .get(
        `/insurance/pre-auth/${preAuth.id}/attachments/${attachmentId}/download`,
      )
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .buffer(true)
      .expect(200);
    expect(
      Buffer.compare(Buffer.from(downloadRes.body as Uint8Array), cleanPdf),
    ).toBe(0);

    // Tampering with ciphertext on disk fails closed (409 ConflictException on GCM tag mismatch)
    rawStored[rawStored.length - 1] ^= 0xff;
    fs.writeFileSync(storedPath, rawStored);
    await request(app.getHttpServer())
      .get(
        `/insurance/pre-auth/${preAuth.id}/attachments/${attachmentId}/download`,
      )
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .expect(409);
  });
});
