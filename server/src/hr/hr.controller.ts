// src/hr/hr.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HrService } from './hr.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { ShiftType, LeaveType, LeaveStatus } from '@prisma/client';
import { RequireFeature } from '../licensing/license.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('hr')
@RequireFeature('HR')
export class HrController {
  constructor(private readonly hrService: HrService) {}

  // --- Shifts ---
  @Post('shifts')
  @Permissions('hr:manage')
  async createShift(@Req() req: any, @Body() body: any) {
    return this.hrService.createWorkShift(req.user.hospitalId, body);
  }

  @Get('shifts')
  @Permissions('hr:manage')
  async getShifts(@Req() req: any) {
    return this.hrService.getWorkShifts(req.user.hospitalId);
  }

  // --- Roster ---
  @Post('roster/assign')
  @Permissions('hr:manage')
  async assignRoster(@Req() req: any, @Body() body: any) {
    return this.hrService.assignRoster({
      hospitalId: req.user.hospitalId,
      userId: Number(body.userId),
      workShiftId: Number(body.workShiftId),
      fromDate: new Date(body.fromDate),
      toDate: new Date(body.toDate),
      isOffDay: body.isOffDay,
    });
  }

  @Get('roster')
  @Permissions('hr:view')
  async getRoster(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('userId') userId?: string,
  ) {
    return this.hrService.getRoster(
      req.user.hospitalId,
      new Date(from),
      new Date(to),
      userId ? Number(userId) : undefined,
    );
  }

  @Patch('roster/:id')
  @Permissions('hr:manage')
  async updateRosterEntry(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { workShiftId?: number; isOffDay?: boolean },
  ) {
    return this.hrService.updateRosterEntry(req.user.hospitalId, id, body);
  }

  @Delete('roster/:id')
  @Permissions('hr:manage')
  async deleteRosterEntry(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hrService.deleteRosterEntry(req.user.hospitalId, id);
  }

  // --- Leaves ---
  @Post('leaves')
  async requestLeave(@Req() req: any, @Body() body: any) {
    return this.hrService.requestLeave({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      type: body.type as LeaveType,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      reason: body.reason,
    });
  }

  @Patch('leaves/:id/status')
  @Permissions('hr:manage')
  async updateLeaveStatus(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: LeaveStatus },
  ) {
    return this.hrService.approveLeave(
      req.user.hospitalId,
      id,
      req.user.sub,
      body.status,
    );
  }

  @Get('leaves')
  @Permissions('hr:manage')
  async getLeaves(@Req() req: any, @Query('status') status?: string) {
    return this.hrService.getLeaves(req.user.hospitalId, status as any);
  }
}
