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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ShiftType, LeaveType, LeaveStatus } from '@prisma/client';
import { RequireFeature } from '../licensing/license.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hr')
@RequireFeature('HR')
export class HrController {
  constructor(private readonly hrService: HrService) {}

  // --- Shifts ---
  @Post('shifts')
  @Roles('ADMIN', 'HR')
  async createShift(@Req() req: any, @Body() body: any) {
    return this.hrService.createWorkShift(req.user.hospitalId, body);
  }

  @Get('shifts')
  @Roles('ADMIN', 'HR')
  async getShifts(@Req() req: any) {
    return this.hrService.getWorkShifts(req.user.hospitalId);
  }

  // --- Roster ---
  @Post('roster/assign')
  @Roles('ADMIN', 'HR')
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
  @Roles('ADMIN', 'HR', 'DOCTOR', 'NURSE')
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
  @Roles('ADMIN', 'HR')
  async updateRosterEntry(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { workShiftId?: number; isOffDay?: boolean },
  ) {
    return this.hrService.updateRosterEntry(req.user.hospitalId, id, body);
  }

  @Delete('roster/:id')
  @Roles('ADMIN', 'HR')
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
  @Roles('ADMIN', 'HR')
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
  @Roles('ADMIN', 'HR')
  async getLeaves(@Req() req: any, @Query('status') status?: string) {
    return this.hrService.getLeaves(req.user.hospitalId, status as any);
  }
}
