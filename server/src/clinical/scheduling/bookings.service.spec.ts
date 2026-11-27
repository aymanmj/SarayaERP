import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('BookingsService', () => {
  let service: BookingsService;
  let prismaService: {
    resource: { findFirst: jest.Mock };
    encounter: { findFirst: jest.Mock };
    resourceBooking: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prismaService = {
      resource: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, hospitalId: 1 }),
      },
      encounter: {
        findFirst: jest.fn().mockResolvedValue({ id: 10, hospitalId: 1 }),
      },
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

    it('should throw NotFoundException if resource belongs to another hospital', async () => {
      prismaService.resource.findFirst.mockResolvedValueOnce(null);

      await expect(service.createBooking(2, validBooking)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if resource is already booked at that time', async () => {
      prismaService.resourceBooking.findFirst.mockResolvedValue({
        id: 99,
        scheduledStart: new Date('2026-05-01T09:30:00Z'),
        scheduledEnd: new Date('2026-05-01T10:30:00Z'),
      });

      await expect(service.createBooking(1, validBooking)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should create booking if time slot is free', async () => {
      prismaService.resourceBooking.findFirst.mockResolvedValue(null);
      prismaService.resourceBooking.create.mockResolvedValue({
        id: 100,
        ...validBooking,
        status: 'CONFIRMED',
      });

      const result = await service.createBooking(1, validBooking);

      expect(result).toHaveProperty('id', 100);
      expect(prismaService.resourceBooking.create).toHaveBeenCalled();
    });
  });

  describe('getResourceBookings', () => {
    it('should throw NotFoundException when querying another hospital resource', async () => {
      prismaService.resource.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getResourceBookings(
          2,
          1,
          new Date('2026-05-01T00:00:00Z'),
          new Date('2026-05-02T00:00:00Z'),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelBooking', () => {
    it('should throw NotFoundException when cancelling another hospital booking', async () => {
      prismaService.resourceBooking.findFirst.mockResolvedValueOnce(null);

      await expect(service.cancelBooking(2, 100)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should emit booking.cancelled event upon cancellation', async () => {
      prismaService.resourceBooking.findFirst.mockResolvedValue({
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

      await service.cancelBooking(1, 100);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'booking.cancelled',
        expect.any(Object),
      );
      expect(prismaService.resourceBooking.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { status: 'CANCELLED' },
      });
    });
  });
});
