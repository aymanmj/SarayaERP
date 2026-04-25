import { Controller, Get, Post, Param, ParseIntPipe, Body, UseGuards, Query } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { BookingsService } from './bookings.service';
import { WaitlistService } from './waitlist.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';

@Controller('api/clinical/scheduling')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SchedulingController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly bookingsService: BookingsService,
    private readonly waitlistService: WaitlistService,
  ) {}

  // --- Resources ---
  @Get('hospitals/:hospitalId/resources')
  @Permissions('scheduling:view')
  async getResources(@Param('hospitalId', ParseIntPipe) hospitalId: number) {
    return this.resourcesService.getAllResources(hospitalId);
  }

  @Post('resources')
  @Permissions('scheduling:manage')
  async createResource(@Body() data: any) {
    return this.resourcesService.createResource(data);
  }

  // --- Bookings ---
  @Post('bookings')
  @Permissions('scheduling:manage')
  async createBooking(
    @Body() data: {
      resourceId: number;
      encounterId?: number;
      title: string;
      scheduledStart: Date;
      scheduledEnd: Date;
    },
  ) {
    return this.bookingsService.createBooking(data);
  }

  @Get('resources/:resourceId/bookings')
  @Permissions('scheduling:view')
  async getResourceBookings(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.bookingsService.getResourceBookings(
      resourceId,
      new Date(from),
      new Date(to),
    );
  }

  @Post('bookings/:bookingId/cancel')
  @Permissions('scheduling:manage')
  async cancelBooking(@Param('bookingId', ParseIntPipe) bookingId: number) {
    return this.bookingsService.cancelBooking(bookingId);
  }

  // --- Waitlist ---
  @Get('hospitals/:hospitalId/waitlist')
  @Permissions('scheduling:view')
  async getWaitlist(@Param('hospitalId', ParseIntPipe) hospitalId: number) {
    return this.waitlistService.getWaitlistForHospital(hospitalId);
  }

  @Post('waitlist')
  @Permissions('scheduling:manage')
  async joinWaitlist(@Body() data: any) {
    return this.waitlistService.joinWaitlist(data);
  }
}
