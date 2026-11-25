import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  StaffCredentialingService,
  computeCredentialCompliance,
  evaluateStaffSchedulingEligibility,
} from './staff-credentialing.service';
import type { PrismaService } from '../prisma/prisma.service';
import { buildEicarTestSignature } from '../common/security/attachment-av-scanner.service';
import { isEncryptedAttachmentEnvelope } from '../common/security/attachment-crypto.util';

jest.mock('../audit/audit-chain', () => ({
  appendChainedAuditInTransaction: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock('../audit/siem.logger', () => ({
  publishCommittedCriticalAudit: jest.fn(),
}));

describe('StaffCredentialingService (CAP12)', () => {
  const buildService = () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: { findFirst: jest.fn() },
      staffCredential: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
      staffCredential: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      systemSetting: { findFirst: jest.fn() },
    };
    const service = new StaffCredentialingService(
      prisma as unknown as PrismaService,
    );
    return { service, prisma, tx };
  };

  it('rejects invalid expiry <= issue date and enforces 4-eyes / non-self verification', async () => {
    const { service, tx } = buildService();

    await expect(
      service.createCredential(1, 10, {
        userId: 20,
        staffCategory: 'MEDICAL',
        credentialType: 'PRACTICE_LICENSE',
        title: 'إذن مزاولة مهنة الطب البشري',
        licenseNumber: 'LIC-2026-01',
        issuingAuthority: 'نقابة الأطباء',
        issueDate: '2026-06-01T00:00:00.000Z',
        expiryDate: '2026-05-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);

    // Owner cannot verify their own credential
    tx.staffCredential.findFirst.mockResolvedValueOnce({
      id: 5,
      hospitalId: 1,
      userId: 20,
      createdById: 10,
      credentialType: 'HEALTH_CERTIFICATE',
      status: 'PENDING_VERIFICATION',
    });
    await expect(service.verifyCredential(1, 5, 20)).rejects.toThrow(
      ForbiddenException,
    );

    // Creator cannot verify their own submission (4-eyes)
    tx.staffCredential.findFirst.mockResolvedValueOnce({
      id: 5,
      hospitalId: 1,
      userId: 20,
      createdById: 10,
      credentialType: 'HEALTH_CERTIFICATE',
      status: 'PENDING_VERIFICATION',
    });
    await expect(service.verifyCredential(1, 5, 10)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('computes compliance alert windows and blocks eligibility for expired Practice Permit or Health Certificate', async () => {
    const asOf = new Date('2026-11-24T00:00:00.000Z');
    const expiring = computeCredentialCompliance(
      {
        status: 'ACTIVE',
        expiryDate: new Date('2026-12-10T00:00:00.000Z'),
        alertDaysBefore: 30,
      },
      asOf,
    );
    expect(expiring.complianceStatus).toBe('EXPIRING_SOON');
    expect(expiring.daysUntilExpiry).toBe(16);

    const expired = computeCredentialCompliance(
      {
        status: 'ACTIVE',
        expiryDate: new Date('2026-11-20T00:00:00.000Z'),
        alertDaysBefore: 30,
      },
      asOf,
    );
    expect(expired.complianceStatus).toBe('EXPIRED');

    // Evaluate eligibility when Practice License is valid but Health Certificate (الخلو من الأمراض) expired
    const { prisma } = buildService();
    prisma.staffCredential.findMany.mockResolvedValueOnce([
      {
        id: 1,
        credentialType: 'PRACTICE_LICENSE',
        status: 'ACTIVE',
        isMandatory: true,
        expiryDate: new Date('2027-06-01T00:00:00.000Z'),
      },
      {
        id: 2,
        credentialType: 'HEALTH_CERTIFICATE',
        status: 'ACTIVE',
        isMandatory: true,
        expiryDate: new Date('2026-11-01T00:00:00.000Z'),
      },
    ]);
    prisma.systemSetting.findFirst.mockResolvedValueOnce(null);

    const result = await evaluateStaffSchedulingEligibility(
      prisma as unknown as PrismaService,
      1,
      20,
      asOf,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain('الشهادة الصحية');
    expect(ConflictException).toBeDefined();
  });

  it('scans credential uploads via ClamAV/EICAR, encrypts clean PDFs at rest with AES-256-GCM, and verifies tampered decryption fails closed', async () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'saraya-cap12-doc-test-'),
    );
    try {
      const { service, prisma, tx } = buildService();

      // 1. EICAR-infected PDF must be blocked with 422 before touching disk
      const infected = Buffer.from(
        `%PDF-1.4\n% ${buildEicarTestSignature()}\n%%EOF`,
        'ascii',
      );
      await expect(
        service.uploadCredentialDocument(
          1,
          55,
          10,
          {
            originalname: 'infected-license.pdf',
            mimetype: 'application/pdf',
            size: infected.length,
            buffer: infected,
          },
          { configRoot: tmpRoot },
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(fs.readdirSync(tmpRoot)).toHaveLength(0);

      // 2. Clean PDF upload -> encrypted at rest + enc-v1 documentRef persisted
      const cleanPdf = Buffer.from(
        '%PDF-1.4\nVerified Medical Practice License #991\n%%EOF',
        'utf8',
      );
      tx.staffCredential.findFirst.mockResolvedValueOnce({
        id: 55,
        hospitalId: 1,
        status: 'ACTIVE',
      });
      let storedDocumentRef = '';
      tx.staffCredential.update.mockImplementationOnce(
        ({ data }: { data: { documentRef: string } }) => {
          storedDocumentRef = data.documentRef;
          return Promise.resolve({
            id: 55,
            hospitalId: 1,
            credentialType: 'PRACTICE_LICENSE',
            status: 'ACTIVE',
            expiryDate: new Date('2028-01-01T00:00:00.000Z'),
            alertDaysBefore: 30,
            documentRef: data.documentRef,
          });
        },
      );

      const uploaded = await service.uploadCredentialDocument(
        1,
        55,
        10,
        {
          originalname: 'license.pdf',
          mimetype: 'application/pdf',
          size: cleanPdf.length,
          buffer: cleanPdf,
        },
        { configRoot: tmpRoot },
      );

      expect(storedDocumentRef).toMatch(
        /^enc-v1:[a-f0-9]{64}:1\/credentials\/55\/.+\.pdf$/,
      );
      expect(uploaded.documentRef).toBe(storedDocumentRef);

      const relKey = storedDocumentRef.slice('enc-v1:'.length + 65);
      const diskPath = path.join(tmpRoot, relKey);
      const onDiskBytes = fs.readFileSync(diskPath);
      expect(isEncryptedAttachmentEnvelope(onDiskBytes)).toBe(true);
      expect(onDiskBytes.includes(Buffer.from('Verified Medical'))).toBe(false);

      // 3. Authorized download decrypts and returns identical PDF bytes
      prisma.staffCredential.findFirst.mockResolvedValue({
        id: 55,
        credentialType: 'PRACTICE_LICENSE',
        documentRef: storedDocumentRef,
      });
      const downloaded = await service.downloadCredentialDocument(1, 55, 10, {
        configRoot: tmpRoot,
      });
      expect(downloaded.contentType).toBe('application/pdf');
      expect(downloaded.buffer.equals(cleanPdf)).toBe(true);

      // 4. Tampering with encrypted bytes on disk must fail closed (ConflictException)
      const tampered = Buffer.from(onDiskBytes);
      tampered[tampered.length - 1] ^= 0xff;
      fs.writeFileSync(diskPath, tampered);

      await expect(
        service.downloadCredentialDocument(1, 55, 10, { configRoot: tmpRoot }),
      ).rejects.toThrow(ConflictException);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
