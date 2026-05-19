// src/quality/quality.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { QualityService } from './quality.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
} from './dto/create-incident.dto';
import {
  CreateCapaDto,
  UpdateCapaDto,
  VerifyCapaDto,
} from './dto/create-capa.dto';
import { IncidentStatus, IncidentSeverity } from '@prisma/client';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('quality')
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  // ─── Dashboard ────────────────────────────────────────
  @Get('dashboard')
  @Permissions('quality:view', 'quality:manage')
  getDashboard(@CurrentUser() user: JwtPayload) {
    return this.qualityService.getDashboardStats(user.hospitalId);
  }

  // ─── My CAPA Tasks ────────────────────────────────────
  @Get('my-capa-tasks')
  getMyCapaTasks(@CurrentUser() user: JwtPayload) {
    return this.qualityService.getMyCapaTasks(user.sub);
  }

  // ─── Incidents ────────────────────────────────────────
  @Get('incidents')
  @Permissions('quality:view', 'quality:manage')
  findAllIncidents(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: IncidentStatus,
    @Query('severity') severity?: IncidentSeverity,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.qualityService.findAll({
      hospitalId: user.hospitalId,
      status,
      severity,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Post('incidents')
  reportIncident(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateIncidentDto,
  ) {
    return this.qualityService.reportIncident(user.hospitalId, user.sub, dto);
  }

  @Get('incidents/:id')
  @Permissions('quality:view', 'quality:manage')
  findOneIncident(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.qualityService.findOne(user.hospitalId, id);
  }

  @Patch('incidents/:id')
  @Permissions('quality:manage')
  updateIncident(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.qualityService.updateIncident(
      user.hospitalId,
      id,
      dto,
      user.sub,
    );
  }

  @Patch('incidents/:id/close')
  @Permissions('quality:manage')
  closeIncident(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.qualityService.closeIncident(user.hospitalId, id, user.sub);
  }

  // ─── CAPA ─────────────────────────────────────────────
  @Post('capa')
  @Permissions('quality:manage')
  addCapa(@CurrentUser() user: JwtPayload, @Body() dto: CreateCapaDto) {
    return this.qualityService.addCapaAction(user.hospitalId, dto);
  }

  @Patch('capa/:id')
  @Permissions('quality:manage')
  updateCapa(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCapaDto,
  ) {
    return this.qualityService.updateCapaAction(
      user.hospitalId,
      id,
      dto,
      user.sub,
    );
  }

  @Patch('capa/:id/verify')
  @Permissions('quality:manage')
  verifyCapa(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyCapaDto,
  ) {
    return this.qualityService.verifyCapaAction(
      user.hospitalId,
      id,
      dto,
      user.sub,
    );
  }
}
