import { Test, TestingModule } from '@nestjs/testing';
import { MpiService } from './mpi.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { OutboundQueueService } from '../integration/outbound-queue.service';

describe('MpiService', () => {
  let service: MpiService;

  const mockPrisma = {
    orgSetting: { findUnique: jest.fn() },
    globalPatient: { findMany: jest.fn() },
    patient: { findUnique: jest.fn() },
    patientOtp: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockOutboundQueueService = {
    enqueue: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MpiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboundQueueService, useValue: mockOutboundQueueService },
      ],
    }).compile();

    service = module.get<MpiService>(MpiService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // searchMpi
  // ============================================
  describe('searchMpi', () => {
    it('should throw ForbiddenException when federation is disabled', async () => {
      mockPrisma.orgSetting.findUnique.mockResolvedValue(null);

      await expect(
        service.searchMpi(1, { nationalId: '1234567890' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when federation value is not true', async () => {
      mockPrisma.orgSetting.findUnique.mockResolvedValue({ value: 'false' });

      await expect(
        service.searchMpi(1, { nationalId: '1234567890' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return empty array when no search criteria provided', async () => {
      // Federation enabled
      mockPrisma.orgSetting.findUnique
        .mockResolvedValueOnce({ value: 'true' }) // enableFederation
        .mockResolvedValueOnce({ value: 'false' }); // requirePatientOTP

      const result = await service.searchMpi(1, {});
      expect(result).toEqual([]);
    });

    it('should return REQUIRES_OTP status when OTP is required', async () => {
      mockPrisma.orgSetting.findUnique
        .mockResolvedValueOnce({ value: 'true' }) // enableFederation
        .mockResolvedValueOnce({ value: 'true' }); // requirePatientOTP

      mockPrisma.globalPatient.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'أحمد محمد',
          nationalId: '1234567890',
          dateOfBirth: new Date('1990-01-01'),
          gender: 'MALE',
          localPatients: [
            {
              id: 10,
              hospitalId: 2,
              mrn: 'MRN-002',
              hospital: { name: 'مستشفى الرياض' },
            },
          ],
        },
      ]);

      const result = await service.searchMpi(1, { nationalId: '1234567890' });

      expect(result).toHaveLength(1);
      expect(result[0].facilities[0].status).toBe('REQUIRES_OTP');
      expect(result[0].facilities[0]).not.toHaveProperty('localMrn');
    });

    it('should return ACCESSIBLE status when OTP is not required', async () => {
      mockPrisma.orgSetting.findUnique
        .mockResolvedValueOnce({ value: 'true' }) // enableFederation
        .mockResolvedValueOnce({ value: 'false' }); // requirePatientOTP

      mockPrisma.globalPatient.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'أحمد محمد',
          nationalId: '1234567890',
          dateOfBirth: new Date('1990-01-01'),
          gender: 'MALE',
          localPatients: [
            {
              id: 10,
              hospitalId: 2,
              mrn: 'MRN-002',
              hospital: { name: 'مستشفى الرياض' },
            },
          ],
        },
      ]);

      const result = await service.searchMpi(1, { nationalId: '1234567890' });

      expect(result).toHaveLength(1);
      expect(result[0].facilities[0].status).toBe('ACCESSIBLE');
      expect(result[0].facilities[0].localMrn).toBe('MRN-002');
    });
  });

  // ============================================
  // triggerConsentOtp
  // ============================================
  describe('triggerConsentOtp', () => {
    it('should throw NotFoundException when patient does not exist', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.triggerConsentOtp(
          999,
          'Dr. Ahmad',
          'مستشفى جدة',
          1,
          null,
          10,
          'treatment',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when OTP was recently requested (rate limit)', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'أحمد',
        phone: '+966500000000',
      });
      // Recent OTP exists within the last minute
      mockPrisma.patientOtp.findFirst.mockResolvedValue({
        id: 1,
        patientId: 1,
        createdAt: new Date(),
      });

      await expect(
        service.triggerConsentOtp(
          1,
          'Dr. Ahmad',
          'مستشفى جدة',
          1,
          null,
          10,
          'treatment',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create OTP with bcrypt-hashed code', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'أحمد محمد',
        phone: '+966500000000',
      });
      mockPrisma.patientOtp.findFirst.mockResolvedValue(null); // No recent OTP
      mockPrisma.patientOtp.create.mockResolvedValue({ id: 1 });

      const result = await service.triggerConsentOtp(
        1,
        'Dr. Ahmad',
        'مستشفى جدة',
        1,
        null,
        10,
        'treatment',
      );

      expect(result.message).toContain('OTP sent');
      expect(result.expiresAt).toBeInstanceOf(Date);

      // Verify bcrypt hash was stored (not plaintext)
      const createCall = mockPrisma.patientOtp.create.mock.calls[0][0];
      const storedCode = createCall.data.code;
      expect(storedCode).not.toMatch(/^\d{6}$/); // Must NOT be a 6-digit plaintext
      expect(
        storedCode.startsWith('$2b$') || storedCode.startsWith('$2a$'),
      ).toBe(true); // bcrypt hash

      // Verify OTP was enqueued for SMS delivery
      expect(mockOutboundQueueService.enqueue).toHaveBeenCalledTimes(1);
      expect(mockOutboundQueueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sms',
          payload: expect.objectContaining({ patientId: 1 }),
        }),
      );
    });

    it('should set 15-minute expiry on OTP', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'أحمد',
        phone: '+966500000000',
      });
      mockPrisma.patientOtp.findFirst.mockResolvedValue(null);
      mockPrisma.patientOtp.create.mockResolvedValue({ id: 1 });

      const before = Date.now();
      const result = await service.triggerConsentOtp(
        1,
        'Dr. Test',
        'Hospital',
        1,
        null,
        10,
        'treatment',
      );
      const after = Date.now();

      const expectedMin = before + 14 * 60 * 1000; // At least 14 min from before
      const expectedMax = after + 16 * 60 * 1000; // At most 16 min from after
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });
  });

  // ============================================
  // verifyConsentOtp
  // ============================================
  describe('verifyConsentOtp', () => {
    it('should throw ForbiddenException when no valid OTP records exist', async () => {
      mockPrisma.patientOtp.findMany.mockResolvedValue([]);

      await expect(service.verifyConsentOtp(1, '123456')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when OTP code does not match any hash', async () => {
      const hashedCode = await bcrypt.hash('654321', 10);
      mockPrisma.patientOtp.findMany.mockResolvedValue([
        {
          id: 1,
          patientId: 1,
          code: hashedCode,
          verified: false,
          expiresAt: new Date(Date.now() + 600000),
        },
      ]);

      await expect(
        service.verifyConsentOtp(1, '999999'), // Wrong code
      ).rejects.toThrow(ForbiddenException);
    });

    it('should verify correct OTP and return signed JWT consent token', async () => {
      const rawOtp = '123456';
      const hashedCode = await bcrypt.hash(rawOtp, 10);
      mockPrisma.patientOtp.findMany.mockResolvedValue([
        {
          id: 1,
          patientId: 1,
          code: hashedCode,
          verified: false,
          expiresAt: new Date(Date.now() + 600000),
        },
      ]);
      mockPrisma.patientOtp.update.mockResolvedValue({});

      const result = await service.verifyConsentOtp(1, rawOtp);

      expect(result.status).toBe('ACCESSIBLE');
      expect(result.message).toBe('OTP Verified Successfully');
      expect(result.fhirReference).toContain('/Patient/1');

      // Verify the consent token is a valid JWT
      const decoded = jwt.decode(result.consentToken) as any;
      expect(decoded).not.toBeNull();
      expect(decoded.sub).toBe(1);
      expect(decoded.type).toBe('mpi_consent');
      expect(decoded.scope).toBe('patient/*.read');
    });

    it('should mark OTP as verified after successful validation', async () => {
      const rawOtp = '555555';
      const hashedCode = await bcrypt.hash(rawOtp, 10);
      mockPrisma.patientOtp.findMany.mockResolvedValue([
        {
          id: 42,
          patientId: 1,
          code: hashedCode,
          verified: false,
          expiresAt: new Date(Date.now() + 600000),
        },
      ]);
      mockPrisma.patientOtp.update.mockResolvedValue({});

      await service.verifyConsentOtp(1, rawOtp);

      expect(mockPrisma.patientOtp.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { verified: true },
      });
    });
  });

  // ============================================
  // revokeConsent
  // ============================================
  describe('revokeConsent', () => {
    beforeEach(() => {
      // Add missing mock methods for revocation
      (mockPrisma as any).patientOtp.updateMany = jest.fn();
      (mockPrisma as any).auditLog = { create: jest.fn(), findMany: jest.fn() };
      (mockPrisma as any).$transaction = jest.fn(async (fn: any) => fn(mockPrisma));
    });

    it('should throw NotFoundException when patient does not exist', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.revokeConsent({
          patientId: 999,
          revokedByUserId: 1,
          revokedByRole: 'ADMIN',
          reason: 'Patient requested',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate all active OTPs and create audit log', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'أحمد محمد',
        hospitalId: 1,
      });
      (mockPrisma as any).patientOtp.updateMany.mockResolvedValue({ count: 3 });
      (mockPrisma as any).auditLog.create.mockResolvedValue({ id: 1 });

      const result = await service.revokeConsent({
        patientId: 1,
        revokedByUserId: 10,
        revokedByRole: 'ADMIN',
        reason: 'Patient withdrawal of consent',
      });

      expect(result).toBeDefined();
      expect(result.message).toContain('revoked');

      // Verify OTPs were invalidated
      expect((mockPrisma as any).patientOtp.updateMany).toHaveBeenCalled();

      // Verify audit log was created
      expect((mockPrisma as any).auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'MPI_CONSENT_REVOKED',
            entity: 'Patient',
            entityId: 1,
          }),
        }),
      );
    });

    it('should support organization-scoped revocation', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'أحمد محمد',
        hospitalId: 1,
      });
      (mockPrisma as any).patientOtp.updateMany.mockResolvedValue({ count: 1 });
      (mockPrisma as any).auditLog.create.mockResolvedValue({ id: 1 });

      const result = await service.revokeConsent({
        patientId: 1,
        revokedByUserId: 10,
        revokedByRole: 'ADMIN',
        organizationId: 5,
        reason: 'Org-specific revocation',
      });

      expect(result).toBeDefined();

      // Verify OTP filter included requestingOrganizationId
      const updateCall = (mockPrisma as any).patientOtp.updateMany.mock.calls[0][0];
      expect(updateCall.where.requestingOrganizationId).toBe(5);
    });
  });

  // ============================================
  // getConsentAuditTrail
  // ============================================
  describe('getConsentAuditTrail', () => {
    beforeEach(() => {
      (mockPrisma as any).auditLog = { create: jest.fn(), findMany: jest.fn() };
      (mockPrisma as any).patient.findFirst = jest.fn().mockResolvedValue({ id: 1, hospitalId: 1 });
    });

    it('should return combined consent requests and revocations', async () => {
      // Mock OTP consent requests
      mockPrisma.patientOtp.findMany.mockResolvedValue([
        {
          id: 1,
          requestedBy: 'Dr. Ahmad',
          requestingOrg: 'مستشفى جدة',
          createdAt: new Date('2026-05-01'),
          expiresAt: new Date('2026-05-01T00:15:00'),
          verified: true,
          lockedUntil: null,
        },
      ]);

      // Mock revocation audit logs
      (mockPrisma as any).auditLog.findMany.mockResolvedValue([
        {
          id: 10,
          action: 'MPI_CONSENT_REVOKED',
          userId: 10,
          createdAt: new Date('2026-05-10'),
          details: { reason: 'Patient withdrawal' },
        },
      ]);

      const result = await service.getConsentAuditTrail(1, 1);

      expect(result).toBeDefined();
      expect(result.consentRequests).toHaveLength(1);
      expect(result.consentRequests[0].status).toBe('GRANTED');
      expect(result.revocations).toHaveLength(1);
      expect((result.revocations[0].details as any)?.reason).toBe('Patient withdrawal');
    });

    it('should classify expired OTP as EXPIRED status', async () => {
      mockPrisma.patientOtp.findMany.mockResolvedValue([
        {
          id: 2,
          requestedBy: 'Dr. Sara',
          requestingOrg: 'مستشفى طرابلس',
          createdAt: new Date('2026-04-01'),
          expiresAt: new Date('2026-04-01T00:15:00'), // Already expired
          verified: false,
          lockedUntil: null,
        },
      ]);
      (mockPrisma as any).auditLog.findMany.mockResolvedValue([]);

      const result = await service.getConsentAuditTrail(1, 1);

      expect(result.consentRequests[0].status).toBe('EXPIRED');
    });

    it('should classify locked OTP as LOCKED status when attempts >= 5', async () => {
      mockPrisma.patientOtp.findMany.mockResolvedValue([
        {
          id: 3,
          requestedBy: 'Dr. Ali',
          requestingOrg: 'مستشفى بنغازي',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 600000),
          verified: false,
          attempts: 5, // Triggers LOCKED
        },
      ]);
      (mockPrisma as any).auditLog.findMany.mockResolvedValue([]);

      const result = await service.getConsentAuditTrail(1, 1);

      expect(result.consentRequests[0].status).toBe('LOCKED');
    });
  });
});
