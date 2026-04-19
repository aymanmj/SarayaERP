import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { PdfService } from '../pdf/pdf.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  let appointmentsService: any;
  let pdfService: any;
  let prisma: any;

  const adminUser = { sub: 10, hospitalId: 1, roles: ['ADMIN'] };
  const doctorUser = { sub: 22, hospitalId: 1, roles: ['DOCTOR'] };

  beforeEach(async () => {
    appointmentsService = {
      createAppointment: jest.fn(),
      listAppointmentsForDay: jest.fn(),
      getQueueStatus: jest.fn(),
      getOne: jest.fn(),
      updateStatus: jest.fn(),
      listDoctorSchedules: jest.fn(),
      getDoctorSchedule: jest.fn(),
      upsertDoctorSchedule: jest.fn(),
      getBookingReceiptData: jest.fn(),
    };

    pdfService = {
      generatePdf: jest.fn(),
    };

    prisma = {
      hospital: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        { provide: AppointmentsService, useValue: appointmentsService },
        { provide: PdfService, useValue: pdfService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get<AppointmentsController>(AppointmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates appointment after parsing dates and current user context', async () => {
    appointmentsService.createAppointment.mockResolvedValue({ id: 1 });

    const result = await controller.create(
      {
        patientId: 5,
        doctorId: 7,
        departmentId: 3,
        scheduledStart: '2026-04-21T09:00:00.000Z',
        scheduledEnd: '2026-04-21T09:30:00.000Z',
        reason: 'Follow up',
        notes: 'Portal booking',
        type: 'ONLINE' as any,
        isEmergency: true,
        isSpecial: false,
        queueNumber: 9,
      } as any,
      adminUser as any,
    );

    expect(result).toEqual({ id: 1 });
    expect(appointmentsService.createAppointment).toHaveBeenCalledWith({
      hospitalId: 1,
      patientId: 5,
      doctorId: 7,
      departmentId: 3,
      scheduledStart: new Date('2026-04-21T09:00:00.000Z'),
      scheduledEnd: new Date('2026-04-21T09:30:00.000Z'),
      reason: 'Follow up',
      notes: 'Portal booking',
      createdByUserId: 10,
      type: 'ONLINE',
      isEmergency: true,
      isSpecial: false,
      queueNumber: 9,
    });
  });

  it('rejects invalid appointment dates', async () => {
    await expect(
      controller.create(
        {
          patientId: 5,
          scheduledStart: 'invalid-date',
          scheduledEnd: '2026-04-21T09:30:00.000Z',
        } as any,
        adminUser as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('forces doctor listing to their own queue when not admin/reception', async () => {
    appointmentsService.listAppointmentsForDay.mockResolvedValue([{ id: 1 }]);

    await controller.list(
      {
        date: '2026-04-21T00:00:00.000Z',
        doctorId: 99,
      } as any,
      doctorUser as any,
    );

    expect(appointmentsService.listAppointmentsForDay).toHaveBeenCalledWith(
      1,
      new Date('2026-04-21T00:00:00.000Z'),
      expect.objectContaining({ doctorId: 22 }),
    );
  });

  it('blocks doctor status updates for another doctor appointment', async () => {
    appointmentsService.getOne.mockResolvedValue({ id: 5, doctorId: 99 });

    await expect(
      controller.updateStatus('5', { status: 'CHECKED_IN' } as any, doctorUser as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('downloads booking receipt pdf using hospital display settings', async () => {
    appointmentsService.getBookingReceiptData.mockResolvedValue({
      appointmentId: 7,
      patientName: 'Ahmed',
    });
    prisma.hospital.findUnique.mockResolvedValue({
      id: 1,
      displayName: 'Saraya International',
      addressLine1: 'Tripoli',
      city: 'Tripoli',
      printHeaderFooter: true,
    });
    pdfService.generatePdf.mockResolvedValue(Buffer.from('pdf'));

    const res = {
      set: jest.fn(),
      end: jest.fn(),
    };

    await controller.downloadReceipt('7', adminUser as any, res as any);

    expect(pdfService.generatePdf).toHaveBeenCalledWith(
      'booking-receipt',
      expect.objectContaining({
        hospitalName: 'Saraya International',
        address: 'Tripoli - Tripoli',
        printHeaderFooter: true,
      }),
    );
    expect(res.set).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledWith(Buffer.from('pdf'));
  });
});
