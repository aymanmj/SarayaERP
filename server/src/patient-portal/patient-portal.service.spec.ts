/**
 * Patient Portal Service — Unit Tests (Enterprise Updated)
 * 
 * Tests:
 * - Token generation + refresh rotation + reuse detection
 * - Profile retrieval + data isolation
 * - Appointment booking delegation to AppointmentsService
 * - Cancellation policy (2-hour window, checked-in rejection)
 * - Dashboard aggregation
 * - Financial queries
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PatientPortalService } from './patient-portal.service';
import { PatientOtpService } from './auth/patient-otp.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { VaultService } from '../common/vault/vault.service';
import * as bcrypt from 'bcrypt';

describe('PatientPortalService', () => {
  let service: PatientPortalService;
  let prisma: any;
  let otpService: any;
  let appointmentsService: any;
  let vaultService: any;

  const mockPrisma = {
    patient: { findUnique: jest.fn(), findFirst: jest.fn() },
    patientRefreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    vitalSign: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    labOrder: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    prescription: { findMany: jest.fn() },
    patientAllergy: { findMany: jest.fn() },
    patientProblem: { findMany: jest.fn() },
    encounter: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    appointment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    invoice: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    payment: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((queries: any[]) => Promise.all(queries)),
  };

  const mockOtpService = {
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
  };

  const mockAppointmentsService = {
    createAppointment: jest.fn(),
    cancelPatientAppointmentWithBillingCleanup: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  beforeEach(async () => {
    vaultService = {
      getActiveKeyId: jest.fn().mockReturnValue('patient-kid'),
      getKeyOrSecret: jest.fn().mockResolvedValue('test-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientPortalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PatientOtpService, useValue: mockOtpService },
        { provide: AppointmentsService, useValue: mockAppointmentsService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: VaultService, useValue: vaultService },
      ],
    }).compile();

    service = module.get<PatientPortalService>(PatientPortalService);
    prisma = module.get<PrismaService>(PrismaService);
    otpService = module.get<PatientOtpService>(PatientOtpService);
    appointmentsService = module.get<AppointmentsService>(AppointmentsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  //  AUTH
  // ===========================================
  describe('verifyOtpAndLogin', () => {
    it('should return access + refresh tokens on successful OTP', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({
        id: 1, fullName: 'أحمد', mrn: 'MRN-0001', hospitalId: 1,
      });
      mockPrisma.patientRefreshToken.create.mockResolvedValue({ id: 1 });

      const result = await service.verifyOtpAndLogin('MRN-0001', '483921');

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.patient.fullName).toBe('أحمد');
    });
  });

  describe('refreshTokens', () => {
    it('should detect reuse of revoked refresh token and revoke ALL', async () => {
      mockPrisma.patientRefreshToken.findUnique.mockResolvedValue({
        id: 1,
        revoked: true,
        patientId: 1,
        patient: { id: 1, fullName: 'X', mrn: 'M', hospitalId: 1, isActive: true },
      });

      await expect(
        service.refreshTokens('1.fakehash'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.patientRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { patientId: 1 },
        data: { revoked: true },
      });
    });

    it('should reject non-existent token', async () => {
      mockPrisma.patientRefreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.refreshTokens('999.invalidhash'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject malformed token', async () => {
      await expect(
        service.refreshTokens('invalidformat'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should rotate a valid patient refresh token and issue new credentials', async () => {
      const rawRefreshToken = 'portal-refresh-token';
      mockPrisma.patientRefreshToken.findUnique.mockResolvedValue({
        id: 2,
        patientId: 1,
        hashedToken: await bcrypt.hash(rawRefreshToken, 10),
        revoked: false,
        expiresAt: new Date(Date.now() + 60_000),
        patient: {
          id: 1,
          fullName: 'أحمد',
          mrn: 'MRN-0001',
          hospitalId: 1,
          isActive: true,
        },
      });
      mockPrisma.patientRefreshToken.create.mockResolvedValue({ id: 8 });

      const result = await service.refreshTokens(`2.${rawRefreshToken}`);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toMatch(/^8\./);
      expect(mockPrisma.patientRefreshToken.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { revoked: true, replacedByToken: 'ROTATED' },
      });
    });

    it('should revoke and reject expired patient refresh token', async () => {
      const rawRefreshToken = 'expired-portal-token';
      mockPrisma.patientRefreshToken.findUnique.mockResolvedValue({
        id: 3,
        patientId: 1,
        hashedToken: await bcrypt.hash(rawRefreshToken, 10),
        revoked: false,
        expiresAt: new Date(Date.now() - 60_000),
        patient: {
          id: 1,
          fullName: 'أحمد',
          mrn: 'MRN-0001',
          hospitalId: 1,
          isActive: true,
        },
      });

      await expect(
        service.refreshTokens(`3.${rawRefreshToken}`),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.patientRefreshToken.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { revoked: true },
      });
    });

    it('should reject refresh token for inactive patient account', async () => {
      const rawRefreshToken = 'inactive-portal-token';
      mockPrisma.patientRefreshToken.findUnique.mockResolvedValue({
        id: 4,
        patientId: 1,
        hashedToken: await bcrypt.hash(rawRefreshToken, 10),
        revoked: false,
        expiresAt: new Date(Date.now() + 60_000),
        patient: {
          id: 1,
          fullName: 'أحمد',
          mrn: 'MRN-0001',
          hospitalId: 1,
          isActive: false,
        },
      });

      await expect(
        service.refreshTokens(`4.${rawRefreshToken}`),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('logout', () => {
    it('should revoke specific refresh token', async () => {
      await service.logout(1, '5.sometoken');

      expect(mockPrisma.patientRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 5, patientId: 1 },
        data: { revoked: true },
      });
    });

    it('should revoke ALL tokens when no specific token provided', async () => {
      await service.logout(1);

      expect(mockPrisma.patientRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { patientId: 1 },
        data: { revoked: true },
      });
    });
  });

  // ===========================================
  //  PROFILE
  // ===========================================
  describe('getProfile', () => {
    it('should return patient profile with insurance and allergies', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 1,
        mrn: 'MRN-0001',
        fullName: 'أحمد',
        hospitalId: 1,
        allergies: [{ allergen: 'Penicillin' }],
        hospital: { id: 1, name: 'مستشفى السرايا' },
        insurancePolicy: null,
      });

      const result = await service.getProfile(1, 1);

      expect(result.fullName).toBe('أحمد');
      expect(result.allergies).toHaveLength(1);
    });

    it('should throw for non-existent patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(999)).rejects.toThrow(NotFoundException);
    });

    it('should REJECT cross-hospital access', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 1,
        hospitalId: 2, // Patient belongs to hospital 2
        fullName: 'Test',
      });

      // JWT says hospitalId=1 but patient is in hospital 2
      await expect(service.getProfile(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  //  MEDICAL RECORDS - DATA ISOLATION
  // ===========================================
  describe('getVitalById — patient isolation', () => {
    it('should return vital owned by patient', async () => {
      mockPrisma.vitalSign.findUnique.mockResolvedValue({
        id: 1,
        encounter: { id: 10, patientId: 1, type: 'OPD' },
      });

      const result = await service.getVitalById(1, 1);
      expect(result.id).toBe(1);
    });

    it('should DENY access to other patients vitals', async () => {
      mockPrisma.vitalSign.findUnique.mockResolvedValue({
        id: 1,
        encounter: { id: 10, patientId: 999, type: 'OPD' },
      });

      await expect(service.getVitalById(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEncounterById — patient isolation', () => {
    it('should DENY access to encounters of other patients', async () => {
      mockPrisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        patientId: 999,
      });

      await expect(service.getEncounterById(1, 10)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  //  APPOINTMENTS (Delegated to AppointmentsService)
  // ===========================================
  describe('bookAppointment', () => {
    it('should delegate booking to AppointmentsService', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockAppointmentsService.createAppointment.mockResolvedValue({
        id: 1,
        patientId: 1,
        doctorId: 5,
        scheduledStart: futureDate,
        status: 'CONFIRMED',
        queueNumber: 4,
      });

      const result = await service.bookAppointment(1, 1, {
        doctorId: 5,
        scheduledStart: futureDate.toISOString(),
      });

      // Verify delegation happened
      expect(mockAppointmentsService.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          hospitalId: 1,
          patientId: 1,
          doctorId: 5,
          notes: 'حجز من بوابة المريض',
          createdByUserId: 0,
        }),
      );
      expect(result!.queueNumber).toBe(4);
    });

    it('should send a 30-minute slot to AppointmentsService', async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      mockAppointmentsService.createAppointment.mockResolvedValue({
        id: 2,
        queueNumber: 8,
      });

      await service.bookAppointment(1, 1, {
        doctorId: 7,
        scheduledStart: futureDate.toISOString(),
      });

      expect(mockAppointmentsService.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledStart: futureDate,
          scheduledEnd: new Date(futureDate.getTime() + 30 * 60 * 1000),
        }),
      );
    });

    it('should reject bookings less than 1 hour in the future', async () => {
      const tooSoon = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now

      await expect(
        service.bookAppointment(1, 1, {
          doctorId: 5,
          scheduledStart: tooSoon.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject past date', async () => {
      await expect(
        service.bookAppointment(1, 1, {
          doctorId: 5,
          scheduledStart: '2020-01-01T09:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelAppointment — with policy', () => {
    it('should delegate to AppointmentsService after portal policy checks', async () => {
      const futureTime = new Date(Date.now() + 5 * 60 * 60 * 1000); // 5 hours from now
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        status: 'CONFIRMED',
        scheduledStart: futureTime,
        encounterId: 10,
      });
      mockAppointmentsService.cancelPatientAppointmentWithBillingCleanup.mockResolvedValue({
        id: 1,
        status: 'CANCELLED',
      });

      const result = await service.cancelAppointment(1, 1);

      expect(result.status).toBe('CANCELLED');
      expect(
        mockAppointmentsService.cancelPatientAppointmentWithBillingCleanup,
      ).toHaveBeenCalledWith(1, 1);
    });

    it('should propagate BadRequest from billing cleanup (e.g. paid invoice)', async () => {
      const futureTime = new Date(Date.now() + 5 * 60 * 60 * 1000);
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        status: 'CONFIRMED',
        scheduledStart: futureTime,
        encounterId: 10,
      });
      mockAppointmentsService.cancelPatientAppointmentWithBillingCleanup.mockRejectedValue(
        new BadRequestException(
          'لا يمكن إلغاء الموعد بعد تسجيل دفع على الفاتورة. يرجى التواصل مع الاستقبال أو المحاسبة.',
        ),
      );

      await expect(service.cancelAppointment(1, 1)).rejects.toThrow(BadRequestException);
      expect(
        mockAppointmentsService.cancelPatientAppointmentWithBillingCleanup,
      ).toHaveBeenCalledWith(1, 1);
    });

    it('should REJECT cancellation within 2-hour window', async () => {
      const tooClose = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour from now
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        status: 'CONFIRMED',
        scheduledStart: tooClose,
      });

      await expect(service.cancelAppointment(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should REJECT cancellation of checked-in appointment', async () => {
      const futureTime = new Date(Date.now() + 5 * 60 * 60 * 1000);
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        status: 'CHECKED_IN',
        scheduledStart: futureTime,
      });

      await expect(service.cancelAppointment(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should REJECT cancellation of called appointment', async () => {
      const futureTime = new Date(Date.now() + 5 * 60 * 60 * 1000);
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        status: 'CALLED',
        scheduledStart: futureTime,
      });

      await expect(service.cancelAppointment(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should reject cancelling other patients appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 999,
        status: 'CONFIRMED',
      });

      await expect(service.cancelAppointment(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('should reject already cancelled appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        status: 'CANCELLED',
      });

      await expect(service.cancelAppointment(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should reject cancelling completed appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        status: 'COMPLETED',
      });

      await expect(service.cancelAppointment(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================
  //  DASHBOARD
  // ===========================================
  describe('getDashboard', () => {
    it('should return aggregated dashboard data', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 1, mrn: 'MRN-0001', fullName: 'أحمد', dateOfBirth: null, gender: 'MALE', hospitalId: 1,
        insurancePolicy: {
          provider: { name: 'شركة التأمين' },
          plan: { name: 'الخطة الذهبية' },
        },
      });
      mockPrisma.appointment.findFirst.mockResolvedValue({
        id: 5,
        scheduledStart: new Date('2026-05-01T09:00:00Z'),
        doctor: { id: 2, fullName: 'د. محمد' },
        department: { id: 1, name: 'الباطنية' },
      });
      mockPrisma.labOrder.findMany.mockResolvedValue([
        { id: 1, test: { name: 'CBC' } },
      ]);
      mockPrisma.invoice.findMany.mockResolvedValue([
        { totalAmount: 100, paidAmount: 30 },
      ]);
      mockPrisma.patientAllergy.findMany.mockResolvedValue([
        { allergen: 'Penicillin', severity: 'HIGH' },
      ]);
      mockPrisma.prescription.findMany.mockResolvedValue([]);

      const dashboard = await service.getDashboard(1);

      expect(dashboard.profile!.fullName).toBe('أحمد');
      expect(dashboard.nextAppointment!.id).toBe(5);
      expect(dashboard.recentLabResults).toHaveLength(1);
      expect(dashboard.financial.outstandingBalance).toBe(70);
      expect(dashboard.financial.currency).toBe('LYD');
      expect(dashboard.allergies).toHaveLength(1);
      expect(dashboard.insurance!.provider).toBe('شركة التأمين');
    });

    it('should handle patient with no data gracefully', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 1, mrn: 'MRN-0001', fullName: 'جديد', dateOfBirth: null, gender: null, hospitalId: 1,
        insurancePolicy: null,
      });
      mockPrisma.appointment.findFirst.mockResolvedValue(null);
      mockPrisma.labOrder.findMany.mockResolvedValue([]);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.patientAllergy.findMany.mockResolvedValue([]);
      mockPrisma.prescription.findMany.mockResolvedValue([]);

      const dashboard = await service.getDashboard(1);

      expect(dashboard.nextAppointment).toBeNull();
      expect(dashboard.recentLabResults).toHaveLength(0);
      expect(dashboard.financial.outstandingBalance).toBe(0);
      expect(dashboard.insurance).toBeNull();
    });

    it('should reject dashboard access when JWT hospital does not match patient hospital', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 1,
        mrn: 'MRN-0001',
        fullName: 'Cross Tenant',
        dateOfBirth: null,
        gender: 'MALE',
        hospitalId: 2,
        insurancePolicy: null,
      });
      mockPrisma.appointment.findFirst.mockResolvedValue(null);
      mockPrisma.labOrder.findMany.mockResolvedValue([]);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.patientAllergy.findMany.mockResolvedValue([]);
      mockPrisma.prescription.findMany.mockResolvedValue([]);

      await expect(service.getDashboard(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  //  FINANCIAL
  // ===========================================
  describe('getOutstandingBalance', () => {
    it('should calculate total outstanding correctly', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        { id: 1, totalAmount: 100, paidAmount: 30, status: 'ISSUED' },
        { id: 2, totalAmount: 200, paidAmount: 200, status: 'ISSUED' },
        { id: 3, totalAmount: 50, paidAmount: 0, status: 'PARTIALLY_PAID' },
      ]);

      const result = await service.getOutstandingBalance(1);

      expect(result.totalOutstanding).toBe(120);
      expect(result.currency).toBe('LYD');
      expect(result.invoiceCount).toBe(3);
    });

    it('should return 0 when no outstanding invoices', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.getOutstandingBalance(1);
      expect(result.totalOutstanding).toBe(0);
    });
  });

  describe('getInsuranceInfo', () => {
    it('should return insurance info for insured patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        insurancePolicy: {
          provider: { id: 1, name: 'شركة التأمين' },
          plan: { id: 1, name: 'الخطة الذهبية' },
        },
        insuranceMemberId: 'INS-12345',
      });

      const result = await service.getInsuranceInfo(1);

      expect(result.hasInsurance).toBe(true);
      expect(result.memberId).toBe('INS-12345');
    });

    it('should return hasInsurance=false for uninsured patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({
        insurancePolicy: null,
        insuranceMemberId: null,
      });

      const result = await service.getInsuranceInfo(1);
      expect(result.hasInsurance).toBe(false);
    });
  });

  describe('getInvoiceById', () => {
    it('should return invoice details for the owning patient', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 6,
        patientId: 1,
        payments: [],
        charges: [],
      });

      const result = await service.getInvoiceById(1, 6);

      expect(result.id).toBe(6);
    });

    it('should reject access to another patient invoice', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 7,
        patientId: 999,
        payments: [],
        charges: [],
      });

      await expect(service.getInvoiceById(1, 7)).rejects.toThrow(NotFoundException);
    });
  });
});
