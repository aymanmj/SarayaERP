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
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { QualityService } from './quality.service';
import { CreateIncidentDto, UpdateIncidentDto } from './dto/create-incident.dto';
import { CreateCapaDto, UpdateCapaDto, VerifyCapaDto } from './dto/create-capa.dto';
import { IncidentStatus, IncidentSeverity } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('quality')
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  // ─── Dashboard ────────────────────────────────────────
  @Get('dashboard')
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
  findOneIncident(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.qualityService.findOne(user.hospitalId, id);
  }

  @Patch('incidents/:id')
  updateIncident(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.qualityService.updateIncident(user.hospitalId, id, dto, user.sub);
  }

  @Patch('incidents/:id/close')
  closeIncident(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.qualityService.closeIncident(user.hospitalId, id, user.sub);
  }

  // ─── CAPA ─────────────────────────────────────────────
  @Post('capa')
  addCapa(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCapaDto,
  ) {
    return this.qualityService.addCapaAction(user.hospitalId, dto);
  }

  @Patch('capa/:id')
  updateCapa(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCapaDto,
  ) {
    return this.qualityService.updateCapaAction(user.hospitalId, id, dto, user.sub);
  }

  @Patch('capa/:id/verify')
  verifyCapa(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyCapaDto,
  ) {
    return this.qualityService.verifyCapaAction(user.hospitalId, id, dto, user.sub);
  }
}
