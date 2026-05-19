import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  const mockPrisma = {
    encounter: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    medicationAdministration: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    careGap: {
      count: jest.fn(),
    },
    cDSSAlert: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    careTask: {
      findMany: jest.fn(),
    },
    invoice: {
      aggregate: jest.fn(),
    },
    productStock: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClinicalKPIs', () => {
    it('should calculate HIMSS KPIs correctly', async () => {
      // Mock Readmission (Total 2 admissions, 1 is readmission)
      mockPrisma.encounter.findMany.mockResolvedValue([
        {
          patientId: 1,
          createdAt: new Date('2026-05-15'),
          dischargeDate: new Date('2026-05-16'),
        },
        {
          patientId: 2,
          createdAt: new Date('2026-05-15'),
          dischargeDate: new Date('2026-05-20'),
        }, // 5 days LOS
      ]);
      mockPrisma.encounter.findFirst
        .mockResolvedValueOnce({
          id: 10,
          dischargeDate: new Date('2026-05-01'),
        }) // Patient 1 readmitted
        .mockResolvedValueOnce(null); // Patient 2 not readmitted

      // Medication Overrides (10 total, 2 overrides)
      mockPrisma.medicationAdministration.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(2); // override

      // Care Gaps (5 total, 4 closed)
      mockPrisma.careGap.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(4);

      // CDSS Alerts (20 total, 5 overridden)
      mockPrisma.cDSSAlert.count
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(5);

      const result = await service.getClinicalKPIs(
        1,
        new Date('2026-05-01'),
        new Date('2026-05-30'),
      );

      expect(result.readmissionRate).toBe(50); // 1 out of 2
      expect(result.readmissionCount).toBe(1);

      // ALOS logic test: Total hours = 24 + 120 = 144. 144/2 = 72 hours = 3 days average
      expect(result.averageLOSDays).toBe(3);

      expect(result.medicationOverrideRate).toBe(20); // 2 out of 10
      expect(result.careGapClosureRate).toBe(80); // 4 out of 5
      expect(result.cdssOverrideRate).toBe(25); // 5 out of 20
    });
  });

  describe('getClinicalVarianceReport', () => {
    it('should calculate CDSS overrides, CLMA overrides, and pathway non-compliance', async () => {
      mockPrisma.cDSSAlert.findMany.mockResolvedValue([
        {
          severity: 'CRITICAL',
          acknowledgedBy: { department: { name: 'ER' } },
        },
        { severity: 'HIGH', acknowledgedBy: { department: { name: 'ER' } } },
      ]);

      mockPrisma.medicationAdministration.findMany.mockResolvedValue([
        { performer: { fullName: 'Nurse 1' } },
      ]);

      mockPrisma.careTask.findMany.mockResolvedValue([
        { step: { title: 'Vaccine' }, completedBy: { fullName: 'Dr. John' } },
      ]);

      const result = await service.getClinicalVarianceReport(
        1,
        new Date(),
        new Date(),
      );

      expect(result.cpoeAlertFatigue.totalOverrides).toBe(2);
      expect(result.cpoeAlertFatigue.byDepartment['ER']).toBe(2);
      expect(result.cpoeAlertFatigue.bySeverity.CRITICAL).toBe(1);

      expect(result.clmaComplianceRisks.totalOverrides).toBe(1);
      expect(result.clmaComplianceRisks.byDoctorOrNurse['Nurse 1']).toBe(1);

      expect(result.pathwayDeviations.totalSkippedTasks).toBe(1);
    });
  });
});
