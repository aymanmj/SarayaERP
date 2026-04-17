/**
 * FHIR Service — Enterprise Unit Tests
 *
 * Tests the core FHIR R4 resource service:
 * - Patient context isolation (SMART on FHIR)
 * - FHIR resource mapping (Patient, Observation, Encounter)
 * - Blood Pressure LOINC component parsing (8480-6 / 8462-4)
 * - Observation write with encounter validation
 * - Capability Statement structure
 * - Gender mapping
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { FhirService } from './fhir.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('FhirService', () => {
  let service: FhirService;
  let prisma: any;

  const mockPrisma = () => {
    const mock: any = {
      patient: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      hospital: {
        findUnique: jest.fn(),
      },
      encounter: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      vitalSign: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      patientProblem: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      patientAllergy: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      prescription: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      prescriptionItem: {
        findMany: jest.fn(),
      },
      fhirSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn: any) => {
        if (Array.isArray(fn)) return Promise.all(fn);
        return fn(mock);
      }),
    };
    return mock;
  };

  beforeEach(async () => {
    const prismaMock = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FhirService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<FhirService>(FhirService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  //  CAPABILITY STATEMENT
  // ===========================================
  describe('getCapabilityStatement', () => {
    it('should return valid FHIR CapabilityStatement', () => {
      const result = service.getCapabilityStatement();

      expect(result.resourceType).toBe('CapabilityStatement');
      expect(result.fhirVersion).toBe('4.0.1');
      expect(result.status).toBe('active');
      expect(result.rest).toHaveLength(1);
      expect(result.rest[0].mode).toBe('server');
      expect(result.format).toContain('application/fhir+json');
    });

    it('should include SMART-on-FHIR security service', () => {
      const result = service.getCapabilityStatement();
      const securityService = result.rest[0].security.service[0].coding[0];

      expect(securityService.code).toBe('SMART-on-FHIR');
    });
  });

  // ===========================================
  //  PATIENT RESOURCE
  // ===========================================
  describe('getPatient', () => {
    const mockPatient = {
      id: 1,
      fullName: 'أحمد محمد الغرياني',
      mrn: 'MRN-0001',
      nationalId: '119820012345',
      gender: 'MALE',
      dateOfBirth: new Date('1982-05-15'),
      phone: '0912345678',
      email: 'ahmed@example.com',
      address: 'طرابلس, ليبيا',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return valid FHIR Patient resource', async () => {
      prisma.patient.findUnique.mockResolvedValue(mockPatient);

      const result = await service.getPatient(1);

      expect(result.resourceType).toBe('Patient');
      expect(result.id).toBe('1');
      expect(result.active).toBe(true);
      expect(result.identifier).toHaveLength(2); // MRN + National ID
      expect(result.identifier[0].value).toBe('MRN-0001');
      expect(result.name[0].text).toBe('أحمد محمد الغرياني');
      expect(result.gender).toBe('male');
      expect(result.birthDate).toBe('1982-05-15');
    });

    it('should throw NotFoundException for unknown patient', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.getPatient(999)).rejects.toThrow(NotFoundException);
    });

    it('should map gender correctly', async () => {
      // MALE → male
      prisma.patient.findUnique.mockResolvedValue({ ...mockPatient, gender: 'MALE' });
      let result = await service.getPatient(1);
      expect(result.gender).toBe('male');

      // FEMALE → female
      prisma.patient.findUnique.mockResolvedValue({ ...mockPatient, gender: 'FEMALE' });
      result = await service.getPatient(1);
      expect(result.gender).toBe('female');

      // null → unknown
      prisma.patient.findUnique.mockResolvedValue({ ...mockPatient, gender: null });
      result = await service.getPatient(1);
      expect(result.gender).toBe('unknown');
    });
  });

  // ===========================================
  //  PATIENT CONTEXT ISOLATION (SMART)
  // ===========================================
  describe('Patient Context Isolation', () => {
    it('should allow access when token patient matches encounter patient', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        patientId: 1,
        status: 'OPEN',
        type: 'OPD',
        createdAt: new Date(),
      });

      const result = await service.getEncounter(10, 1); // patientContext = 1
      expect(result.resourceType).toBe('Encounter');
    });

    it('should DENY access when token patient does NOT match encounter patient', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        patientId: 1, // Belongs to patient 1
        status: 'OPEN',
        type: 'OPD',
        createdAt: new Date(),
      });

      await expect(
        service.getEncounter(10, 999), // Token scoped to patient 999
      ).rejects.toThrow(ForbiddenException);
    });

    it('should DENY observation access for wrong patient', async () => {
      prisma.vitalSign.findUnique.mockResolvedValue({
        id: 1,
        encounter: { patientId: 1 }, // Belongs to patient 1
        createdAt: new Date(),
      });

      await expect(
        service.getObservation(1, 999), // Token scoped to patient 999
      ).rejects.toThrow(ForbiddenException);
    });

    it('should DENY condition access for wrong patient', async () => {
      prisma.patientProblem.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        description: 'Diabetes',
        createdAt: new Date(),
      });

      await expect(
        service.getCondition(1, 999),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should DENY allergy access for wrong patient', async () => {
      prisma.patientAllergy.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        allergen: 'Penicillin',
        severity: 'SEVERE',
      });

      await expect(
        service.getAllergy(1, 999),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================
  //  OBSERVATION WRITE (POST)
  // ===========================================
  describe('createObservation', () => {
    const bpObservation = {
      resourceType: 'Observation',
      status: 'final',
      subject: { reference: 'Patient/1' },
      component: [
        {
          code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
          valueQuantity: { value: 120, unit: 'mmHg' },
        },
        {
          code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] },
          valueQuantity: { value: 80, unit: 'mmHg' },
        },
        {
          code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
          valueQuantity: { value: 72, unit: 'beats/min' },
        },
        {
          code: { coding: [{ system: 'http://loinc.org', code: '2708-6' }] },
          valueQuantity: { value: 98, unit: '%' },
        },
      ],
    };

    beforeEach(() => {
      prisma.encounter.findFirst.mockResolvedValue({
        id: 10,
        patientId: 1,
        status: 'OPEN',
      });

      prisma.vitalSign.create.mockImplementation((args: any) => ({
        id: 1,
        ...args.data,
        createdAt: new Date(),
        encounter: { id: 10, patientId: 1 },
      }));

      prisma.fhirSubscription.findMany.mockResolvedValue([]);
    });

    it('should parse BP components (8480-6 systolic, 8462-4 diastolic)', async () => {
      await service.createObservation(bpObservation);

      expect(prisma.vitalSign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bpSystolic: 120,
            bpDiastolic: 80,
            pulse: 72,
            o2Sat: 98,
          }),
        }),
      );
    });

    it('should DENY cross-patient writes', async () => {
      await expect(
        service.createObservation(bpObservation, 999), // Token scoped to patient 999
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject Observation without active encounter', async () => {
      prisma.encounter.findFirst.mockResolvedValue(null);

      await expect(
        service.createObservation(bpObservation),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid resourceType', async () => {
      await expect(
        service.createObservation({ ...bpObservation, resourceType: 'Patient' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject Observation without subject reference', async () => {
      await expect(
        service.createObservation({ ...bpObservation, subject: {} }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================
  //  OBSERVATION MAPPING
  // ===========================================
  describe('Observation resource mapping', () => {
    it('should include LOINC codes for vital sign components', async () => {
      prisma.vitalSign.findUnique.mockResolvedValue({
        id: 1,
        pulse: 72,
        respRate: 18,
        temperature: 37.2,
        o2Sat: 98,
        bpSystolic: 120,
        bpDiastolic: 80,
        encounterId: 10,
        encounter: { patientId: 1 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getObservation(1);

      expect(result.resourceType).toBe('Observation');
      expect(result.status).toBe('final');
      expect(result.component).toBeDefined();
      expect(result.component).toHaveLength(6); // pulse + resp + temp + o2 + sys + dia

      // Verify LOINC codes
      const codes = result.component!.map((c: any) => c.code.coding[0].code);
      expect(codes).toContain('8867-4');  // Heart rate
      expect(codes).toContain('9279-1');  // Respiratory rate
      expect(codes).toContain('8310-5');  // Body temperature
      expect(codes).toContain('2708-6');  // SpO2
      expect(codes).toContain('8480-6');  // Systolic BP
      expect(codes).toContain('8462-4');  // Diastolic BP
    });
  });

  // ===========================================
  //  ENCOUNTER MAPPING
  // ===========================================
  describe('Encounter resource mapping', () => {
    it('should map encounter type to HL7 ActCode', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        patientId: 1,
        status: 'OPEN',
        type: 'ER',
        createdAt: new Date(),
      });

      const result = await service.getEncounter(10);
      expect(result.class.code).toBe('EMER'); // ER → EMER

      prisma.encounter.findUnique.mockResolvedValue({
        id: 11,
        patientId: 1,
        status: 'OPEN',
        type: 'IPD',
        createdAt: new Date(),
      });

      const result2 = await service.getEncounter(11);
      expect(result2.class.code).toBe('IMP'); // IPD → IMP
    });

    it('should map encounter status correctly', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        patientId: 1,
        status: 'OPEN',
        type: 'OPD',
        createdAt: new Date(),
      });

      const result = await service.getEncounter(10);
      expect(result.status).toBe('in-progress');
    });
  });
});
