import { Test, TestingModule } from '@nestjs/testing';
import { PharmacyService } from '../pharmacy/pharmacy.service';
import { LabService } from '../labs/labs.service';
import { RadiologyService } from '../radiology/radiology.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountingService } from '../accounting/accounting.service';
import { CDSSService } from '../cdss/cdss.service';
import { PriceListsService } from '../price-lists/price-lists.service';

describe('Clinical Services Integration Tests', () => {
  let pharmacyService: PharmacyService;
  let labService: LabService;
  let radiologyService: RadiologyService;
  let prisma: any;
  let eventEmitter: any;

  const accountingService = {
    validateDateInOpenPeriod: jest.fn().mockResolvedValue({
      financialYear: { id: 1 },
      period: { id: 2 },
    }),
    recordInvoiceEntry: jest.fn(),
    recordPaymentEntry: jest.fn(),
  };

  const cdssService = {
    checkDrugInteractions: jest.fn().mockResolvedValue([]),
  };

  const priceListsService = {
    getServicePrice: jest.fn().mockResolvedValue(60),
  };

  beforeEach(async () => {
    prisma = {
      encounter: {
        findUnique: jest.fn(),
      },
      patient: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 7, fullName: 'Dr. Ali' }),
      },
      product: {
        findMany: jest.fn(),
      },
      prescription: {
        create: jest.fn(),
      },
      prescriptionItem: {
        create: jest.fn(),
      },
      labTest: {
        findMany: jest.fn(),
      },
      order: {
        create: jest.fn(),
      },
      labOrder: {
        create: jest.fn(),
      },
      radiologyStudy: {
        findMany: jest.fn(),
      },
      radiologyOrder: {
        create: jest.fn(),
      },
      encounterCharge: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      invoice: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PharmacyService,
        LabService,
        RadiologyService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: AccountingService, useValue: accountingService },
        { provide: CDSSService, useValue: cdssService },
        { provide: PriceListsService, useValue: priceListsService },
      ],
    }).compile();

    pharmacyService = module.get<PharmacyService>(PharmacyService);
    labService = module.get<LabService>(LabService);
    radiologyService = module.get<RadiologyService>(RadiologyService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(pharmacyService).toBeDefined();
    expect(labService).toBeDefined();
    expect(radiologyService).toBeDefined();
  });

  it('creates pharmacy, lab, and radiology clinical orders on the same encounter context', async () => {
    prisma.encounter.findUnique.mockResolvedValue({
      id: 100,
      hospitalId: 1,
      patientId: 2,
      patient: {
        id: 2,
        fullName: 'Ahmed',
        insurancePolicy: null,
        allergies: [],
      },
    });
    prisma.product.findMany.mockResolvedValue([
      { id: 50, name: 'Paracetamol', genericName: 'acetaminophen' },
    ]);
    prisma.prescription.create.mockResolvedValue({ id: 201 });
    prisma.prescriptionItem.create.mockResolvedValue({ id: 202 });

    prisma.labTest.findMany.mockResolvedValue([
      {
        id: 10,
        name: 'CBC',
        serviceItem: { id: 301, defaultPrice: 60 },
      },
    ]);
    prisma.order.create
      .mockResolvedValueOnce({ id: 401, hospitalId: 1, encounterId: 100 })
      .mockResolvedValueOnce({ id: 402, hospitalId: 1, encounterId: 100 });
    prisma.labOrder.create.mockResolvedValue({
      id: 501,
      orderId: 401,
      test: { id: 10, name: 'CBC' },
    });

    prisma.radiologyStudy.findMany.mockResolvedValue([
      {
        id: 20,
        name: 'Chest X-Ray',
        serviceItem: { id: 302, defaultPrice: 60 },
      },
    ]);
    prisma.radiologyOrder.create.mockResolvedValue({
      id: 601,
      orderId: 402,
      studyId: 20,
    });

    prisma.encounterCharge.create
      .mockResolvedValueOnce({ id: 701 })
      .mockResolvedValueOnce({ id: 702 });
    prisma.invoice.create
      .mockResolvedValueOnce({ id: 801 })
      .mockResolvedValueOnce({ id: 802 });

    const prescription = await pharmacyService.createPrescriptionForEncounter({
      hospitalId: 1,
      encounterId: 100,
      doctorId: 7,
      items: [
        {
          drugItemId: 50,
          dose: '500mg',
          route: 'ORAL',
          frequency: 'TID',
          durationDays: 5,
          quantity: 15,
        },
      ],
    });
    const labOrders = await labService.createOrdersForEncounter({
      encounterId: 100,
      hospitalId: 1,
      doctorId: 7,
      testIds: [10],
    });
    const radiologyOrders = await radiologyService.createOrdersForEncounter({
      encounterId: 100,
      hospitalId: 1,
      doctorId: 7,
      studyIds: [20],
    });

    expect(prescription.id).toBe(201);
    expect(labOrders).toHaveLength(1);
    expect(radiologyOrders).toHaveLength(1);
    expect(prisma.invoice.create).toHaveBeenCalledTimes(2);
    expect(prisma.encounterCharge.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: [701] } },
      data: { invoiceId: 801 },
    });
    expect(prisma.encounterCharge.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: [702] } },
      data: { invoiceId: 802 },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'lab.order_created',
      expect.any(Object),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'radiology.order_created',
      expect.any(Object),
    );
  });
});
