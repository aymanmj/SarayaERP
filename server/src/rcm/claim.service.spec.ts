import { Test, TestingModule } from '@nestjs/testing';
import { ClaimService } from './claim.service';
import { ClaimScrubberService } from './scrubber/claim-scrubber.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ClaimStatus } from '@prisma/client';
import Decimal from 'decimal.js';

describe('ClaimService', () => {
  let service: ClaimService;

  const mockHospitalId = 1;

  const mockInvoice = {
    id: 100,
    hospitalId: mockHospitalId,
    patientId: 1,
    encounterId: 50,
    totalAmount: new Decimal(500),
    insuranceShare: new Decimal(400),
    patientShare: new Decimal(100),
    insuranceProviderId: 5,
    status: 'ISSUED',
    patient: { id: 1, fullName: 'أحمد محمد', mrn: 'MRN-001', dateOfBirth: new Date('1990-01-01'), gender: 'MALE' },
    insuranceProvider: { id: 5, name: 'تأمين الراجحي', isActive: true, plans: [] },
    encounter: { id: 50, type: 'OUTPATIENT', diagnoses: [{ type: 'PRIMARY', code: 'J06.9' }] },
    items: [{ id: 1, serviceItemId: 10, quantity: 1, unitPrice: 500, totalAmount: 500 }],
  };

  const mockClaim = {
    id: 1,
    hospitalId: mockHospitalId,
    invoiceId: 100,
    claimNumber: 'CLM-202604-00001',
    status: ClaimStatus.DRAFT,
    claimedAmount: new Decimal(400),
    paidAmount: null,
    submittedAt: null,
    paidAt: null,
    batchId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    invoice: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    claim: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    claimScrubResult: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    claimHistory: {
      create: jest.fn(),
    },
    $transaction: jest.fn((args) => {
      if (Array.isArray(args)) return Promise.all(args);
      return args(mockPrisma);
    }),
  };

  const mockScrubber = {
    scrub: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClaimScrubberService, useValue: mockScrubber },
      ],
    }).compile();

    service = module.get<ClaimService>(ClaimService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // createClaim
  // ============================================
  describe('createClaim', () => {
    it('should create a claim from a valid insured invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockPrisma.claim.findFirst.mockResolvedValue(null); // لا توجد مطالبة مكررة
      mockPrisma.claim.create.mockResolvedValue({
        ...mockClaim,
        invoice: mockInvoice,
      });

      const result = await service.createClaim(mockHospitalId, 100);

      expect(result.claimNumber).toMatch(/^CLM-/);
      expect(mockPrisma.claim.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hospitalId: mockHospitalId,
            invoiceId: 100,
            status: ClaimStatus.DRAFT,
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.createClaim(mockHospitalId, 999),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for non-insured invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        ...mockInvoice,
        insuranceProviderId: null,
      });

      await expect(
        service.createClaim(mockHospitalId, 100),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for duplicate active claim', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockPrisma.claim.findFirst.mockResolvedValue(mockClaim);

      await expect(
        service.createClaim(mockHospitalId, 100),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // scrubClaim
  // ============================================
  describe('scrubClaim', () => {
    it('should pass scrubbing when no errors found', async () => {
      mockPrisma.claim.findUnique.mockResolvedValue({
        ...mockClaim,
        invoice: mockInvoice,
      });
      mockScrubber.scrub.mockResolvedValue([
        { ruleCode: 'AUTHORIZATION', severity: 'WARNING', message: 'تحقق من Pre-Auth' },
      ]);
      mockPrisma.claimScrubResult.deleteMany.mockResolvedValue({});
      mockPrisma.claimScrubResult.createMany.mockResolvedValue({});
      mockPrisma.claim.update.mockResolvedValue({ ...mockClaim, status: ClaimStatus.SCRUBBED });
      mockPrisma.claimHistory.create.mockResolvedValue({});
      // getClaimById
      mockPrisma.claim.findUnique.mockResolvedValue({
        ...mockClaim,
        status: ClaimStatus.SCRUBBED,
        scrubResults: [],
        history: [],
      });

      const result = await service.scrubClaim(1);

      expect(result.passed).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(1);
    });

    it('should fail scrubbing when errors are found', async () => {
      mockPrisma.claim.findUnique.mockResolvedValue({
        ...mockClaim,
        invoice: { ...mockInvoice, patient: null },
      });
      mockScrubber.scrub.mockResolvedValue([
        { ruleCode: 'COMPLETENESS', severity: 'ERROR', message: 'بيانات المريض غير موجودة' },
        { ruleCode: 'CODING', severity: 'ERROR', message: 'التشخيص مفقود' },
      ]);
      mockPrisma.claimScrubResult.deleteMany.mockResolvedValue({});
      mockPrisma.claimScrubResult.createMany.mockResolvedValue({});
      mockPrisma.claim.update.mockResolvedValue({ ...mockClaim, status: ClaimStatus.SCRUB_FAILED });
      mockPrisma.claimHistory.create.mockResolvedValue({});
      mockPrisma.claim.findUnique.mockResolvedValue({
        ...mockClaim,
        status: ClaimStatus.SCRUB_FAILED,
      });

      const result = await service.scrubClaim(1);

      expect(result.passed).toBe(false);
      expect(result.errorCount).toBe(2);
    });

    it('should throw NotFoundException for non-existent claim', async () => {
      mockPrisma.claim.findUnique.mockResolvedValue(null);

      await expect(service.scrubClaim(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // postPayment
  // ============================================
  describe('postPayment', () => {
    it('should fully pay a claim when amount covers claimed amount', async () => {
      mockPrisma.claim.findUnique.mockResolvedValue({
        ...mockClaim,
        claimedAmount: new Decimal(400),
        paidAmount: new Decimal(0),
      });
      mockPrisma.claim.update.mockResolvedValue({
        ...mockClaim,
        status: ClaimStatus.PAID,
        paidAmount: new Decimal(400),
        paidAt: new Date(),
      });
      mockPrisma.claimHistory.create.mockResolvedValue({});

      const result = await service.postPayment(1, { paidAmount: 400 });

      expect(result.status).toBe(ClaimStatus.PAID);
    });

    it('should partially pay when amount does not cover full claim', async () => {
      mockPrisma.claim.findUnique.mockResolvedValue({
        ...mockClaim,
        claimedAmount: new Decimal(400),
        paidAmount: new Decimal(0),
      });
      mockPrisma.claim.update.mockResolvedValue({
        ...mockClaim,
        status: ClaimStatus.PARTIALLY_PAID,
        paidAmount: new Decimal(200),
      });
      mockPrisma.claimHistory.create.mockResolvedValue({});

      const result = await service.postPayment(1, { paidAmount: 200 });

      expect(result.status).toBe(ClaimStatus.PARTIALLY_PAID);
    });
  });

  // ============================================
  // denyClaim
  // ============================================
  describe('denyClaim', () => {
    it('should deny claim with denial code and reason', async () => {
      mockPrisma.claim.findUnique.mockResolvedValue(mockClaim);
      mockPrisma.claim.update.mockResolvedValue({
        ...mockClaim,
        status: ClaimStatus.REJECTED,
        denialCode: 'CO-4',
        denialReason: 'الخدمة غير مغطاة بالوثيقة',
      });
      mockPrisma.claimHistory.create.mockResolvedValue({});

      const result = await service.denyClaim(1, {
        denialCode: 'CO-4',
        denialReason: 'الخدمة غير مغطاة بالوثيقة',
      });

      expect(result.status).toBe(ClaimStatus.REJECTED);
      expect(result.denialCode).toBe('CO-4');
    });
  });

  // ============================================
  // findClaims
  // ============================================
  describe('findClaims', () => {
    it('should return paginated claims with default pagination', async () => {
      mockPrisma.claim.findMany.mockResolvedValue([mockClaim]);
      mockPrisma.claim.count.mockResolvedValue(1);

      const result = await service.findClaims(mockHospitalId);

      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by status', async () => {
      mockPrisma.claim.findMany.mockResolvedValue([]);
      mockPrisma.claim.count.mockResolvedValue(0);

      await service.findClaims(mockHospitalId, {
        status: ClaimStatus.REJECTED,
      });

      expect(mockPrisma.claim.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hospitalId: mockHospitalId,
            status: ClaimStatus.REJECTED,
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.claim.findMany.mockResolvedValue([]);
      mockPrisma.claim.count.mockResolvedValue(0);

      const from = new Date('2026-01-01');
      const to = new Date('2026-12-31');

      await service.findClaims(mockHospitalId, { fromDate: from, toDate: to });

      expect(mockPrisma.claim.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from, lte: to },
          }),
        }),
      );
    });
  });

  // ============================================
  // getClaimsDashboard
  // ============================================
  describe('getClaimsDashboard', () => {
    it('should return dashboard with status breakdown and KPIs', async () => {
      mockPrisma.claim.groupBy.mockResolvedValue([
        { status: ClaimStatus.DRAFT, _count: 5, _sum: { claimedAmount: new Decimal(2000) } },
        { status: ClaimStatus.PAID, _count: 10, _sum: { claimedAmount: new Decimal(8000) } },
      ]);
      mockPrisma.claim.aggregate
        .mockResolvedValueOnce({ _sum: { claimedAmount: new Decimal(10000) } })
        .mockResolvedValueOnce({ _sum: { paidAmount: new Decimal(7500) } });
      mockPrisma.claim.findMany.mockResolvedValue([]);

      const result = await service.getClaimsDashboard(mockHospitalId);

      expect(result.byStatus).toHaveLength(2);
      expect(result.totals.claimed).toBe(10000);
      expect(result.totals.paid).toBe(7500);
      expect(Number(result.totals.collectionRate)).toBeCloseTo(75);
    });
  });
});

// ============================================
// ClaimScrubberService Tests
// ============================================
describe('ClaimScrubberService', () => {
  let scrubber: ClaimScrubberService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClaimScrubberService],
    }).compile();

    scrubber = module.get<ClaimScrubberService>(ClaimScrubberService);
  });

  it('should return ERROR when patient data is missing', async () => {
    const claim = {
      claimNumber: 'CLM-TEST-001',
      claimedAmount: 500,
      invoice: { patient: null, insuranceProvider: { isActive: true }, encounter: { diagnoses: [] }, items: [] },
    };

    const results = await scrubber.scrub(claim);
    const errors = results.filter((r) => r.severity === 'ERROR');

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((r) => r.field === 'patient')).toBe(true);
  });

  it('should return ERROR when dateOfBirth is missing', async () => {
    const claim = {
      claimNumber: 'CLM-TEST-002',
      claimedAmount: 500,
      invoice: {
        patient: { fullName: 'أحمد', dateOfBirth: null, gender: 'MALE' },
        insuranceProvider: { isActive: true },
        encounter: { diagnoses: [{ type: 'PRIMARY', code: 'J06.9' }] },
        items: [{ id: 1 }],
      },
    };

    const results = await scrubber.scrub(claim);

    expect(results.some((r) => r.field === 'patient.dateOfBirth' && r.severity === 'ERROR')).toBe(true);
  });

  it('should return ERROR when insurance provider is inactive', async () => {
    const claim = {
      claimNumber: 'CLM-TEST-003',
      claimedAmount: 500,
      invoice: {
        patient: { fullName: 'أحمد', dateOfBirth: new Date(), gender: 'MALE' },
        insuranceProvider: { name: 'شركة منتهية', isActive: false },
        encounter: { diagnoses: [{ type: 'PRIMARY', code: 'J06.9' }] },
        items: [{ id: 1 }],
      },
    };

    const results = await scrubber.scrub(claim);

    expect(results.some((r) => r.ruleCode === 'ELIGIBILITY' && r.severity === 'ERROR')).toBe(true);
  });

  it('should return ERROR when no diagnosis exists', async () => {
    const claim = {
      claimNumber: 'CLM-TEST-004',
      claimedAmount: 500,
      invoice: {
        patient: { fullName: 'أحمد', dateOfBirth: new Date(), gender: 'MALE' },
        insuranceProvider: { name: 'تأمين سارية', isActive: true },
        encounter: { type: 'OUTPATIENT', diagnoses: [] },
        items: [{ id: 1 }],
      },
    };

    const results = await scrubber.scrub(claim);

    expect(results.some((r) => r.ruleCode === 'CODING' && r.severity === 'ERROR')).toBe(true);
  });

  it('should return WARNING for inpatient without pre-auth', async () => {
    const claim = {
      claimNumber: 'CLM-TEST-005',
      claimedAmount: 500,
      invoice: {
        patient: { fullName: 'أحمد', dateOfBirth: new Date(), gender: 'MALE' },
        insuranceProvider: { name: 'تأمين سارية', isActive: true },
        encounter: { type: 'INPATIENT', diagnoses: [{ type: 'PRIMARY', code: 'I21.0' }] },
        items: [{ id: 1 }],
      },
    };

    const results = await scrubber.scrub(claim);

    expect(results.some((r) => r.ruleCode === 'AUTHORIZATION' && r.severity === 'WARNING')).toBe(true);
  });

  it('should pass clean claim with all data present', async () => {
    const claim = {
      claimNumber: 'CLM-TEST-CLEAN',
      claimedAmount: 500,
      invoice: {
        patient: { fullName: 'أحمد محمد', dateOfBirth: new Date('1990-01-01'), gender: 'MALE' },
        insuranceProvider: { name: 'بوبا العربية', isActive: true },
        encounter: { type: 'OUTPATIENT', diagnoses: [{ type: 'PRIMARY', code: 'J06.9' }] },
        items: [{ id: 1, name: 'استشارة' }],
      },
    };

    const results = await scrubber.scrub(claim);
    const errors = results.filter((r) => r.severity === 'ERROR');

    expect(errors).toHaveLength(0);
  });
});
