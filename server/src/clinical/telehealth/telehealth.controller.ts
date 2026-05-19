import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { TelehealthService } from './telehealth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt-payload.type';

@Controller('clinical/telehealth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TelehealthController {
  constructor(private readonly telehealthService: TelehealthService) {}

  @Post('session/:appointmentId/init')
  @Permissions('telehealth:manage')
  async createSession(
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.telehealthService.createSession(user.hospitalId, appointmentId);
  }

  @Post('session/:appointmentId/waiting-room')
  @Permissions('appointments:view') // Patient permission
  async enterWaitingRoom(
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const patientId = user.patientId;
    if (!patientId) {
      throw new ForbiddenException(
        'User is not associated with a patient profile',
      );
    }
    return this.telehealthService.enterWaitingRoom(
      user.hospitalId,
      appointmentId,
      patientId,
    );
  }

  @Get('session/:appointmentId/patient-access')
  @Permissions('appointments:view') // Patient permission
  async getPatientAccess(
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const patientId = user.patientId;
    if (!patientId) {
      throw new ForbiddenException(
        'User is not associated with a patient profile',
      );
    }
    return this.telehealthService.getPatientRoomAccess(
      user.hospitalId,
      appointmentId,
      patientId,
    );
  }

  @Post('session/:appointmentId/start')
  @Permissions('telehealth:start') // Doctor permission
  async startSession(
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const doctorId = user.sub;
    return this.telehealthService.startSession(
      user.hospitalId,
      appointmentId,
      doctorId,
    );
  }
}
