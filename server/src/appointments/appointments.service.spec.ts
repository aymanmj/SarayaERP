import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PriceListsService } from '../price-lists/price-lists.service';
import { AccountingService } from '../accounting/accounting.service';
import { createPrismaMock, mockAccountingService } from '../test-utils';

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: AccountingService, useValue: mockAccountingService },
        {
          provide: PriceListsService,
          useValue: {
            getPriceForService: jest.fn(),
            getPriceForProduct: jest.fn(),
            createPriceList: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cancelPatientAppointmentWithBillingCleanup', () => {
    let cancelService: AppointmentsService;
    let prisma: any;

    beforeEach(async () => {
      prisma = createPrismaMock();
      prisma.appointment.findUnique = jest.fn();
      prisma.encounter.findUnique = jest.fn();
      prisma.invoice.count = jest.fn();
      prisma.invoice.updateMany = jest.fn();
      prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AppointmentsService,
          { provide: PrismaService, useValue: prisma },
          { provide: AccountingService, useValue: mockAccountingService },
          {
            provide: PriceListsService,
            useValue: {
              getPriceForService: jest.fn(),
              getPriceForProduct: jest.fn(),
              createPriceList: jest.fn(),
            },
          },
        ],
      }).compile();

      cancelService = module.get<AppointmentsService>(AppointmentsService);
    });

    it('throws NotFound when appointment does not exist', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(
        cancelService.cancelPatientAppointmentWithBillingCleanup(1, 99),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when patientId does not match', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 2,
        encounterId: null,
      });

      await expect(
        cancelService.cancelPatientAppointmentWithBillingCleanup(1, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('cancels appointment when there is no encounter', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        encounterId: null,
      });
      prisma.appointment.update = jest
        .fn()
        .mockResolvedValue({ id: 1, status: 'CANCELLED' });

      const result =
        await cancelService.cancelPatientAppointmentWithBillingCleanup(1, 1);

      expect(result.status).toBe('CANCELLED');
      expect(prisma.invoice.count).not.toHaveBeenCalled();
    });

    it('throws when linked encounter is not OPEN', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        encounterId: 10,
      });
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        status: 'CLOSED',
      });

      await expect(
        cancelService.cancelPatientAppointmentWithBillingCleanup(1, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when encounter has paid invoices', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        encounterId: 10,
      });
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        status: 'OPEN',
      });
      prisma.invoice.count.mockResolvedValue(1);

      await expect(
        cancelService.cancelPatientAppointmentWithBillingCleanup(1, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('cancels OPEN encounter and unpaid invoices in transaction', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        encounterId: 10,
      });
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        status: 'OPEN',
      });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.encounter.update = jest.fn();
      prisma.appointment.update = jest
        .fn()
        .mockResolvedValue({ id: 1, status: 'CANCELLED' });

      await cancelService.cancelPatientAppointmentWithBillingCleanup(1, 1);

      expect(prisma.encounter.update).toHaveBeenCalled();
      expect(prisma.invoice.updateMany).toHaveBeenCalled();
    });
  });
});
