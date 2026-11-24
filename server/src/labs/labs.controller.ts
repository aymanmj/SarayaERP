// src/labs/labs.controller.ts

import type { Request } from 'express';
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
  UseGuards,
} from '@nestjs/common';
import { LabService } from './labs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { RequireFeature } from '../licensing/license.decorator';
import { AuditInTransaction } from '../audit/audit.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import {
  AmendLabOrderDto,
  CancelLabOrderDto,
  CompleteLabOrderDto,
  CreateLabOrdersDto,
  CreateLabReferenceRangeDto,
  CreateLabTestCatalogDto,
  RecordCriticalReadBackDto,
} from './dto/lab-modernization.dto';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

function auditMetaFromReq(req: Partial<AuthenticatedRequest>) {
  const ua = req.headers?.['user-agent'];
  return {
    ipAddress: req.ip,
    clientName: typeof ua === 'string' ? ua.slice(0, 120) : undefined,
  };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lab')
@RequireFeature('LAB')
export class LabController {
  constructor(private readonly labService: LabService) {}

  @Get('catalog')
  @Permissions('labs:view')
  async getCatalog(@Req() req: AuthenticatedRequest) {
    return this.labService.getCatalog(req.user.hospitalId);
  }

  @Post('catalog/tests')
  @Permissions('labs:manage')
  @AuditInTransaction()
  async createCatalogTest(
    @Body() dto: CreateLabTestCatalogDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.labService.createCatalogTest(
      req.user.hospitalId,
      req.user.sub,
      dto,
      auditMetaFromReq(req),
    );
  }

  @Get('catalog/reference-ranges')
  @Permissions('labs:view')
  async listReferenceRanges(
    @Req() req: AuthenticatedRequest,
    @Query('labTestId') labTestId?: string,
  ) {
    return this.labService.listReferenceRanges(
      req.user.hospitalId,
      labTestId ? Number(labTestId) : undefined,
    );
  }

  @Post('catalog/reference-ranges')
  @Permissions('labs:manage')
  @AuditInTransaction()
  async createReferenceRange(
    @Body() dto: CreateLabReferenceRangeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.labService.createReferenceRange(
      req.user.hospitalId,
      req.user.sub,
      dto,
      auditMetaFromReq(req),
    );
  }

  @Get('critical-notifications')
  @Permissions('labs:view')
  async listCriticalNotifications(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
  ) {
    return this.labService.listCriticalNotifications(
      req.user.hospitalId,
      status,
    );
  }

  @Post('critical-notifications/:id/read-back')
  @Permissions('labs:manage')
  @AuditInTransaction()
  async recordCriticalReadBack(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordCriticalReadBackDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.labService.recordCriticalReadBack(
      req.user.hospitalId,
      id,
      req.user.sub,
      dto,
      auditMetaFromReq(req),
    );
  }

  @Get('encounters/:encounterId/orders')
  @Permissions('labs:view')
  async listOrdersForEncounter(
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.labService.listOrdersForEncounter(
      encounterId,
      req.user.hospitalId,
    );
  }

  @Post('encounters/:encounterId/orders')
  @Permissions('labs:manage')
  async createOrdersForEncounter(
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Body() dto: CreateLabOrdersDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const doctorId = dto.doctorId ?? req.user.sub;
    return this.labService.createOrdersForEncounter({
      encounterId,
      hospitalId: req.user.hospitalId,
      doctorId,
      testIds: dto.testIds.map(Number),
      notes: dto.notes,
    });
  }

  @Get('worklist')
  @Permissions('labs:view')
  async worklist(@Req() req: AuthenticatedRequest) {
    return this.labService.getWorklist(req.user.hospitalId);
  }

  @Post('orders/:id/start')
  @Permissions('labs:manage')
  async startOrder(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.labService.startProcessing(
      req.user.hospitalId,
      id,
      req.user.sub,
    );
  }

  @Patch('orders/:id/complete')
  @Permissions('labs:manage')
  @AuditInTransaction()
  async completeOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteLabOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const payload: Parameters<LabService['completeOrder']>[0] = {
      hospitalId: req.user.hospitalId,
      labOrderId: id,
      performedById: req.user.sub,
      resultValue: dto.resultValue,
      resultUnit: dto.resultUnit,
      referenceRange: dto.referenceRange,
    };
    if (dto.parameters !== undefined) {
      payload.parameters = dto.parameters;
    }
    if (dto.verifyImmediately !== undefined) {
      payload.verifyImmediately = dto.verifyImmediately;
    }
    return this.labService.completeOrder(payload);
  }

  @Post('orders/:id/verify')
  @Permissions('lab:results:verify', 'labs:manage')
  @AuditInTransaction()
  async verifyOrder(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.labService.verifyOrder(
      req.user.hospitalId,
      id,
      req.user.sub,
      auditMetaFromReq(req),
    );
  }

  @Post('orders/:id/amend')
  @Permissions('lab:results:verify', 'labs:manage')
  @AuditInTransaction()
  async amendOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AmendLabOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.labService.amendOrder(
      req.user.hospitalId,
      id,
      req.user.sub,
      dto,
      auditMetaFromReq(req),
    );
  }

  @Post('orders/:id/cancel')
  @Permissions('labs:manage')
  @AuditInTransaction()
  async cancelOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelLabOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.labService.cancelOrder(
      req.user.hospitalId,
      id,
      req.user.sub,
      dto.reason,
      auditMetaFromReq(req),
    );
  }

  @Get('encounters/:id/print')
  @Permissions('labs:view')
  async getCumulativeReport(
    @Param('id', ParseIntPipe) encounterId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.labService.getCumulativeReport(
      req.user.hospitalId,
      encounterId,
    );
  }
}
