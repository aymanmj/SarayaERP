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
import { HrService, type UpsertShiftDayInput } from './hr.service';
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

  // --- Shifts (Static assignment & roster-day routes MUST precede :id routes) ---
  @Get('shifts/assignments')
  @Permissions('hr:shifts:manage', 'hr:manage', 'hr:view')
  listShiftAssignments(
    @Req() req: AuthedReq,
    @Query('employeeId') employeeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.hrService.listShiftAssignments(req.user.hospitalId, {
      employeeId: employeeId ? Number(employeeId) : undefined,
      departmentId: departmentId ? Number(departmentId) : undefined,
    });
  }

  @Post('shifts/assignments')
  @AuditInTransaction()
  @Permissions('hr:shifts:manage', 'hr:manage')
  assignShiftToEmployee(
    @Req() req: AuthedReq,
    @Body()
    body: {
      employeeId: number;
      shiftId: number;
      startDate: string;
      endDate?: string;
    },
  ) {
    return this.hrService.assignShiftToEmployee(
      req.user.hospitalId,
      req.user.sub,
      body,
    );
  }

  @Post('shifts/assignments/bulk')
  @AuditInTransaction()
  @Permissions('hr:shifts:manage', 'hr:manage')
  bulkAssignShift(
    @Req() req: AuthedReq,
    @Body()
    body: {
      employeeIds?: number[];
      departmentId?: number;
      shiftId: number;
      startDate: string;
      endDate?: string;
    },
  ) {
    return this.hrService.bulkAssignShift(
      req.user.hospitalId,
      req.user.sub,
      body,
    );
  }

  @Delete('shifts/assignments/:id')
  @AuditInTransaction()
  @Permissions('hr:shifts:manage', 'hr:manage')
  removeShiftAssignment(
    @Req() req: AuthedReq,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hrService.removeShiftAssignment(req.user.hospitalId, id);
  }

  @Get('shifts/roster-days')
  @Permissions('hr:shifts:manage', 'hr:manage', 'hr:view')
  getMonthlyShiftGrid(
    @Req() req: AuthedReq,
    @Query('month') month?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('departmentId') departmentId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.hrService.getMonthlyShiftGrid(req.user.hospitalId, {
      month,
      fromDate,
      toDate,
      departmentId: departmentId ? Number(departmentId) : undefined,
      employeeId: employeeId ? Number(employeeId) : undefined,
    });
  }

  @Post('shifts/roster-days')
  @AuditInTransaction()
  @Permissions('hr:shifts:manage', 'hr:manage')
  upsertShiftDay(@Req() req: AuthedReq, @Body() body: UpsertShiftDayInput) {
    return this.hrService.upsertShiftDay(
      req.user.hospitalId,
      req.user.sub,
      body,
    );
  }

  @Post('shifts/roster-days/bulk')
  @AuditInTransaction()
  @Permissions('hr:shifts:manage', 'hr:manage')
  bulkUpsertShiftDays(
    @Req() req: AuthedReq,
    @Body() body: { days: UpsertShiftDayInput[] },
  ) {
    return this.hrService.bulkUpsertShiftDays(
      req.user.hospitalId,
      req.user.sub,
      body.days,
    );
  }

  @Delete('shifts/roster-days/:id')
  @AuditInTransaction()
  @Permissions('hr:shifts:manage', 'hr:manage')
  deleteShiftDay(@Req() req: AuthedReq, @Param('id', ParseIntPipe) id: number) {
    return this.hrService.deleteShiftDay(req.user.hospitalId, id);
  }

  @Post('shifts/roster-import/preview')
  @Permissions('hr:shifts:manage', 'hr:manage')
  previewRosterCsv(@Req() req: AuthedReq, @Body() body: { content: string }) {
    return this.hrService.previewRosterCsvImport(
      req.user.hospitalId,
      body.content,
    );
  }

  @Post('shifts/roster-import/apply')
  @AuditInTransaction()
  @Permissions('hr:shifts:manage', 'hr:manage')
  applyRosterCsv(@Req() req: AuthedReq, @Body() body: { content: string }) {
    return this.hrService.applyRosterCsvImport(
      req.user.hospitalId,
      req.user.sub,
      body.content,
    );
  }

  @Post('shifts')
  @Permissions('hr:shifts:manage', 'hr:manage')
  async createShift(
    @Req() req: AuthedReq,
    @Body()
    body: {
      code?: string;
      name: string;
      nameEn?: string;
      type: ShiftType;
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      graceMinutes?: number;
      workHours?: number;
      overtimeMultiplier?: number;
      holidayMultiplier?: number;
      nightAllowance?: number;
      isOvernight?: boolean;
      isFlexible?: boolean;
      isScrubShift?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.hrService.createWorkShift(req.user.hospitalId, body);
  }

  @Get('shifts')
  @Permissions('hr:shifts:manage', 'hr:manage', 'hr:view')
  async getShifts(@Req() req: AuthedReq) {
    return this.hrService.getWorkShifts(req.user.hospitalId);
  }

  @Patch('shifts/:id')
  @AuditInTransaction()
  @Permissions('hr:shifts:manage', 'hr:manage')
  async updateShift(
    @Req() req: AuthedReq,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      code?: string;
      name?: string;
      nameEn?: string;
      type?: ShiftType;
      startTime?: string;
      endTime?: string;
      breakMinutes?: number;
      graceMinutes?: number;
      workHours?: number;
      overtimeMultiplier?: number;
      holidayMultiplier?: number;
      nightAllowance?: number;
      isOvernight?: boolean;
      isFlexible?: boolean;
      isScrubShift?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.hrService.updateWorkShift(req.user.hospitalId, id, body);
  }

  @Delete('shifts/:id')
  @AuditInTransaction()
  @Permissions('hr:shifts:manage', 'hr:manage')
  async deleteShift(
    @Req() req: AuthedReq,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hrService.deleteWorkShift(req.user.hospitalId, id);
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
