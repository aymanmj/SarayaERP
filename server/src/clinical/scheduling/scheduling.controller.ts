import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Body,
  UseGuards,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { BookingsService } from './bookings.service';
import { WaitlistService } from './waitlist.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt-payload.type';

@Controller('clinical/scheduling')
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
  async getResources(
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    if (hospitalId !== user.hospitalId) {
      throw new ForbiddenException('Access to other hospital resources denied');
    }
    return this.resourcesService.getAllResources(user.hospitalId);
  }

  @Post('resources')
  @Permissions('scheduling:manage')
  async createResource(
    @Body() data: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.resourcesService.createResource({
      ...data,
      hospitalId: user.hospitalId,
    });
  }

  // --- Bookings ---
  @Post('bookings')
  @Permissions('scheduling:manage')
  async createBooking(
    @Body()
    data: {
      resourceId: number;
      encounterId?: number;
      title: string;
      scheduledStart: Date;
      scheduledEnd: Date;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingsService.createBooking(user.hospitalId, data);
  }

  @Get('resources/:resourceId/bookings')
  @Permissions('scheduling:view')
  async getResourceBookings(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingsService.getResourceBookings(
      user.hospitalId,
      resourceId,
      new Date(from),
      new Date(to),
    );
  }

  @Post('bookings/:bookingId/cancel')
  @Permissions('scheduling:manage')
  async cancelBooking(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingsService.cancelBooking(user.hospitalId, bookingId);
  }

  // --- Waitlist ---
  @Get('hospitals/:hospitalId/waitlist')
  @Permissions('scheduling:view')
  async getWaitlist(
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    if (hospitalId !== user.hospitalId) {
      throw new ForbiddenException('Access to other hospital waitlist denied');
    }
    return this.waitlistService.getWaitlistForHospital(user.hospitalId);
  }

  @Post('waitlist')
  @Permissions('scheduling:manage')
  async joinWaitlist(
    @Body() data: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.waitlistService.joinWaitlist({
      ...(data as Parameters<WaitlistService['joinWaitlist']>[0]),
      hospitalId: user.hospitalId,
    });
  }
}
