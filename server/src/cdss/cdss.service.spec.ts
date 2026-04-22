import { Test, TestingModule } from '@nestjs/testing';
import { CDSSService, DrugCheckInput, PrescriptionCheckInput } from './cdss.service';
import { PrismaService } from '../prisma/prisma.service';
import { TerminologyService } from '../terminology/terminology.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CDSSAlertType, CDSSAlertSeverity, TerminologySystem } from '@prisma/client';

describe('CDSSService', () => {
  let cdssService: CDSSService;
  let prismaService: PrismaService;

  // Mock Prisma Service
  const mockPrismaService = {
    patient: {
      findUnique: jest.fn(),
    },
    labOrderResult: {
      findFirst: jest.fn(),
    },
    terminologyConcept: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    cDSSRule: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CDSSService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: TerminologyService,
          useValue: {
            searchConcepts: jest.fn().mockResolvedValue([]),
            getConceptBySystemAndCode: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    cdssService = module.get<CDSSService>(CDSSService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(cdssService).toBeDefined();
  });

  describe('calculateEGFR & checkRenalAdjustment', () => {
    it('should correctly calculate eGFR using Cockcroft-Gault formula for a male', () => {
      // (140 - 50) * 70 / (72 * 1.5) = 90 * 70 / 108 = 58.33 => 58.3
      // Public access to private method for testing purpose
      const egfr = (cdssService as any).calculateEGFR(1.5, 50, 'MALE', 70);
      expect(egfr).toBe(58.3);
    });

    it('should correctly calculate eGFR for a female (multiplied by 0.85)', () => {
      // 58.33 * 0.85 = 49.58 => 49.6
      const egfr = (cdssService as any).calculateEGFR(1.5, 50, 'FEMALE', 70);
      expect(egfr).toBe(49.6);
    });

    it('should generate a High Renal Dose Adjustment alert when eGFR is between 30 and 60 for Vancomycin', async () => {
      // Setup mock patient (Age 50, Male, Weight ignored in mock returns 70 default)
      mockPrismaService.patient.findUnique.mockResolvedValue({
        id: 1,
        dateOfBirth: new Date(new Date().getFullYear() - 50, 0, 1),
        gender: 'MALE',
      });

      // Setup mock latest creatinine (Value: 1.5mg/dL => eGFR 58.3)
      mockPrismaService.labOrderResult.findFirst.mockResolvedValue({
        value: '1.5',
      });

      // Setup terminology concept mock (No Terminology system mapping for simplicity, relies on lowercase check)
      mockPrismaService.terminologyConcept.findUnique.mockResolvedValue(null);

      const drugs: DrugCheckInput[] = [
        { genericName: 'Vancomycin hydrochloride', dose: '1000mg', route: 'IV' },
      ];

      const alerts = await cdssService.checkRenalAdjustment(1, drugs);

      expect(alerts).toBeDefined();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].type).toEqual(CDSSAlertType.RENAL_DOSE_ADJUST);
      expect(alerts[0].severity).toEqual(CDSSAlertSeverity.HIGH);
      expect(alerts[0].requiresOverride).toBe(false); // Only critical requires override
    });
    
    it('should generate a CRITICAL Renal Dose alert when eGFR is below 30', async () => {
      mockPrismaService.patient.findUnique.mockResolvedValue({
        id: 1,
        dateOfBirth: new Date(new Date().getFullYear() - 50, 0, 1),
        gender: 'MALE',
      });

      // Creatinine 3.0 => eGFR 29.17
      mockPrismaService.labOrderResult.findFirst.mockResolvedValue({
        value: '3.0',
      });
      mockPrismaService.terminologyConcept.findUnique.mockResolvedValue(null);

      const drugs: DrugCheckInput[] = [
        { genericName: 'Gentamicin 80mg', dose: '80mg', route: 'IV' },
      ];

      const alerts = await cdssService.checkRenalAdjustment(1, drugs);

      expect(alerts[0].severity).toEqual(CDSSAlertSeverity.CRITICAL);
      expect(alerts[0].requiresOverride).toBe(true);
    });
  });

  describe('checkDoseRange', () => {
    it('should generate a CRITICAL alert when Paracetamol dose exceeds 1000mg per dose', async () => {
      const drugs: DrugCheckInput[] = [
        { genericName: 'Paracetamol IV', dose: '1500mg', route: 'IV' },
      ];

      const alerts = await cdssService.checkDoseRange(drugs);

      expect(alerts).toBeDefined();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].type).toEqual(CDSSAlertType.DOSAGE_WARNING);
      expect(alerts[0].severity).toEqual(CDSSAlertSeverity.CRITICAL);
      expect(alerts[0].message).toContain('Dose exceeds maximum limit');
      expect(alerts[0].requiresOverride).toBe(true);
    });

    it('should NOT generate an alert when Paracetamol dose is safe (1000mg)', async () => {
      const drugs: DrugCheckInput[] = [
        { genericName: 'Paracetamol IV', dose: '1000mg', route: 'IV' },
      ];

      const alerts = await cdssService.checkDoseRange(drugs);
      expect(alerts.length).toBe(0);
    });
  });
});
