import { Controller, Post, Get, Param, UseGuards, ParseIntPipe, Req } from '@nestjs/common';
import { TelehealthService } from './telehealth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';

@Controller('api/clinical/telehealth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TelehealthController {
  constructor(private readonly telehealthService: TelehealthService) {}

  @Post('session/:appointmentId/init')
  @Permissions('telehealth:manage')
  async createSession(@Param('appointmentId', ParseIntPipe) appointmentId: number) {
    return this.telehealthService.createSession(appointmentId);
  }

  @Post('session/:appointmentId/waiting-room')
  @Permissions('appointments:view') // Patient permission
  async enterWaitingRoom(
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
    @Req() req: any,
  ) {
    const patientId = req.user.patientId; // Assuming user has a linked patient profile
    return this.telehealthService.enterWaitingRoom(appointmentId, patientId);
  }

  @Get('session/:appointmentId/patient-access')
  @Permissions('appointments:view') // Patient permission
  async getPatientAccess(
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
    @Req() req: any,
  ) {
    const patientId = req.user.patientId;
    return this.telehealthService.getPatientRoomAccess(appointmentId, patientId);
  }

  @Post('session/:appointmentId/start')
  @Permissions('telehealth:start') // Doctor permission
  async startSession(
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
    @Req() req: any,
  ) {
    const doctorId = req.user.id;
    return this.telehealthService.startSession(appointmentId, doctorId);
  }
}
