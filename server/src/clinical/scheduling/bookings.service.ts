import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Creates a booking ensuring no overlap with existing confirmed bookings.
   */
  async createBooking(data: {
    resourceId: number;
    encounterId?: number;
    title: string;
    scheduledStart: Date;
    scheduledEnd: Date;
  }) {
    // Conflict Detection Logic
    const overlappingBooking = await this.prisma.resourceBooking.findFirst({
      where: {
        resourceId: data.resourceId,
        status: 'CONFIRMED',
        AND: [
          {
            scheduledStart: { lt: new Date(data.scheduledEnd) },
          },
          {
            scheduledEnd: { gt: new Date(data.scheduledStart) },
          },
        ],
      },
    });

    if (overlappingBooking) {
      throw new ConflictException(
        `Resource ${data.resourceId} is already booked from ${overlappingBooking.scheduledStart.toISOString()} to ${overlappingBooking.scheduledEnd.toISOString()}`,
      );
    }

    const booking = await this.prisma.resourceBooking.create({
      data: {
        ...data,
        status: 'CONFIRMED',
      },
    });

    return booking;
  }

  async getResourceBookings(resourceId: number, from: Date, to: Date) {
    return this.prisma.resourceBooking.findMany({
      where: {
        resourceId,
        status: 'CONFIRMED',
        scheduledStart: { gte: from },
        scheduledEnd: { lte: to },
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  async cancelBooking(bookingId: number) {
    const booking = await this.prisma.resourceBooking.findUnique({
      where: { id: bookingId },
      include: { resource: true },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    if (booking.status === 'CANCELLED') {
      throw new ConflictException(`Booking ${bookingId} is already cancelled`);
    }

    const updatedBooking = await this.prisma.resourceBooking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });

    // Emit event so the waitlist listener can pick it up
    this.eventEmitter.emit('booking.cancelled', {
      bookingId: booking.id,
      resourceId: booking.resourceId,
      departmentId: booking.resource.departmentId,
      hospitalId: booking.resource.hospitalId,
      freedSlotStart: booking.scheduledStart,
      freedSlotEnd: booking.scheduledEnd,
    });

    return updatedBooking;
  }
}
