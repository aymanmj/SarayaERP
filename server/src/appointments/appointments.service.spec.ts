import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PriceListsService } from '../price-lists/price-lists.service';
import { AccountingService } from '../accounting/accounting.service';
import { createPrismaMock, mockAccountingService } from '../test-utils';
import { AppointmentStatus, EncounterStatus } from '@prisma/client';

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

  describe('queue and booking hardening', () => {
    let bookingService: AppointmentsService;
    let prisma: any;
    let priceService: { getServicePrice: jest.Mock };
    let accountingService: { validateDateInOpenPeriod: jest.Mock };

    beforeEach(async () => {
      prisma = {
        patient: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
        },
        user: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
        },
        doctorSchedule: {
          findUnique: jest.fn(),
        },
        appointment: {
          findMany: jest.fn(),
          count: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          findUnique: jest.fn(),
          updateMany: jest.fn(),
        },
        serviceItem: {
          findFirst: jest.fn(),
        },
        encounter: {
          create: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        encounterCharge: {
          create: jest.fn(),
          update: jest.fn(),
        },
        invoice: {
          create: jest.fn(),
          updateMany: jest.fn(),
          count: jest.fn(),
        },
        $transaction: jest.fn(async (fn: any) => fn(prisma)),
      };

      priceService = {
        getServicePrice: jest.fn().mockResolvedValue(120),
      };

      accountingService = {
        validateDateInOpenPeriod: jest.fn().mockResolvedValue({
          financialYear: { id: 1 },
          period: { id: 2 },
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AppointmentsService,
          { provide: PrismaService, useValue: prisma },
          { provide: PriceListsService, useValue: priceService },
          { provide: AccountingService, useValue: accountingService },
        ],
      }).compile();

      bookingService = module.get<AppointmentsService>(AppointmentsService);
    });

    it('allocates normal queue numbers away from reserved and used slots', async () => {
      prisma.doctorSchedule.findUnique.mockResolvedValue({
        doctorId: 9,
        reservedNumbers: '1,3,5',
      });
      prisma.appointment.findMany.mockResolvedValue([
        { queueNumber: 2 },
        { queueNumber: 4 },
      ]);

      const result = await bookingService.getNextQueueNumber(1, 9, new Date('2026-04-20T09:00:00Z'));

      expect(result).toBe(6);
    });

    it('allocates emergency queue numbers from reserved slots then extends odd numbers', async () => {
      prisma.doctorSchedule.findUnique.mockResolvedValue({
        doctorId: 9,
        reservedNumbers: '1,3,5,7,9',
      });
      prisma.appointment.findMany.mockResolvedValue([
        { queueNumber: 1 },
        { queueNumber: 3 },
        { queueNumber: 5 },
        { queueNumber: 7 },
        { queueNumber: 9 },
      ]);

      const result = await bookingService.getNextQueueNumber(1, 9, new Date('2026-04-20T09:00:00Z'), true);

      expect(result).toBe(11);
    });

    it('rejects normal bookings when non-emergency capacity is exhausted', async () => {
      prisma.doctorSchedule.findUnique.mockResolvedValue({
        doctorId: 5,
        maxPerDay: 5,
        reservedNumbers: '1,3,5',
        allowOverbook: false,
      });
      prisma.appointment.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2);

      const result = await bookingService.checkDailyLimit(
        1,
        5,
        new Date('2026-04-20T09:00:00Z'),
      );

      expect(result.allowed).toBe(false);
      expect(result.max).toBe(2);
    });

    it('creates insured online appointment with encounter, charge, and invoice', async () => {
      const scheduledStart = new Date('2026-04-20T09:00:00Z');
      const scheduledEnd = new Date('2026-04-20T09:30:00Z');

      prisma.patient.findFirst.mockResolvedValue({ id: 1, hospitalId: 1 });
      prisma.user.findFirst.mockResolvedValue({ id: 5, isDoctor: true });
      prisma.doctorSchedule.findUnique.mockResolvedValue({
        doctorId: 5,
        workDays: '0,1,2,3,4,5,6',
        maxPerDay: 20,
        reservedNumbers: '1,3,5',
        allowOverbook: false,
      });
      prisma.appointment.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.appointment.create.mockResolvedValue({ id: 50 });
      prisma.user.findUnique.mockResolvedValue({ id: 5, jobRank: 'CONSULTANT' });
      prisma.serviceItem.findFirst.mockResolvedValue({ id: 81, code: 'CONSULT-CONS' });
      prisma.encounter.create.mockResolvedValue({ id: 90 });
      prisma.patient.findUnique.mockResolvedValue({
        id: 1,
        insurancePolicy: {
          id: 12,
          isActive: true,
          patientCopayRate: 20,
          insuranceProviderId: 7,
        },
      });
      prisma.encounterCharge.create.mockResolvedValue({ id: 100 });
      prisma.invoice.create.mockResolvedValue({ id: 200 });
      prisma.appointment.findUnique.mockResolvedValue({
        id: 50,
        meetingLink: 'placeholder',
        encounter: { id: 90 },
      });

      const result = await bookingService.createAppointment({
        hospitalId: 1,
        patientId: 1,
        doctorId: 5,
        scheduledStart,
        scheduledEnd,
        createdByUserId: 9,
        type: 'ONLINE' as any,
        reason: 'Follow up',
      });

      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            queueNumber: 2,
            type: 'ONLINE',
            meetingLink: expect.stringContaining('https://meet.jit.si/Saraya-'),
          }),
        }),
      );
      expect(priceService.getServicePrice).toHaveBeenCalledWith(1, 81, 12);
      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 120,
            patientShare: 24,
            insuranceShare: 96,
            insuranceProviderId: 7,
          }),
        }),
      );
      expect(prisma.encounterCharge.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { invoiceId: 200 },
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe(50);
    });

    it('rejects manually assigned queue number when already reserved for the day', async () => {
      prisma.patient.findFirst.mockResolvedValue({ id: 1, hospitalId: 1 });
      prisma.user.findFirst.mockResolvedValue({ id: 5, isDoctor: true });
      prisma.doctorSchedule.findUnique.mockResolvedValue({
        doctorId: 5,
        workDays: '0,1,2,3,4,5,6',
        maxPerDay: 20,
        reservedNumbers: '1,3,5',
        allowOverbook: false,
      });
      prisma.appointment.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      prisma.appointment.findFirst.mockResolvedValue({ id: 999, queueNumber: 6 });

      await expect(
        bookingService.createAppointment({
          hospitalId: 1,
          patientId: 1,
          doctorId: 5,
          scheduledStart: new Date('2026-04-20T09:00:00Z'),
          scheduledEnd: new Date('2026-04-20T09:30:00Z'),
          createdByUserId: 9,
          queueNumber: 6,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('syncs appointment cancellation when billing cancellation event arrives', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 90,
        status: EncounterStatus.OPEN,
        appointments: [{ id: 50 }, { id: 51 }],
        invoices: [{ id: 200, status: 'CANCELLED', type: 'REGULAR' }],
      });
      prisma.encounter.update.mockResolvedValue({ id: 90, status: EncounterStatus.CANCELLED });
      prisma.appointment.updateMany.mockResolvedValue({ count: 2 });

      await bookingService.handleInvoiceCancellation({
        encounterId: 90,
        hospitalId: 1,
      });

      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: 90 },
        data: { status: EncounterStatus.CANCELLED },
      });
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [50, 51] } },
        data: { status: AppointmentStatus.CANCELLED },
      });
    });
  });
});
