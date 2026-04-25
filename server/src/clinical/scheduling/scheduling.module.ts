import { Module } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { BookingsService } from './bookings.service';
import { WaitlistService } from './waitlist.service';
import { WaitlistListener } from './waitlist.listener';
import { SchedulingController } from './scheduling.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SchedulingController],
  providers: [
    ResourcesService,
    BookingsService,
    WaitlistService,
    WaitlistListener,
  ],
  exports: [ResourcesService, BookingsService, WaitlistService],
})
export class SchedulingModule {}
