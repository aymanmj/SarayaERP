import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock } from '../test-utils';
import { PharmacyService } from '../pharmacy/pharmacy.service';
import { LabService } from '../labs/labs.service';
import { RadiologyService } from '../radiology/radiology.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountingService } from '../accounting/accounting.service';
import { CDSSService } from '../cdss/cdss.service';

describe('Clinical Services Integration Tests', () => {
  let pharmacyService: PharmacyService;
  let labService: LabService;
  let radiologyService: RadiologyService;
  let prismaService: PrismaService;

  // Mock setup
  const mockPrismaService = createPrismaMock();
  const mockEventEmitter = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
  const mockAccountingService = {
    postPharmacyDispenseEntry: jest.fn(),
    createJournalEntry: jest.fn(),
  };
  const mockCDSSService = {
    checkDrugInteractions: jest.fn().mockResolvedValue([]),
    checkDrugAllergy: jest.fn().mockResolvedValue([]),
    createAlerts: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PharmacyService,
        LabService,
        RadiologyService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: CDSSService, useValue: mockCDSSService },
      ],
    }).compile();

    pharmacyService = module.get<PharmacyService>(PharmacyService);
    labService = module.get<LabService>(LabService);
    radiologyService = module.get<RadiologyService>(RadiologyService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('Clinical Workflow Integration', () => {
    it('should handle complete prescription to dispensing workflow', async () => {
      // 1. Create prescription
      const prescriptionData = {
        hospitalId: 1,
        encounterId: 100,
        patientId: 1,
        doctorId: 1,
        notes: 'علاج التهاب',
        items: [
          {
            drugItemId: 10,
            dose: '500mg',
            route: 'ORAL',
            frequency: 'TID',
            durationDays: 7,
            quantity: 21,
          },
        ],
      };

      const mockPrescription = {
        id: 1,
        ...prescriptionData,
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      mockPrismaService.prescription.create.mockResolvedValue(mockPrescription);
      mockPrismaService.encounter.findUnique.mockResolvedValue({
        id: 100,
        patient: { id: 1, allergies: ['PENICILLIN'] },
      });

      const prescription = await pharmacyService.createPrescriptionForEncounter(prescriptionData);
      expect(prescription.status).toBe('ACTIVE');
      expect(mockCDSSService.checkDrugAllergy).toHaveBeenCalled();

      // 2. Check drug interactions
      mockCDSSService.checkDrugInteractions.mockResolvedValue([
        {
          severity: 'HIGH',
          description: 'تفاعل دوائي خطير',
          recommendation: 'مراجعة الطبيب',
        },
      ]);

      const interactions = await mockCDSSService.checkDrugInteractions([10, 11]);
      expect(interactions).toHaveLength(1);
      expect(interactions[0].severity).toBe('HIGH');

      // 3. Dispense medication
      const mockProductStock = {
        id: 1,
        productId: 10,
        quantity: { toNumber: () => 100 },
        batchNumber: 'BATCH001',
      };

      mockPrismaService.productStock.findFirst.mockResolvedValue(mockProductStock);
      mockPrismaService.productStock.update.mockResolvedValue({
        ...mockProductStock,
        quantity: { toNumber: () => 79 }, // 100 - 21
      });

      const dispenseData = {
        hospitalId: 1,
        prescriptionId: prescription.id,
        userId: 1,
        items: [
          {
            prescriptionItemId: 1,
            quantity: 21,
            batchNumber: 'BATCH001',
          },
        ],
      };

      mockPrismaService.dispenseRecord.create.mockResolvedValue({ id: 1 });
      mockPrismaService.stockTransaction.create.mockResolvedValue({ id: 1 });
      mockPrismaService.encounterCharge.create.mockResolvedValue({ id: 1 });

      const dispense = await pharmacyService.dispenseMedication(dispenseData);
      expect(dispense).toBeDefined();
      expect(mockAccountingService.postPharmacyDispenseEntry).toHaveBeenCalled();
    });

    it('should handle lab order to result workflow', async () => {
      // 1. Create lab order
      const labOrderData = {
        hospitalId: 1,
        encounterId: 100,
        patientId: 1,
        doctorId: 1,
        urgency: 'ROUTINE',
        tests: [
          {
            labTestId: 1,
            instructions: 'صائم 8 ساعات',
          },
        ],
      };

      const mockLabOrder = {
        id: 1,
        ...labOrderData,
        status: 'ORDERED',
        createdAt: new Date(),
      };

      mockPrismaService.labOrder.create.mockResolvedValue(mockLabOrder);
      const labOrder = await labService.createOrder(labOrderData);
      expect(labOrder.status).toBe('ORDERED');

      // 2. Process specimen
      const specimenData = {
        labOrderId: labOrder.id,
        collectedAt: new Date(),
        collectedBy: 1,
        specimenType: 'BLOOD',
      };

      const mockSpecimen = {
        id: 1,
        ...specimenData,
        status: 'RECEIVED',
      };

      mockPrismaService.labSpecimen.create.mockResolvedValue(mockSpecimen);
      const specimen = await labService.processSpecimen(specimenData);
      expect(specimen.status).toBe('RECEIVED');

      // 3. Add results
      const resultData = {
        labOrderId: labOrder.id,
        results: [
          {
            labTestId: 1,
            value: '95',
            unit: 'mg/dL',
            referenceRange: '70-100',
            status: 'NORMAL',
          },
        ],
        performedBy: 1,
        performedAt: new Date(),
      };

      const mockResult = {
        id: 1,
        ...resultData,
        status: 'COMPLETED',
      };

      mockPrismaService.labResult.create.mockResolvedValue(mockResult);
      mockPrismaService.labOrder.update.mockResolvedValue({
        ...mockLabOrder,
        status: 'COMPLETED',
      });

      const result = await labService.addResults(resultData);
      expect(result.status).toBe('COMPLETED');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('lab.results.completed', expect.any(Object));
    });

    it('should handle radiology study workflow', async () => {
      // 1. Schedule radiology study
      const studyData = {
        hospitalId: 1,
        encounterId: 100,
        patientId: 1,
        doctorId: 1,
        radiologyTestId: 1,
        scheduledDate: new Date('2024-01-15T10:00:00Z'),
        urgency: 'ROUTINE',
        contrastRequired: false,
      };

      const mockStudy = {
        id: 1,
        ...studyData,
        status: 'SCHEDULED',
        accessionNumber: 'RAD-2024-001',
      };

      mockPrismaService.radiologyStudy.create.mockResolvedValue(mockStudy);
      const study = await radiologyService.scheduleStudy(studyData);
      expect(study.accessionNumber).toBe('RAD-2024-001');

      // 2. Perform study
      const performData = {
        studyId: study.id,
        performedBy: 1,
        performedAt: new Date(),
        images: ['image1.dcm', 'image2.dcm'],
        contrastUsed: false,
        complications: null,
      };

      const mockPerformedStudy = {
        ...mockStudy,
        ...performData,
        status: 'PERFORMED',
      };

      mockPrismaService.radiologyStudy.update.mockResolvedValue(mockPerformedStudy);
      const performedStudy = await radiologyService.performStudy(performData);
      expect(performedStudy.status).toBe('PERFORMED');

      // 3. Add report
      const reportData = {
        studyId: study.id,
        findings: 'لا يوجد أي شواذات واضحة',
        impression: 'دراسة طبيعية',
        recommendation: 'متابعة روتينية',
        reportedBy: 1,
        reportedAt: new Date(),
      };

      const mockReport = {
        id: 1,
        ...reportData,
        status: 'REPORTED',
      };

      mockPrismaService.radiologyReport.create.mockResolvedValue(mockReport);
      mockPrismaService.radiologyStudy.update.mockResolvedValue({
        ...mockPerformedStudy,
        status: 'REPORTED',
      });

      const report = await radiologyService.addReport(reportData);
      expect(report.status).toBe('REPORTED');
      expect(report.findings).toBe('لا يوجد أي شواذات واضحة');
    });
  });

  describe('Cross-Service Integration', () => {
    it('should handle clinical decision support across services', async () => {
      const patientData = {
        id: 1,
        allergies: ['PENICILLIN'],
        conditions: ['DIABETES', 'HYPERTENSION'],
        medications: ['METFORMIN', 'LISINOPRIL'],
      };

      // Prescription with potential interactions
      const prescriptionItems = [
        { drugItemId: 10, name: 'Amoxicillin' },
        { drugItemId: 11, name: 'Ibuprofen' },
      ];

      // Check for allergies
      mockCDSSService.checkDrugAllergy.mockResolvedValue([
        {
          drugId: 10,
          allergy: 'PENICILLIN',
          severity: 'SEVERE',
          recommendation: 'لا تعطي هذا الدواء',
        },
      ]);

      // Check for drug interactions
      mockCDSSService.checkDrugInteractions.mockResolvedValue([
        {
          drug1: 10,
          drug2: 11,
          severity: 'MODERATE',
          description: 'زيادة خطر النزف',
          recommendation: 'مراقبة وظائف الكلى',
        },
      ]);

      // Check condition-drug interactions
      mockCDSSService.checkConditionDrugInteractions.mockResolvedValue([
        {
          condition: 'DIABETES',
          drugId: 11,
          severity: 'MILD',
          recommendation: 'مراقبة سكر الدم',
        },
      ]);

      const allergyCheck = await mockCDSSService.checkDrugAllergy(prescriptionItems, patientData.allergies);
      const interactionCheck = await mockCDSSService.checkDrugInteractions(prescriptionItems);
      const conditionCheck = await mockCDSSService.checkConditionDrugInteractions(prescriptionItems, patientData.conditions);

      expect(allergyCheck).toHaveLength(1);
      expect(allergyCheck[0].severity).toBe('SEVERE');
      expect(interactionCheck).toHaveLength(1);
      expect(conditionCheck).toHaveLength(1);

      // Create CDSS alerts
      const alerts = await mockCDSSService.createAlerts([
        ...allergyCheck,
        ...interactionCheck,
        ...conditionCheck,
      ]);

      expect(alerts).toHaveLength(3);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('cdss.alerts.created', alerts);
    });

    it('should handle emergency clinical workflow', async () => {
      // Emergency patient with critical lab values
      const emergencyLabOrder = {
        hospitalId: 1,
        encounterId: 200,
        urgency: 'STAT',
        tests: [
          { labTestId: 1, instructions: 'طوارئ' }, // CBC
          { labTestId: 2, instructions: 'طوارئ' }, // Electrolytes
        ],
      };

      mockPrismaService.labOrder.create.mockResolvedValue({
        id: 1,
        ...emergencyLabOrder,
        status: 'URGENT',
      });

      const urgentOrder = await labService.createOrder(emergencyLabOrder);
      expect(urgentOrder.urgency).toBe('STAT');

      // Critical lab results
      const criticalResults = {
        labOrderId: urgentOrder.id,
        results: [
          {
            labTestId: 1,
            value: '8.5', // Low hemoglobin
            unit: 'g/dL',
            referenceRange: '12-16',
            status: 'CRITICAL',
          },
        ],
        performedBy: 1,
        performedAt: new Date(),
      };

      mockPrismaService.labResult.create.mockResolvedValue({
        id: 1,
        ...criticalResults,
        status: 'CRITICAL',
      });

      const criticalResult = await labService.addResults(criticalResults);
      expect(criticalResult.status).toBe('CRITICAL');

      // Verify emergency notification
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('lab.critical.result', expect.any(Object));
    });
  });
});
