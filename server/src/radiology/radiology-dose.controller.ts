// server/src/radiology/radiology-dose.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';
import { RadiologyDoseService } from './radiology-dose.service';
import { RecordRadiologyDoseDto } from './dto/radiology-dose.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('radiology/dose')
export class RadiologyDoseController {
  constructor(private readonly doseService: RadiologyDoseService) {}

  @Post('orders/:orderId')
  @AuditInTransaction()
  @Permissions('radiology:manage')
  recordOrderDose(
    @CurrentUser() user: JwtPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: RecordRadiologyDoseDto,
  ) {
    return this.doseService.recordOrderDose(
      user.hospitalId,
      orderId,
      user.sub,
      dto,
    );
  }

  @Get('patients/:patientId/summary')
  @Permissions('radiology:view')
  getPatientDoseSummary(
    @CurrentUser() user: JwtPayload,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.doseService.getPatientDoseSummary(user.hospitalId, patientId);
  }
}
