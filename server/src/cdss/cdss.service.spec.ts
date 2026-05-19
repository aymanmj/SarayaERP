import { Test, TestingModule } from '@nestjs/testing';
import {
  CDSSService,
  DrugCheckInput,
  PrescriptionCheckInput,
} from './cdss.service';
import { PrismaService } from '../prisma/prisma.service';
import { TerminologyService } from '../terminology/terminology.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CDSSAlertType,
  CDSSAlertSeverity,
  TerminologySystem,
} from '@prisma/client';

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
    drugDoseRange: {
      findMany: jest.fn(),
    },
    patientAllergy: {
      findMany: jest.fn(),
    },
    allergyGroupDrug: {
      findMany: jest.fn(),
    },
    renalDoseRequirement: {
      findFirst: jest.fn(),
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

  describe('checkDrugAllergies', () => {
    it('should generate a SEVERE alert for a direct allergy match', async () => {
      mockPrismaService.patientAllergy.findMany.mockResolvedValue([
        { allergen: 'Aspirin', severity: 'SEVERE', reaction: 'Anaphylaxis' },
      ]);
      mockPrismaService.allergyGroupDrug.findMany.mockResolvedValue([]);

      const alerts = await cdssService.checkDrugAllergies(1, ['Aspirin']);

      expect(alerts).toBeDefined();
      expect(alerts.length).toBe(1);
      expect(alerts[0].type).toEqual(CDSSAlertType.DRUG_ALLERGY);
      expect(alerts[0].severity).toEqual(CDSSAlertSeverity.CRITICAL); // mapped from SEVERE
      expect(alerts[0].message).toContain('may trigger allergy to');
      expect(alerts[0].requiresOverride).toBe(true);
    });

    it('should generate a HIGH alert for cross-reactivity (e.g., Aspirin -> Ibuprofen)', async () => {
      // Patient is allergic to Aspirin
      mockPrismaService.patientAllergy.findMany.mockResolvedValue([
        { allergen: 'Aspirin', severity: 'SEVERE', reaction: 'Anaphylaxis' },
      ]);
      // AllergyGroup members setup
      mockPrismaService.allergyGroupDrug.findMany.mockResolvedValue([
        {
          drugGeneric: 'aspirin',
          allergyGroup: {
            name: 'NSAIDs',
            members: [{ drugGeneric: 'aspirin' }, { drugGeneric: 'ibuprofen' }],
          },
        },
      ]);

      const alerts = await cdssService.checkDrugAllergies(1, [
        'Ibuprofen 400mg',
      ]);

      expect(alerts).toBeDefined();
      expect(alerts.length).toBe(1);
      expect(alerts[0].type).toEqual(CDSSAlertType.DRUG_ALLERGY);
      expect(alerts[0].severity).toEqual(CDSSAlertSeverity.HIGH); // Cross-reactivity is HIGH
      expect(alerts[0].message).toContain('Cross-reactivity risk');
      expect(alerts[0].context!.crossReactivityGroup).toEqual('NSAIDs');
      expect(alerts[0].requiresOverride).toBe(false); // Only direct severe requires override in current mapping
    });

    it('should not generate an alert if there is no cross-reactivity or direct match', async () => {
      mockPrismaService.patientAllergy.findMany.mockResolvedValue([
        { allergen: 'Aspirin', severity: 'SEVERE', reaction: 'Anaphylaxis' },
      ]);
      mockPrismaService.allergyGroupDrug.findMany.mockResolvedValue([
        {
          drugGeneric: 'aspirin',
          allergyGroup: {
            name: 'NSAIDs',
            members: [{ drugGeneric: 'aspirin' }],
          },
        },
      ]);

      const alerts = await cdssService.checkDrugAllergies(1, [
        'Amoxicillin 500mg',
      ]);

      expect(alerts.length).toBe(0);
    });
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
        {
          genericName: 'Vancomycin hydrochloride',
          dose: '1000mg',
          route: 'IV',
        },
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
      mockPrismaService.drugDoseRange.findMany.mockResolvedValue([
        {
          drugName: 'paracetamol iv',
          maxDoseValue: 1000,
          minDoseValue: 500,
          doseUnit: 'mg',
        },
      ]);

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
      mockPrismaService.drugDoseRange.findMany.mockResolvedValue([
        {
          drugName: 'paracetamol iv',
          maxDoseValue: 1000,
          minDoseValue: 500,
          doseUnit: 'mg',
        },
      ]);

      const drugs: DrugCheckInput[] = [
        { genericName: 'Paracetamol IV', dose: '1000mg', route: 'IV' },
      ];

      const alerts = await cdssService.checkDoseRange(drugs);
      expect(alerts.length).toBe(0);
    });
  });

  // ============================================
  // computePatientEGFR — Standalone Renal Assessment
  // ============================================
  describe('computePatientEGFR', () => {
    it('should compute eGFR and return CKD staging for a male patient', async () => {
      // Patient: Male, age 50, creatinine 1.5
      mockPrismaService.patient.findUnique.mockResolvedValue({
        id: 1,
        dateOfBirth: new Date(new Date().getFullYear() - 50, 0, 1),
        gender: 'MALE',
      });

      mockPrismaService.labOrderResult.findFirst.mockResolvedValue({
        value: '1.5',
        labOrder: { resultDate: new Date() },
      });

      const result = await cdssService.computePatientEGFR(1, 1);

      expect(result).toBeDefined();
      expect(result.egfr!.value).toBe(58.3); // Cockcroft-Gault
      expect(result.ckd!.stage).toBe('G3a'); // 45-59 = G3a
      expect(result.ckd!.description).toContain(
        'Mildly to moderately decreased',
      );
    });

    it('should compute eGFR for a female patient (0.85 multiplier)', async () => {
      mockPrismaService.patient.findUnique.mockResolvedValue({
        id: 2,
        dateOfBirth: new Date(new Date().getFullYear() - 50, 0, 1),
        gender: 'FEMALE',
      });

      mockPrismaService.labOrderResult.findFirst.mockResolvedValue({
        value: '1.5',
        labOrder: { resultDate: new Date() },
      });

      const result = await cdssService.computePatientEGFR(1, 2);

      expect(result).toBeDefined();
      expect(result.egfr!.value).toBe(49.6); // 58.3 * 0.85
      expect(result.ckd!.stage).toBe('G3a'); // 45-59 = G3a (49.6 is in this range)
    });

    it('should classify Stage G5 (Kidney Failure) for eGFR < 15', async () => {
      mockPrismaService.patient.findUnique.mockResolvedValue({
        id: 3,
        dateOfBirth: new Date(new Date().getFullYear() - 70, 0, 1),
        gender: 'MALE',
      });

      // Very high creatinine
      mockPrismaService.labOrderResult.findFirst.mockResolvedValue({
        value: '8.0',
        labOrder: { resultDate: new Date() },
      });

      const result = await cdssService.computePatientEGFR(1, 3);

      expect(result).toBeDefined();
      expect(result.egfr!.value).toBeLessThan(15);
      expect(result.ckd!.stage).toBe('G5');
      expect(result.ckd!.description).toContain('Kidney failure');
    });

    it('should return available:false when patient has no creatinine results', async () => {
      mockPrismaService.patient.findUnique.mockResolvedValue({
        id: 4,
        dateOfBirth: new Date(new Date().getFullYear() - 40, 0, 1),
        gender: 'MALE',
      });

      mockPrismaService.labOrderResult.findFirst.mockResolvedValue(null);

      const result = await cdssService.computePatientEGFR(1, 4);
      expect(result.available).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  // ============================================
  // searchDrugInteractions — Knowledge Base Search
  // ============================================
  describe('searchDrugInteractions', () => {
    beforeEach(() => {
      (mockPrismaService as any).drugInteraction = { findMany: jest.fn() };
    });

    it('should search drug interactions by generic name', async () => {
      (mockPrismaService as any).drugInteraction.findMany.mockResolvedValue([
        {
          id: 1,
          drugAGeneric: 'warfarin',
          drugBGeneric: 'aspirin',
          severity: 'CRITICAL',
          description: 'Greatly increased risk of major bleeding',
          recommendation: 'Avoid combination',
        },
      ]);

      const results = await cdssService.searchDrugInteractions('warfarin');

      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe('CRITICAL');
      expect(results[0].drugAGeneric).toBe('warfarin');
    });

    it('should return empty array when no interactions found', async () => {
      (mockPrismaService as any).drugInteraction.findMany.mockResolvedValue([]);

      const results = await cdssService.searchDrugInteractions('vitamin_c');
      expect(results).toHaveLength(0);
    });
  });
});
