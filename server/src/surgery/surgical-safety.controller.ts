import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';
import { SurgicalSafetyService } from './surgical-safety.service';
import {
  AddSurgicalCountDeltaDto,
  CreateSurgicalCountItemDto,
  RecordWhoChecklistDto,
  ResolveSurgicalCountDiscrepancyDto,
  SaveAnesthesiaRecordDto,
  SignDeliverySafetyDto,
  VerifySurgicalCountDto,
} from './dto/surgical-safety.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('surgery/safety')
export class SurgicalSafetyController {
  constructor(private readonly safetyService: SurgicalSafetyService) {}

  @Get('cases/:caseId/summary')
  @Permissions('surgery:view')
  getCaseSafetySummary(
    @CurrentUser() user: JwtPayload,
    @Param('caseId', ParseIntPipe) caseId: number,
  ) {
    return this.safetyService.getCaseSafetySummary(user.hospitalId, caseId);
  }

  @Post('cases/:caseId/checklist')
  @AuditInTransaction()
  @Permissions('surgery:manage')
  recordWhoChecklist(
    @CurrentUser() user: JwtPayload,
    @Param('caseId', ParseIntPipe) caseId: number,
    @Body() dto: RecordWhoChecklistDto,
  ) {
    return this.safetyService.recordWhoChecklist(
      user.hospitalId,
      caseId,
      user.sub,
      dto,
    );
  }

  @Post('cases/:caseId/counts')
  @AuditInTransaction()
  @Permissions('surgery:manage')
  addSurgicalCountItem(
    @CurrentUser() user: JwtPayload,
    @Param('caseId', ParseIntPipe) caseId: number,
    @Body() dto: CreateSurgicalCountItemDto,
  ) {
    return this.safetyService.addSurgicalCountItem(
      user.hospitalId,
      caseId,
      user.sub,
      dto,
    );
  }

  @Post('counts/:countId/add')
  @AuditInTransaction()
  @Permissions('surgery:manage')
  addSurgicalCountDelta(
    @CurrentUser() user: JwtPayload,
    @Param('countId', ParseIntPipe) countId: number,
    @Body() dto: AddSurgicalCountDeltaDto,
  ) {
    return this.safetyService.addSurgicalCountDelta(
      user.hospitalId,
      countId,
      user.sub,
      dto,
    );
  }

  @Post('counts/:countId/verify')
  @AuditInTransaction()
  @Permissions('surgery:manage')
  verifySurgicalCount(
    @CurrentUser() user: JwtPayload,
    @Param('countId', ParseIntPipe) countId: number,
    @Body() dto: VerifySurgicalCountDto,
  ) {
    return this.safetyService.verifySurgicalCount(
      user.hospitalId,
      countId,
      user.sub,
      dto,
    );
  }

  @Post('counts/:countId/resolve')
  @AuditInTransaction()
  @Permissions('surgery:manage')
  resolveSurgicalCountDiscrepancy(
    @CurrentUser() user: JwtPayload,
    @Param('countId', ParseIntPipe) countId: number,
    @Body() dto: ResolveSurgicalCountDiscrepancyDto,
  ) {
    return this.safetyService.resolveSurgicalCountDiscrepancy(
      user.hospitalId,
      countId,
      user.sub,
      dto,
    );
  }

  @Put('cases/:caseId/anesthesia')
  @Permissions('surgery:manage')
  saveAnesthesiaDraft(
    @CurrentUser() user: JwtPayload,
    @Param('caseId', ParseIntPipe) caseId: number,
    @Body() dto: SaveAnesthesiaRecordDto,
  ) {
    return this.safetyService.saveAnesthesiaDraft(
      user.hospitalId,
      caseId,
      user.sub,
      dto,
    );
  }

  @Post('cases/:caseId/anesthesia/sign')
  @AuditInTransaction()
  @Permissions('surgery:manage')
  signAnesthesiaRecord(
    @CurrentUser() user: JwtPayload,
    @Param('caseId', ParseIntPipe) caseId: number,
  ) {
    return this.safetyService.signAnesthesiaRecord(
      user.hospitalId,
      caseId,
      user.sub,
    );
  }

  @Post('deliveries/:deliveryId/safety-sign')
  @AuditInTransaction()
  @Permissions('surgery:manage')
  signDeliverySafety(
    @CurrentUser() user: JwtPayload,
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
    @Body() dto: SignDeliverySafetyDto,
  ) {
    return this.safetyService.signDeliverySafety(
      user.hospitalId,
      deliveryId,
      user.sub,
      dto,
    );
  }
}
