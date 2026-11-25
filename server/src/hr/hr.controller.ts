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
import { AuditInTransaction } from '../audit/audit.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { LeaveType, LeaveStatus, ShiftType } from '@prisma/client';
import { RequireFeature } from '../licensing/license.decorator';

type AuthedReq = { user: JwtPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('hr')
@RequireFeature('HR')
export class HrController {
  constructor(private readonly hrService: HrService) {}

  // --- Shifts ---
  @Post('shifts')
  @Permissions('hr:manage')
  async createShift(
    @Req() req: AuthedReq,
    @Body()
    body: {
      name: string;
      type: ShiftType;
      startTime: string;
      endTime: string;
      graceMinutes?: number;
    },
  ) {
    return this.hrService.createWorkShift(req.user.hospitalId, body);
  }

  @Get('shifts')
  @Permissions('hr:manage')
  async getShifts(@Req() req: AuthedReq) {
    return this.hrService.getWorkShifts(req.user.hospitalId);
  }

  // --- Roster ---
  @Post('roster/assign')
  @Permissions('hr:manage')
  async assignRoster(
    @Req() req: AuthedReq,
    @Body()
    body: {
      userId: number | string;
      workShiftId: number | string;
      fromDate: string;
      toDate: string;
      isOffDay?: boolean;
    },
  ) {
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
    @Req() req: AuthedReq,
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
    @Req() req: AuthedReq,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { workShiftId?: number; isOffDay?: boolean },
  ) {
    return this.hrService.updateRosterEntry(req.user.hospitalId, id, body);
  }

  @Delete('roster/:id')
  @Permissions('hr:manage')
  async deleteRosterEntry(
    @Req() req: AuthedReq,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hrService.deleteRosterEntry(req.user.hospitalId, id);
  }

  // --- Leaves ---
  @Permissions('hr:manage', 'hr:leaves:request')
  @Post('leaves')
  async requestLeave(
    @Req() req: AuthedReq,
    @Body()
    body: {
      type: LeaveType;
      startDate: string;
      endDate: string;
      reason?: string;
    },
  ) {
    return this.hrService.requestLeave({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      type: body.type,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      reason: body.reason,
    });
  }

  @Patch('leaves/:id/status')
  @Permissions('hr:manage')
  @AuditInTransaction()
  async updateLeaveStatus(
    @Req() req: AuthedReq,
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
  async getLeaves(
    @Req() req: AuthedReq,
    @Query('status') status?: LeaveStatus,
  ) {
    return this.hrService.getLeaves(req.user.hospitalId, status);
  }
}
