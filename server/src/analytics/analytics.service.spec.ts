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
      expect(result.trends).toHaveLength(6);
      expect(result.trends[0].name).toBe('2025-12');
      expect(result.trends[5].name).toBe('2026-05');
    });

    it('computes 6 monthly historical trends from real database buckets (UI08)', async () => {
      mockPrisma.encounter.findMany.mockResolvedValue([]);
      mockPrisma.encounter.findFirst.mockResolvedValue(null);
      mockPrisma.medicationAdministration.count.mockResolvedValue(0);
      mockPrisma.careGap.count.mockResolvedValue(0);
      mockPrisma.cDSSAlert.count.mockResolvedValue(0);

      // Period queries (2 encounter.findMany: admissions + discharged) then 6 months x 1 encounter.findMany
      mockPrisma.encounter.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { patientId: 7, createdAt: new Date('2026-05-10') },
        ]);
      mockPrisma.encounter.findFirst.mockResolvedValueOnce({ id: 99 });

      mockPrisma.medicationAdministration.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      // Skip 5 months x 2 = 10 zeroes, then 6th month: total 4, overrides 1 => 25%
      for (let i = 0; i < 10; i++) {
        mockPrisma.medicationAdministration.count.mockResolvedValueOnce(0);
      }
      mockPrisma.medicationAdministration.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1);

      mockPrisma.careGap.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      for (let i = 0; i < 10; i++) {
        mockPrisma.careGap.count.mockResolvedValueOnce(0);
      }
      mockPrisma.careGap.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);

      const result = await service.getClinicalKPIs(
        1,
        new Date('2026-05-01T00:00:00Z'),
        new Date('2026-05-30T00:00:00Z'),
      );

      expect(result.trends).toHaveLength(6);
      expect(result.trends.map((m) => m.name)).toEqual([
        '2025-12',
        '2026-01',
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
      ]);
      expect(result.trends[5]).toEqual({
        name: '2026-05',
        readmission: 100,
        override: 25,
        gapClosure: 60,
      });
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

  describe('getExecutiveStats', () => {
    it('computes inventoryValue (from 4dp costPrice) and net dailyRevenue with 3dp Money precision', async () => {
      mockPrisma.encounter.count
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(4);
      mockPrisma.productStock.findMany.mockResolvedValue([
        { quantity: '300.000', product: { costPrice: '0.4167' } },
        { quantity: '10.000', product: { costPrice: '2.5005' } },
      ]);
      mockPrisma.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: '500.375' } })
        .mockResolvedValueOnce({ _sum: { totalAmount: '50.125' } });

      const stats = await service.getExecutiveStats(1);
      // 300 * 0.4167 = 125.010; 10 * 2.5005 = 25.005 => 150.015 LYD (no Math.round truncation!)
      expect(stats.inventoryValue).toBe(150.015);
      // 500.375 - 50.125 = 450.250 LYD
      expect(stats.dailyRevenue).toBe(450.25);
    });
  });
});
