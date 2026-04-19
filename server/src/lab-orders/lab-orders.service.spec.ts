import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LabOrdersService } from './lab-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';

describe('LabOrdersService', () => {
  let service: LabOrdersService;
  let prisma: any;
  let accounting: any;

  beforeEach(async () => {
    prisma = {
      encounter: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      labTest: {
        findMany: jest.fn(),
      },
      patient: {
        findUnique: jest.fn(),
      },
      order: {
        create: jest.fn(),
      },
      labOrder: {
        findMany: jest.fn(),
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

    accounting = {
      validateDateInOpenPeriod: jest.fn().mockResolvedValue({
        financialYear: { id: 1 },
        period: { id: 2 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabOrdersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: AccountingService,
          useValue: accounting,
        },
      ],
    }).compile();

    service = module.get<LabOrdersService>(LabOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listForEncounter', () => {
    it('lists lab orders for encounter in descending order creation time', async () => {
      prisma.labOrder.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await service.listForEncounter(10);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      expect(prisma.labOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            order: {
              encounterId: 10,
              type: 'LAB',
              isDeleted: false,
            },
          },
        }),
      );
    });
  });

  describe('createForEncounter', () => {
    it('rejects empty test selection', async () => {
      await expect(
        service.createForEncounter({
          encounterId: 10,
          hospitalId: 1,
          doctorId: 5,
          testIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects missing encounter or deleted encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(
        service.createForEncounter({
          encounterId: 10,
          hospitalId: 1,
          doctorId: 5,
          testIds: [1],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects doctor from another hospital', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        patientId: 2,
        isDeleted: false,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 5,
        isActive: true,
        hospitalId: 99,
      });

      await expect(
        service.createForEncounter({
          encounterId: 10,
          hospitalId: 1,
          doctorId: 5,
          testIds: [1],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates lab orders, charges, and insured invoice for the encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        patientId: 2,
        isDeleted: false,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 5,
        isActive: true,
        hospitalId: 1,
      });
      prisma.labTest.findMany.mockResolvedValue([
        {
          id: 1,
          serviceItemId: 101,
          serviceItem: { id: 101, defaultPrice: 20 },
        },
        {
          id: 2,
          serviceItemId: 102,
          serviceItem: { id: 102, defaultPrice: 30 },
        },
      ]);
      prisma.order.create
        .mockResolvedValueOnce({ id: 11 })
        .mockResolvedValueOnce({ id: 12 });
      prisma.labOrder.create
        .mockResolvedValueOnce({ id: 21, order: { id: 11 }, test: { id: 1 } })
        .mockResolvedValueOnce({ id: 22, order: { id: 12 }, test: { id: 2 } });
      prisma.encounterCharge.create
        .mockResolvedValueOnce({ id: 31 })
        .mockResolvedValueOnce({ id: 32 });
      prisma.patient.findUnique.mockResolvedValue({
        id: 2,
        insurancePolicy: {
          isActive: true,
          patientCopayRate: 10,
          insuranceProviderId: 7,
        },
      });
      prisma.invoice.create.mockResolvedValue({ id: 41 });

      const result = await service.createForEncounter({
        encounterId: 10,
        hospitalId: 1,
        doctorId: 5,
        testIds: [1, 2],
        notes: 'urgent',
      });

      expect(result).toHaveLength(2);
      expect(prisma.invoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hospitalId: 1,
          patientId: 2,
          encounterId: 10,
          totalAmount: 50,
          patientShare: 5,
          insuranceShare: 45,
          insuranceProviderId: 7,
        }),
      });
      expect(prisma.encounterCharge.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [31, 32] } },
        data: { invoiceId: 41 },
      });
    });
  });

  describe('getWorklist', () => {
    it('filters worklist to paid or waived lab orders and maps patient data', async () => {
      prisma.labOrder.findMany.mockResolvedValue([
        {
          id: 1,
          resultStatus: 'PENDING',
          resultValue: null,
          test: { name: 'CBC' },
          order: {
            id: 11,
            status: 'NEW',
            createdAt: new Date(),
            encounterId: 10,
            encounter: {
              patient: { id: 2, fullName: 'Ahmed', mrn: 'MRN-0001' },
            },
            orderedBy: { id: 5, fullName: 'Dr. Ali' },
          },
        },
      ]);

      const result = await service.getWorklist(1);

      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 1,
          testName: 'CBC',
          orderedBy: 'Dr. Ali',
          patient: { id: 2, fullName: 'Ahmed', mrn: 'MRN-0001' },
        }),
      );
      expect(prisma.labOrder.findMany).toHaveBeenCalledWith(
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
});
