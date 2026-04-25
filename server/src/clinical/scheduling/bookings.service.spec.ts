import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException } from '@nestjs/common';

describe('BookingsService', () => {
  let service: BookingsService;
  let prismaService: any;
  let eventEmitter: any;

  beforeEach(async () => {
    prismaService = {
      resourceBooking: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createBooking', () => {
    const validBooking = {
      resourceId: 1,
      title: 'MRI Scan',
      scheduledStart: new Date('2026-05-01T10:00:00Z'),
      scheduledEnd: new Date('2026-05-01T11:00:00Z'),
    };

    it('should throw ConflictException if resource is already booked at that time', async () => {
      prismaService.resourceBooking.findFirst.mockResolvedValue({
        id: 99,
        scheduledStart: new Date('2026-05-01T09:30:00Z'),
        scheduledEnd: new Date('2026-05-01T10:30:00Z'),
      });

      await expect(service.createBooking(validBooking)).rejects.toThrow(ConflictException);
    });

    it('should create booking if time slot is free', async () => {
      prismaService.resourceBooking.findFirst.mockResolvedValue(null);
      prismaService.resourceBooking.create.mockResolvedValue({
        id: 100,
        ...validBooking,
        status: 'CONFIRMED',
      });

      const result = await service.createBooking(validBooking);

      expect(result).toHaveProperty('id', 100);
      expect(prismaService.resourceBooking.create).toHaveBeenCalled();
    });
  });

  describe('cancelBooking', () => {
    it('should emit booking.cancelled event upon cancellation', async () => {
      prismaService.resourceBooking.findUnique.mockResolvedValue({
        id: 100,
        resourceId: 1,
        status: 'CONFIRMED',
        scheduledStart: new Date('2026-05-01T10:00:00Z'),
        scheduledEnd: new Date('2026-05-01T11:00:00Z'),
        resource: { hospitalId: 1, departmentId: 2 },
      });
      prismaService.resourceBooking.update.mockResolvedValue({
        id: 100,
        status: 'CANCELLED',
      });

      await service.cancelBooking(100);

      expect(eventEmitter.emit).toHaveBeenCalledWith('booking.cancelled', expect.any(Object));
      expect(prismaService.resourceBooking.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { status: 'CANCELLED' },
      });
    });
  });
});
