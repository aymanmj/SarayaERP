// src/attendance/attendance.controller.ts

import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BulkPunchDto, CreatePunchDto } from './dto/attendance.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // تسجيل بصمة واحدة (Live API)
  @Post('punch')
  @Roles('ADMIN', 'HR')
  async logPunch(@Body() dto: CreatePunchDto) {
    return this.attendanceService.processPunch(dto);
  }

  // استيراد بصمات متعددة (من ملف أو جهاز)
  @Post('bulk-import')
  @Roles('ADMIN', 'HR')
  async bulkImport(@Body() dto: BulkPunchDto) {
    return this.attendanceService.processBulkPunches(dto.punches);
  }

  // عرض السجلات
  @Get()
  @Roles('ADMIN', 'HR', 'ACCOUNTANT')
  async list(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    const dateFrom = from ? new Date(from) : undefined;
    const dateTo = to ? new Date(to) : undefined;
    const uId = userId ? Number(userId) : undefined;

    return this.attendanceService.getRecords(
      req.user.hospitalId,
      dateFrom,
      dateTo,
      uId,
    );
  }

  @Post('upload')
  @Roles('ADMIN', 'HR')
  async uploadAttendanceFile(@Body() body: { data: any[] }) {
    // body.data متوقع أن تكون مصفوفة: [{ employeeId: 101, timestamp: '2025-02-01 08:00:00' }, ...]
    return this.attendanceService.processBulkPunches(body.data);
  }
}
