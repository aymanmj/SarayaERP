import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  StaffCredentialingService,
  computeCredentialCompliance,
  evaluateStaffSchedulingEligibility,
} from './staff-credentialing.service';
import type { PrismaService } from '../prisma/prisma.service';

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
      staffCredential: { findMany: jest.fn() },
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
});
