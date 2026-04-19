import { Test, TestingModule } from '@nestjs/testing';
import { PatientsService } from '../patients/patients.service';
import { EncountersService } from '../encounters/encounters.service';
import { VisitsService } from '../visits/visits.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { SoftDeleteService } from '../common/soft-delete.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { PriceListsService } from '../price-lists/price-lists.service';

describe('Patient Journey Integration Tests', () => {
  let patientsService: PatientsService;
  let encountersService: EncountersService;
  let visitsService: VisitsService;
  let prisma: any;

  const mockSoftDeleteService = {
    softDelete: jest.fn(),
  };

  const mockSystemSettings = {
    get: jest.fn(),
    getNumber: jest.fn().mockResolvedValue(0.01),
  };

  const mockPriceService = {
    getServicePrice: jest.fn().mockResolvedValue(75),
  };

  const mockAccountingService = {
    validateDateInOpenPeriod: jest.fn().mockResolvedValue({
      financialYear: { id: 1 },
      period: { id: 2 },
    }),
  };

  beforeEach(async () => {
    prisma = {
      patient: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      encounter: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      serviceItem: {
        findFirst: jest.fn(),
      },
      encounterCharge: {
        create: jest.fn(),
        update: jest.fn(),
      },
      invoice: {
        create: jest.fn(),
      },
      visit: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        EncountersService,
        VisitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: SoftDeleteService, useValue: mockSoftDeleteService },
        { provide: SystemSettingsService, useValue: mockSystemSettings },
        { provide: PriceListsService, useValue: mockPriceService },
      ],
    }).compile();

    patientsService = module.get<PatientsService>(PatientsService);
    encountersService = module.get<EncountersService>(EncountersService);
    visitsService = module.get<VisitsService>(VisitsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(patientsService).toBeDefined();
    expect(encountersService).toBeDefined();
    expect(visitsService).toBeDefined();
  });

  it('creates a patient, opens an ER encounter with billing, then records a visit', async () => {
    prisma.patient.findFirst
      .mockResolvedValueOnce({ mrn: 'MRN-0007' })
      .mockResolvedValueOnce(null);
    prisma.patient.create.mockResolvedValue({
      id: 15,
      mrn: 'MRN-0008',
      fullName: 'Ahmed Ali',
      hospitalId: 1,
    });
    prisma.patient.findUnique.mockResolvedValue({
      id: 15,
      hospitalId: 1,
      insurancePolicy: null,
    });
    prisma.encounter.findFirst.mockResolvedValue(null);
    prisma.encounter.create.mockResolvedValue({
      id: 200,
      patientId: 15,
      hospitalId: 1,
      type: 'ER',
      status: 'OPEN',
    });
    prisma.serviceItem.findFirst.mockResolvedValue({
      id: 90,
      code: 'ER-VISIT',
      isActive: true,
    });
    prisma.encounterCharge.create.mockResolvedValue({ id: 300 });
    prisma.invoice.create.mockResolvedValue({ id: 400 });
    prisma.encounter.findUnique
      .mockResolvedValueOnce({
        id: 200,
        patientId: 15,
        hospitalId: 1,
        type: 'ER',
        status: 'OPEN',
        patient: { fullName: 'Ahmed Ali', mrn: 'MRN-0008' },
        doctor: null,
        department: null,
      })
      .mockResolvedValueOnce({
        id: 200,
        status: 'OPEN',
      });
    prisma.visit.create.mockResolvedValue({
      id: 500,
      encounterId: 200,
      doctorId: 5,
      notes: 'Initial ER assessment',
    });

    const patient = await patientsService.create(
      1,
      { fullName: 'Ahmed Ali' } as any,
    );
    const encounter = await encountersService.createEncounter(1, {
      patientId: patient.id,
      type: 'ER' as any,
      doctorId: 5,
      chiefComplaint: 'Chest pain',
    });
    const visit = await visitsService.createVisit({
      encounterId: encounter.id,
      doctorId: 5,
      notes: 'Initial ER assessment',
    });

    expect(patient.mrn).toBe('MRN-0008');
    expect(prisma.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hospitalId: 1,
        patientId: 15,
        encounterId: 200,
        totalAmount: 75,
      }),
    });
    expect(prisma.visit.create).toHaveBeenCalledWith({
      data: {
        encounterId: 200,
        doctorId: 5,
        notes: 'Initial ER assessment',
        diagnosisText: null,
      },
    });
    expect(visit.id).toBe(500);
  });
});
