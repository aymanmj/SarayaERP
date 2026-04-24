import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PatientOtpService } from './auth/patient-otp.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { VaultService } from '../common/vault/vault.service';
import * as bcrypt from 'bcrypt';

describe('PatientOtpService', () => {
  let service: PatientOtpService;
  let prisma: any;

  const mockPrisma = {
    patient: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    patientOtp: {
      count: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEncryptionService = {
    encrypt: jest.fn((val: string) => val),
    decrypt: jest.fn((val: string) => val),
  };

  const mockVaultService = {
    getOptionalSecret: jest.fn().mockResolvedValue(null),
    getSecret: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientOtpService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: VaultService, useValue: mockVaultService },
      ],
    }).compile();

    service = module.get<PatientOtpService>(PatientOtpService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  //  REQUEST OTP
  // ===========================================
  describe('requestOtp', () => {
    const mockPatient = {
      id: 1,
      fullName: 'أحمد محمد',
      hospitalId: 1,
      mrn: 'MRN-0001',
      phone: '0912345678',
      telegramChatId: null, // No Telegram → deep link flow
      email: null,
    };

    const mockPatientLinked = {
      ...mockPatient,
      telegramChatId: '123456789', // Has Telegram → direct OTP send
    };

    it('should send OTP successfully for linked patient', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatientLinked);
      mockPrisma.patientOtp.count.mockResolvedValue(0);
      mockPrisma.patientOtp.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.patientOtp.create.mockResolvedValue({ id: 1 });
      mockPrisma.patientOtp.update.mockResolvedValue({ id: 1 });

      const result = await service.requestOtp('MRN-0001', '0912345678');

      expect(result.message).toContain('تم إرسال');
      expect(result.expiresIn).toBe(300); // 5 minutes
      expect(mockPrisma.patientOtp.create).toHaveBeenCalled();
    });

    it('should return deep link for unlinked patient', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.patientOtp.count.mockResolvedValue(0);
      mockPrisma.patientOtp.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.patient.update.mockResolvedValue({ id: 1 });

      const result = await service.requestOtp('MRN-0001', '0912345678');

      expect(result.requiresTelegramLinking).toBe(true);
      expect(result.linkUrl).toBeDefined();
    });

    it('should reject invalid MRN + phone combination', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(
        service.requestOtp('INVALID', '0000000000'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should rate limit after 5 OTPs per hour', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatientLinked);
      mockPrisma.patientOtp.count.mockResolvedValue(5); // Already 5 OTPs

      await expect(
        service.requestOtp('MRN-0001', '0912345678'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should invalidate previous unverified OTPs', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatientLinked);
      mockPrisma.patientOtp.count.mockResolvedValue(0);
      mockPrisma.patientOtp.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.patientOtp.create.mockResolvedValue({ id: 2 });
      mockPrisma.patientOtp.update.mockResolvedValue({ id: 2 });

      await service.requestOtp('MRN-0001', '0912345678');

      expect(mockPrisma.patientOtp.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patientId: 1,
            verified: false,
          }),
        }),
      );
    });

    it('should store hashed OTP (never plaintext)', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatientLinked);
      mockPrisma.patientOtp.count.mockResolvedValue(0);
      mockPrisma.patientOtp.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.patientOtp.create.mockResolvedValue({ id: 1 });
      mockPrisma.patientOtp.update.mockResolvedValue({ id: 1 });

      await service.requestOtp('MRN-0001', '0912345678');

      const createCall = mockPrisma.patientOtp.create.mock.calls[0][0];
      const storedCode = createCall.data.code;

      // Verify it's a bcrypt hash (starts with $2b$ or similar)
      expect(storedCode).toMatch(/^\$2[aby]?\$/);
      // It should NOT be a 6-digit number
      expect(storedCode).not.toMatch(/^\d{6}$/);
    });
  });

  // ===========================================
  //  VERIFY OTP
  // ===========================================
  describe('verifyOtp', () => {
    const mockPatient = { id: 1, fullName: 'أحمد', mrn: 'MRN-0001', hospitalId: 1 };

    it('should verify valid OTP and return patient', async () => {
      const plainCode = '483921';
      const hashedCode = await bcrypt.hash(plainCode, 10);

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.patientOtp.findFirst.mockResolvedValue({
        id: 1,
        code: hashedCode,
        attempts: 0,
        verified: false,
        expiresAt: new Date(Date.now() + 300000),
      });
      mockPrisma.patientOtp.update.mockResolvedValue({ id: 1 });

      const result = await service.verifyOtp('MRN-0001', plainCode);

      expect(result.id).toBe(1);
      expect(result.fullName).toBe('أحمد');
    });

    it('should reject wrong OTP code', async () => {
      const hashedCode = await bcrypt.hash('123456', 10);

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.patientOtp.findFirst.mockResolvedValue({
        id: 1,
        code: hashedCode,
        attempts: 0,
        verified: false,
        expiresAt: new Date(Date.now() + 300000),
      });
      mockPrisma.patientOtp.update.mockResolvedValue({ id: 1 });

      await expect(
        service.verifyOtp('MRN-0001', '999999'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject expired OTP', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.patientOtp.findFirst.mockResolvedValue(null); // No valid OTP found

      await expect(
        service.verifyOtp('MRN-0001', '483921'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should lock out after 3 failed attempts', async () => {
      const hashedCode = await bcrypt.hash('123456', 10);

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.patientOtp.findFirst.mockResolvedValue({
        id: 1,
        code: hashedCode,
        attempts: 3, // Already at max
        verified: false,
        expiresAt: new Date(Date.now() + 300000),
      });
      mockPrisma.patientOtp.update.mockResolvedValue({ id: 1 });

      await expect(
        service.verifyOtp('MRN-0001', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject non-existent patient', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyOtp('FAKE-MRN', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
