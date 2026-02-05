import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { PdfService } from '../pdf/pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock } from '../test-utils';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        {
          provide: AppointmentsService,
          useValue: {
            listAll: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            cancel: jest.fn(),
            createAppointment: jest.fn(),
            listAppointmentsForDay: jest.fn(),
            getQueueStatus: jest.fn(),
            getOne: jest.fn(),
            updateStatus: jest.fn(),
            listDoctorSchedules: jest.fn(),
            getDoctorSchedule: jest.fn(),
            upsertDoctorSchedule: jest.fn(),
            getBookingReceiptData: jest.fn(),
          },
        },
        {
          provide: PdfService,
          useValue: {
            generatePdf: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
      ],
    }).compile();

    controller = module.get<AppointmentsController>(AppointmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
