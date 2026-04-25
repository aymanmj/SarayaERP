import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { WaitlistService } from './waitlist.service';

@Injectable()
export class WaitlistListener {
  private readonly logger = new Logger(WaitlistListener.name);

  constructor(
    private prisma: PrismaService,
    private waitlistService: WaitlistService,
  ) {}

  @OnEvent('booking.cancelled')
  async handleBookingCancelled(payload: {
    bookingId: number;
    resourceId: number;
    departmentId?: number;
    hospitalId: number;
    freedSlotStart: Date;
    freedSlotEnd: Date;
  }) {
    this.logger.log(`Booking cancelled for resource ${payload.resourceId}. Checking waitlist...`);

    // Find the highest priority waitlist entry for this hospital and department
    const waitlistCandidates = await this.prisma.waitlist.findMany({
      where: {
        hospitalId: payload.hospitalId,
        status: 'WAITING',
        ...(payload.departmentId ? { departmentId: payload.departmentId } : {}),
      },
      orderBy: [
        { priority: 'asc' }, // 1 is highest priority
        { requestedDate: 'asc' }, // Oldest first
      ],
      take: 1,
    });

    if (waitlistCandidates.length > 0) {
      const candidate = waitlistCandidates[0];
      this.logger.log(`Found candidate on waitlist: Patient ${candidate.patientId}. Promoting to NOTIFIED.`);

      // Update the waitlist status to NOTIFIED
      // In a real system, you would also trigger an SMS/Email notification to the patient here.
      await this.waitlistService.updateWaitlistStatus(candidate.id, 'NOTIFIED');
    } else {
      this.logger.log('No waitlist candidates found for the freed slot.');
    }
  }
}
