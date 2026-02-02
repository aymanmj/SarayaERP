import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock } from '../test-utils';
import { PatientsService } from '../patients/patients.service';
import { EncountersService } from '../encounters/encounters.service';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountingService } from '../accounting/accounting.service';
import { FinancialYearsService } from '../financial-years/financial-years.service';
import { InsuranceCalculationService } from '../insurance/insurance-calculation.service';

describe('Patient Journey Integration Tests', () => {
  let patientsService: PatientsService;
  let encountersService: EncountersService;
  let billingService: BillingService;
  let prismaService: PrismaService;

  // Comprehensive mock setup
  const mockPrismaService = createPrismaMock();
  const mockEventEmitter = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
  const mockAccountingService = {
    postBillingEntry: jest.fn(),
    createJournalEntry: jest.fn(),
    reverseJournalEntry: jest.fn(),
    getAccountBalance: jest.fn(),
  };
  const mockFinancialYearsService = {
    getCurrentPeriod: jest.fn().mockResolvedValue({
      id: 1,
      financialYearId: 1,
      isOpen: true,
    }),
  };
  const mockInsuranceCalcService = {
    calculateCoverage: jest.fn().mockResolvedValue({
      patientShare: { toNumber: () => 100 },
      insuranceShare: { toNumber: () => 0 },
      details: [],
    }),
    calculateInsuranceSplit: jest.fn().mockResolvedValue({
      patientShare: { toNumber: () => 100 },
      insuranceShare: { toNumber: () => 0 },
      details: [],
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        EncountersService,
        BillingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: FinancialYearsService, useValue: mockFinancialYearsService },
        { provide: InsuranceCalculationService, useValue: mockInsuranceCalcService },
      ],
    }).compile();

    patientsService = module.get<PatientsService>(PatientsService);
    encountersService = module.get<EncountersService>(EncountersService);
    billingService = module.get<BillingService>(BillingService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('Complete Patient Journey', () => {
    it('should handle patient registration to billing workflow', async () => {
      // 1. Patient Registration
      const patientData = {
        hospitalId: 1,
        fullName: 'أحمد محمد',
        mrn: 'MRN-001',
        phone: '0912345678',
        email: 'ahmed@example.com',
        dateOfBirth: new Date('1990-01-01'),
        gender: 'MALE',
      };

      const mockPatient = {
        id: 1,
        ...patientData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.patient.create.mockResolvedValue(mockPatient);
      const patient = await patientsService.create(patientData);

      expect(patient).toBeDefined();
      expect(patient.fullName).toBe('أحمد محمد');

      // 2. Encounter Creation
      const encounterData = {
        hospitalId: 1,
        patientId: patient.id,
        type: 'OUTPATIENT',
        departmentId: 1,
        doctorId: 1,
      };

      const mockEncounter = {
        id: 100,
        ...encounterData,
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.encounter.create.mockResolvedValue(mockEncounter);
      const encounter = await encountersService.create(encounterData);

      expect(encounter).toBeDefined();
      expect(encounter.patientId).toBe(patient.id);

      // 3. Service Charges
      const mockCharges = [
        {
          id: 1,
          hospitalId: 1,
          encounterId: encounter.id,
          serviceItemId: 1,
          quantity: 1,
          unitPrice: { toNumber: () => 50 },
          totalAmount: { toNumber: () => 50 },
          serviceItem: { name: 'استشارة طبية', type: 'CONSULTATION' },
        },
      ];

      mockPrismaService.encounterCharge.findMany.mockResolvedValue(mockCharges);
      mockPrismaService.encounter.findFirst.mockResolvedValue(mockEncounter);

      // 4. Billing
      const billingData = await billingService.getEncounterBilling(encounter.id, 1);

      expect(billingData).toBeDefined();
      expect(billingData.encounter.id).toBe(encounter.id);
      expect(billingData.charges).toHaveLength(1);

      // 5. Invoice Creation
      const mockInvoice = {
        id: 1,
        hospitalId: 1,
        patientId: patient.id,
        encounterId: encounter.id,
        totalAmount: { toNumber: () => 50 },
        status: 'DRAFT',
      };

      mockPrismaService.invoice.create.mockResolvedValue(mockInvoice);
      mockPrismaService.encounterCharge.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        charges: mockCharges,
        patient: mockPatient,
      });

      const invoice = await billingService.createInvoiceForEncounter(
        encounter.id,
        1,
        1
      );

      expect(invoice).toBeDefined();
      expect(invoice.id).toBe(1);
      expect(invoice.totalAmount.toNumber()).toBe(50);

      // Verify workflow integration
      expect(mockPrismaService.patient.create).toHaveBeenCalled();
      expect(mockPrismaService.encounter.create).toHaveBeenCalled();
      expect(mockPrismaService.invoice.create).toHaveBeenCalled();
      expect(mockAccountingService.postBillingEntry).toHaveBeenCalled();
    });

    it('should handle emergency patient workflow', async () => {
      // Emergency patient workflow with triage
      const emergencyPatient = {
        hospitalId: 1,
        fullName: 'مريض طارئ',
        mrn: 'EMERGENCY-001',
        phone: '0998765432',
        isEmergency: true,
      };

      const mockEmergencyPatient = {
        id: 2,
        ...emergencyPatient,
        createdAt: new Date(),
      };

      mockPrismaService.patient.create.mockResolvedValue(mockEmergencyPatient);

      const patient = await patientsService.create(emergencyPatient);
      expect(patient.isEmergency).toBe(true);

      // Emergency encounter
      const emergencyEncounter = {
        hospitalId: 1,
        patientId: patient.id,
        type: 'EMERGENCY',
        departmentId: 2, // Emergency department
        priority: 'HIGH',
      };

      const mockEmergencyEncounter = {
        id: 200,
        ...emergencyEncounter,
        status: 'OPEN',
        triageLevel: 'RED',
      };

      mockPrismaService.encounter.create.mockResolvedValue(mockEmergencyEncounter);
      const encounter = await encountersService.create(emergencyEncounter);

      expect(encounter.type).toBe('EMERGENCY');
      expect(encounter.priority).toBe('HIGH');
    });

    it('should handle patient discharge and final billing', async () => {
      // Setup existing encounter
      const mockEncounter = {
        id: 300,
        hospitalId: 1,
        patientId: 3,
        status: 'OPEN',
        type: 'INPATIENT',
        admissionDate: new Date('2024-01-01'),
      };

      // Discharge process
      const dischargeData = {
        dischargeDate: new Date('2024-01-05'),
        dischargeType: 'HOME',
        summary: 'تم تحسن الحالة',
      };

      const mockDischargedEncounter = {
        ...mockEncounter,
        ...dischargeData,
        status: 'DISCHARGED',
      };

      mockPrismaService.encounter.update.mockResolvedValue(mockDischargedEncounter);
      const dischargedEncounter = await encountersService.discharge(
        mockEncounter.id,
        dischargeData
      );

      expect(dischargedEncounter.status).toBe('DISCHARGED');
      expect(dischargedEncounter.dischargeType).toBe('HOME');

      // Final billing
      const finalCharges = [
        {
          id: 1,
          totalAmount: { toNumber: () => 1000 },
          serviceItem: { name: 'إقامة مستشفى', type: 'ACCOMMODATION' },
        },
        {
          id: 2,
          totalAmount: { toNumber: () => 500 },
          serviceItem: { name: 'عمليات جراحية', type: 'PROCEDURE' },
        },
      ];

      mockPrismaService.encounterCharge.findMany.mockResolvedValue(finalCharges);
      mockPrismaService.encounter.findFirst.mockResolvedValue(mockDischargedEncounter);

      const finalBilling = await billingService.getEncounterBilling(
        mockEncounter.id,
        1
      );

      expect(finalBilling.charges).toHaveLength(2);
      expect(finalBilling.charges.reduce((sum, charge) => 
        sum + charge.totalAmount.toNumber(), 0
      )).toBe(1500);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle patient not found in encounter creation', async () => {
      const encounterData = {
        hospitalId: 1,
        patientId: 999, // Non-existent patient
        type: 'OUTPATIENT',
      };

      mockPrismaService.patient.findUnique.mockResolvedValue(null);

      await expect(encountersService.create(encounterData))
        .rejects.toThrow('Patient not found');
    });

    it('should handle billing for encounter with no charges', async () => {
      const mockEncounter = {
        id: 400,
        hospitalId: 1,
        patientId: 4,
        status: 'OPEN',
      };

      mockPrismaService.encounter.findFirst.mockResolvedValue(mockEncounter);
      mockPrismaService.encounterCharge.findMany.mockResolvedValue([]);

      await expect(
        billingService.createInvoiceForEncounter(mockEncounter.id, 1, 1)
      ).rejects.toThrow('No charges found');
    });

    it('should handle duplicate MRN registration', async () => {
      const patientData = {
        hospitalId: 1,
        fullName: 'محمد أحمد',
        mrn: 'MRN-001', // Duplicate MRN
      };

      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 1 }); // Existing patient

      await expect(patientsService.create(patientData))
        .rejects.toThrow('MRN already exists');
    });
  });
});
