// server/src/attendance/biometric-attendance.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';
import { AdmsDeviceGuard, type AdmsRequest } from './adms-device.guard';
import { BiometricAttendanceService } from './biometric-attendance.service';
import { buildAdmsHandshakeResponse } from './biometric-adms.util';
import {
  AssignBiometricIdDto,
  ClassifyAbsenceDto,
  CreateBiometricDeviceDto,
  CreateHolidayDto,
  DecideAttendanceMovementDto,
  IngestDevicePunchesDto,
  MarkAbsenceDto,
  RecordAttendanceMovementDto,
  UpdateBiometricDeviceDto,
} from './dto/biometric-attendance.dto';

@Controller()
export class BiometricAttendanceController {
  private static deviceStamps = new Map<
    string,
    { attStamp?: string; opStamp?: string }
  >();

  constructor(private readonly service: BiometricAttendanceService) {}

  // =========================================================================
  // 1. ZKTECO ADMS CLOUD PUSH HARDWARE PROTOCOL (/iclock/cdata)
  //    Protected by AdmsDeviceGuard (LAN IP + Registered Active SN + IP Match + SHA-256 Secret)
  // =========================================================================

  @Public()
  @UseGuards(AdmsDeviceGuard)
  @Get('iclock/cdata')
  async admsHandshake(@Req() req: AdmsRequest, @Res() res: Response) {
    const device = req.admsDevice!;
    const clientIp = req.admsClientIp ?? '';
    await this.service.recordDeviceHeartbeat(
      device.id,
      device.serialNumber,
      clientIp,
    );

    const savedStamps = BiometricAttendanceController.deviceStamps.get(
      device.serialNumber,
    );
    const body = buildAdmsHandshakeResponse(
      device.serialNumber,
      savedStamps?.attStamp ?? '0',
      savedStamps?.opStamp ?? '0',
    );
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(body);
  }

  @Public()
  @UseGuards(AdmsDeviceGuard)
  @Post('iclock/cdata')
  async admsPushData(
    @Query('table') table: string | undefined,
    @Query('Stamp') attStamp: string | undefined,
    @Query('OpStamp') opStamp: string | undefined,
    @Req() req: AdmsRequest,
    @Res() res: Response,
  ) {
    const device = req.admsDevice!;
    const clientIp = req.admsClientIp ?? '';
    await this.service.recordDeviceHeartbeat(
      device.id,
      device.serialNumber,
      clientIp,
    );

    const cur =
      BiometricAttendanceController.deviceStamps.get(device.serialNumber) ?? {};
    if (attStamp && /^\d+$/.test(attStamp)) cur.attStamp = attStamp;
    if (opStamp && /^\d+$/.test(opStamp)) cur.opStamp = opStamp;
    BiometricAttendanceController.deviceStamps.set(device.serialNumber, cur);

    const isAttLog = !table || table.toUpperCase() === 'ATTLOG';
    let rawBody = '';
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
    } else if (
      req.body &&
      typeof req.body === 'object' &&
      'rawAttlog' in req.body
    ) {
      const candidate = (req.body as { rawAttlog?: unknown }).rawAttlog;
      rawBody = typeof candidate === 'string' ? candidate : '';
    }

    let ackCount = 0;
    if (isAttLog && rawBody.trim()) {
      const result = await this.service.ingestAdmsAttlog(
        device,
        rawBody,
        'ADMS',
      );
      ackCount = result.received;
    }

    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(`OK: ${ackCount}`);
  }

  // =========================================================================
  // 2. AUTHENTICATED MULTI-TENANT MANAGEMENT ENDPOINTS (/attendance/biometric/*)
  // =========================================================================

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:view')
  @Get('attendance/biometric/devices')
  listDevices(@CurrentUser() user: JwtPayload) {
    return this.service.listDevices(user.hospitalId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:manage')
  @AuditInTransaction()
  @Post('attendance/biometric/devices')
  createDevice(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBiometricDeviceDto,
  ) {
    return this.service.createDevice(user.hospitalId, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:manage')
  @AuditInTransaction()
  @Patch('attendance/biometric/devices/:id')
  updateDevice(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBiometricDeviceDto,
  ) {
    return this.service.updateDevice(user.hospitalId, id, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:manage')
  @AuditInTransaction()
  @Patch('attendance/biometric/employees/:userId/biometric-id')
  assignBiometricId(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AssignBiometricIdDto,
  ) {
    return this.service.assignEmployeeBiometricId(
      user.hospitalId,
      userId,
      user.sub,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:manage')
  @AuditInTransaction()
  @Post('attendance/biometric/devices/:id/ingest')
  ingestDevicePunches(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IngestDevicePunchesDto,
  ) {
    return this.service.ingestDevicePunchesAuthenticated(
      user.hospitalId,
      id,
      user.sub,
      dto.rawAttlog,
      dto.tzOffsetHours ?? 2,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:view')
  @Get('attendance/biometric/punches')
  listPunchLogs(
    @CurrentUser() user: JwtPayload,
    @Query('deviceId') deviceId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.service.listPunchLogs(
      user.hospitalId,
      deviceId ? Number(deviceId) : undefined,
      userId ? Number(userId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:manage')
  @AuditInTransaction()
  @Post('attendance/biometric/movements')
  recordMovement(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordAttendanceMovementDto,
  ) {
    return this.service.recordMovement(user.hospitalId, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:manage')
  @AuditInTransaction()
  @Post('attendance/biometric/movements/:id/decision')
  decideMovement(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideAttendanceMovementDto,
  ) {
    return this.service.decideMovement(user.hospitalId, id, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:manage')
  @AuditInTransaction()
  @Post('attendance/biometric/absences')
  markAbsence(@CurrentUser() user: JwtPayload, @Body() dto: MarkAbsenceDto) {
    return this.service.markAndClassifyAbsence(user.hospitalId, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:manage')
  @AuditInTransaction()
  @Patch('attendance/biometric/records/:id/classify-absence')
  classifyAbsence(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ClassifyAbsenceDto,
  ) {
    return this.service.classifyAbsence(user.hospitalId, id, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:view')
  @Get('attendance/biometric/holidays')
  listHolidays(@CurrentUser() user: JwtPayload) {
    return this.service.listHolidays(user.hospitalId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:manage')
  @AuditInTransaction()
  @Post('attendance/biometric/holidays')
  createHoliday(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateHolidayDto,
  ) {
    return this.service.createHoliday(user.hospitalId, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:manage')
  @AuditInTransaction()
  @Patch('attendance/biometric/holidays/:id/deactivate')
  deactivateHoliday(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deactivateHoliday(user.hospitalId, id, user.sub);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('attendance:manage', 'hr:attendance:manage', 'hr:view')
  @Get('attendance/biometric/hours-report')
  getBiometricHoursReport(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('departmentId') departmentId?: string,
    @Query('debounceMinutes') debounceMinutes?: string,
  ) {
    return this.service.getBiometricHoursReport(user.hospitalId, {
      startDate,
      endDate,
      departmentId: departmentId ? Number(departmentId) : undefined,
      debounceMinutes: debounceMinutes ? Number(debounceMinutes) : undefined,
    });
  }
}
