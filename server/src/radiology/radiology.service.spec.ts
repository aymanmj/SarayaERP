import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RadiologyService } from './radiology.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { PriceListsService } from '../price-lists/price-lists.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RadiologyStatus, ServiceType } from '@prisma/client';

describe('RadiologyService', () => {
  let service: RadiologyService;
  let prisma: any;
  let accounting: any;
  let priceService: any;
  let eventEmitter: any;

  beforeEach(async () => {
    prisma = {
      encounter: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      radiologyStudy: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      radiologyOrder: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      order: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      encounterCharge: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      invoice: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    accounting = {
      validateDateInOpenPeriod: jest.fn().mockResolvedValue({
        financialYear: { id: 1 },
        period: { id: 2 },
      }),
    };

    priceService = {
      getServicePrice: jest.fn(),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RadiologyService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
        { provide: PriceListsService, useValue: priceService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<RadiologyService>(RadiologyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWorklist', () => {
    it('filters worklist to paid or waived orders and exposes PACS link', async () => {
      prisma.radiologyOrder.findMany.mockResolvedValue([
        {
          id: 1,
          status: 'PENDING',
          reportedAt: null,
          reportText: null,
          pacsUrl: 'https://pacs.example/study/1',
          order: {
            id: 10,
            status: 'NEW',
            createdAt: new Date(),
            encounterId: 100,
            encounter: {
              patient: { id: 1, fullName: 'Ahmed', mrn: 'MRN-1' },
            },
          },
          study: {
            id: 5,
            code: 'XR-CHEST',
            name: 'Chest X-Ray',
            modality: 'XR',
            bodyPart: 'CHEST',
          },
        },
      ]);

      const result = await service.getWorklist(1);

      expect(result[0].pacsUrl).toBe('https://pacs.example/study/1');
      expect(prisma.radiologyOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            order: expect.objectContaining({
              hospitalId: 1,
              paymentStatus: { in: ['PAID', 'WAIVED'] },
            }),
          }),
        }),
      );
    });
  });

  describe('listOrdersForEncounter', () => {
    it('rejects access when encounter belongs to another hospital', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 100,
        hospitalId: 2,
      });

      await expect(service.listOrdersForEncounter(100, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createOrdersForEncounter', () => {
    it('creates insured radiology invoice and links encounter charges', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 100,
        hospitalId: 1,
        patientId: 1,
        patient: {
          id: 1,
          fullName: 'Insured Patient',
          insurancePolicy: {
            id: 9,
            isActive: true,
            patientCopayRate: 25,
            insuranceProviderId: 5,
          },
        },
      });
      prisma.user.findUnique.mockResolvedValue({ id: 7, fullName: 'Dr. Ali' });
      prisma.radiologyStudy.findMany.mockResolvedValue([
        {
          id: 21,
          name: 'CT Brain',
          serviceItem: { id: 301, type: ServiceType.RADIOLOGY },
        },
        {
          id: 22,
          name: 'MRI Spine',
          serviceItem: { id: 302, type: ServiceType.RADIOLOGY },
        },
      ]);
      prisma.order.create
        .mockResolvedValueOnce({ id: 1001 })
        .mockResolvedValueOnce({ id: 1002 });
      prisma.radiologyOrder.create
        .mockResolvedValueOnce({ id: 501, orderId: 1001, studyId: 21 })
        .mockResolvedValueOnce({ id: 502, orderId: 1002, studyId: 22 });
      priceService.getServicePrice
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(120);
      prisma.encounterCharge.create
        .mockResolvedValueOnce({ id: 901 })
        .mockResolvedValueOnce({ id: 902 });
      prisma.invoice.create.mockResolvedValue({ id: 300 });

      const result = await service.createOrdersForEncounter({
        encounterId: 100,
        hospitalId: 1,
        doctorId: 7,
        studyIds: [21, 22],
        notes: 'radiology',
      });

      expect(result).toHaveLength(2);
      expect(prisma.invoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hospitalId: 1,
          patientId: 1,
          encounterId: 100,
          totalAmount: 200,
          patientShare: 50,
          insuranceShare: 150,
          insuranceProviderId: 5,
        }),
      });
      expect(prisma.encounterCharge.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [901, 902] } },
        data: { invoiceId: 300 },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'radiology.order_created',
        expect.any(Object),
      );
    });
  });

  describe('startProcessing', () => {
    it('moves radiology order to in-progress and emits event', async () => {
      prisma.radiologyOrder.findUnique.mockResolvedValue({
        id: 1,
        status: RadiologyStatus.PENDING,
        order: { hospitalId: 1 },
      });
      prisma.radiologyOrder.update.mockResolvedValue({
        id: 1,
        status: RadiologyStatus.IN_PROGRESS,
      });

      const result = await service.startProcessing(1, 1, 7);

      expect(result.status).toBe(RadiologyStatus.IN_PROGRESS);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'radiology.order_started',
        expect.any(Object),
      );
    });

    it('returns completed radiology order unchanged', async () => {
      const completedOrder = {
        id: 1,
        status: RadiologyStatus.COMPLETED,
        order: { hospitalId: 1 },
      };
      prisma.radiologyOrder.findUnique.mockResolvedValue(completedOrder);

      const result = await service.startProcessing(1, 1, 7);

      expect(result).toEqual(completedOrder);
      expect(prisma.radiologyOrder.update).not.toHaveBeenCalled();
    });
  });

  describe('completeOrderWithReport', () => {
    it('creates missing charge and completes the radiology order', async () => {
      prisma.radiologyOrder.findUnique.mockResolvedValue({
        id: 5,
        orderId: 20,
        studyId: 30,
        reportText: null,
      });
      prisma.order.findUnique.mockResolvedValue({
        id: 20,
        hospitalId: 1,
        encounterId: 100,
        encounter: {
          patient: {
            insurancePolicy: {
              id: 9,
              isActive: true,
            },
          },
        },
      });
      prisma.radiologyStudy.findUnique.mockResolvedValue({
        id: 30,
        serviceItem: { id: 400, type: ServiceType.RADIOLOGY },
      });
      prisma.encounterCharge.findFirst.mockResolvedValue(null);
      priceService.getServicePrice.mockResolvedValue(180);
      prisma.encounterCharge.create.mockResolvedValue({ id: 999 });
      prisma.radiologyOrder.update.mockResolvedValue({
        id: 5,
        status: RadiologyStatus.COMPLETED,
        reportText: 'Normal',
      });
      prisma.order.update.mockResolvedValue({ id: 20, status: 'COMPLETED' });

      const result = await service.completeOrderWithReport({
        hospitalId: 1,
        radiologyOrderId: 5,
        reportedById: 7,
        reportText: 'Normal',
      });

      expect(result.status).toBe(RadiologyStatus.COMPLETED);
      expect(prisma.encounterCharge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hospitalId: 1,
          encounterId: 100,
          serviceItemId: 400,
          sourceId: 5,
          totalAmount: 180,
          performerId: 7,
        }),
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });
    });

    it('rejects completion when radiology order is missing', async () => {
      prisma.radiologyOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.completeOrderWithReport({
          hospitalId: 1,
          radiologyOrderId: 404,
          reportedById: 7,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
