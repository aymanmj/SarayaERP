// src/radiology/radiology.controller.ts

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RadiologyService } from './radiology.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { RequireFeature } from '../licensing/license.decorator';
import { AuditInTransaction } from '../audit/audit.decorator';
import {
  AddRadiologyAddendumDto,
  CancelRadiologyOrderDto,
  CheckRadiologySafetyDto,
  CreateRadiologyOrdersDto,
  CreateRadiologyStationDto,
  CreateRadiologyStudyDto,
  CreateRadiologyTemplateDto,
  RecordRadiologyReadBackDto,
  SaveRadiologyReportDto,
} from './dto/radiology-modernization.dto';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('radiology')
@RequireFeature('RADIOLOGY')
export class RadiologyController {
  constructor(private readonly radiologyService: RadiologyService) {}

  @Get('catalog')
  @Permissions('radiology:view')
  async getCatalog(@Req() req: AuthenticatedRequest) {
    return this.radiologyService.getCatalog(req.user.hospitalId);
  }

  @Post('catalog/studies')
  @AuditInTransaction()
  @Permissions('radiology:manage')
  async createCatalogStudy(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRadiologyStudyDto,
  ) {
    return this.radiologyService.createCatalogStudy(
      user.hospitalId,
      user.sub,
      dto,
    );
  }

  @Get('templates')
  @Permissions('radiology:view')
  async listTemplates(
    @CurrentUser() user: JwtPayload,
    @Query('modality') modality?: string,
  ) {
    return this.radiologyService.listTemplates(user.hospitalId, modality);
  }

  @Post('templates')
  @AuditInTransaction()
  @Permissions('radiology:manage')
  async createTemplate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRadiologyTemplateDto,
  ) {
    return this.radiologyService.createTemplate(user.hospitalId, user.sub, dto);
  }

  @Get('stations')
  @Permissions('radiology:view')
  async listStations(@CurrentUser() user: JwtPayload) {
    return this.radiologyService.listStations(user.hospitalId);
  }

  @Post('stations')
  @AuditInTransaction()
  @Permissions('radiology:manage')
  async createStation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRadiologyStationDto,
  ) {
    return this.radiologyService.createStation(user.hospitalId, user.sub, dto);
  }

  @Get('critical-notifications')
  @Permissions('radiology:view')
  async listCriticalNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('pending') pending?: string,
  ) {
    return this.radiologyService.listCriticalNotifications(
      user.hospitalId,
      pending === 'true',
    );
  }

  @Post('critical-notifications/:id/read-back')
  @AuditInTransaction()
  @Permissions('radiology:manage')
  async recordCriticalReadBack(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordRadiologyReadBackDto,
  ) {
    return this.radiologyService.recordCriticalReadBack(
      user.hospitalId,
      id,
      user.sub,
      dto,
    );
  }

  @Get('encounters/:encounterId/orders')
  @Permissions('radiology:view')
  async listOrdersForEncounter(
    @CurrentUser() user: JwtPayload,
    @Param('encounterId', ParseIntPipe) encounterId: number,
  ) {
    return this.radiologyService.listOrdersForEncounter(
      encounterId,
      user.hospitalId,
      user,
    );
  }

  @Post('encounters/:encounterId/safety-check')
  @Permissions('radiology:view')
  async checkSafetyForEncounter(
    @CurrentUser() user: JwtPayload,
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Body() dto: CheckRadiologySafetyDto,
  ) {
    return this.radiologyService.evaluateSafetyForEncounter({
      encounterId,
      hospitalId: user.hospitalId,
      studyIds: dto.studyIds.map(Number),
      pregnancyStatus: dto.pregnancyStatus,
    });
  }

  @Post('encounters/:encounterId/orders')
  @Permissions('radiology:manage')
  async createOrdersForEncounter(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Body() dto: CreateRadiologyOrdersDto,
  ) {
    if (!dto.studyIds || dto.studyIds.length === 0) {
      throw new BadRequestException('يجب اختيار فحص واحد على الأقل.');
    }
    const doctorId = dto.doctorId ?? req.user.sub;

    return this.radiologyService.createOrdersForEncounter({
      encounterId,
      hospitalId: req.user.hospitalId,
      doctorId,
      studyIds: dto.studyIds.map(Number),
      notes: dto.notes,
      ...(dto.pregnancyStatus !== undefined
        ? { pregnancyStatus: dto.pregnancyStatus }
        : {}),
      ...(dto.contrastOverrideReason !== undefined
        ? { contrastOverrideReason: dto.contrastOverrideReason }
        : {}),
      ...(dto.radiationOverrideReason !== undefined
        ? { radiationOverrideReason: dto.radiationOverrideReason }
        : {}),
      ...(dto.stationId !== undefined ? { stationId: dto.stationId } : {}),
    });
  }

  @Get('worklist')
  @Permissions('radiology:manage')
  async worklist(@Req() req: AuthenticatedRequest) {
    return this.radiologyService.getWorklist(req.user.hospitalId);
  }

  @Post('orders/:id/start')
  @Permissions('radiology:manage')
  async startOrder(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.radiologyService.startProcessing(
      req.user.hospitalId,
      id,
      req.user.sub,
    );
  }

  @Get('orders/:id')
  @Permissions('radiology:view')
  async getOrder(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.radiologyService.getOrderById(req.user.hospitalId, id);
  }

  @Get('orders/:id/verify')
  @Permissions('radiology:view')
  async verifyReport(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.radiologyService.verifyReportIntegrity(user.hospitalId, id);
  }

  @Patch('orders/:id/report')
  @Permissions('radiology:manage')
  async reportOrder(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveRadiologyReportDto,
  ) {
    return this.radiologyService.completeOrderWithReport({
      hospitalId: req.user.hospitalId,
      radiologyOrderId: id,
      reportedById: req.user.sub,
      ...dto,
    });
  }

  @Post('orders/:id/sign')
  @AuditInTransaction()
  @Permissions('radiology:manage')
  async signOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveRadiologyReportDto,
  ) {
    return this.radiologyService.signReport(user.hospitalId, id, user.sub, dto);
  }

  @Post('orders/:id/addenda')
  @AuditInTransaction()
  @Permissions('radiology:manage')
  async addAddendum(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddRadiologyAddendumDto,
  ) {
    return this.radiologyService.addReportAddendum(
      user.hospitalId,
      id,
      user.sub,
      dto,
    );
  }

  @Post('orders/:id/cancel')
  @AuditInTransaction()
  @Permissions('radiology:manage')
  async cancelOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelRadiologyOrderDto,
  ) {
    return this.radiologyService.cancelOrder(
      user.hospitalId,
      id,
      user.sub,
      dto.reason,
    );
  }
}
