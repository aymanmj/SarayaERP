import {
  Controller, Post, Get, Patch, Body, Param, ParseIntPipe, UseGuards, Query,
} from '@nestjs/common';
import { FertilityService } from '../services/fertility.service';
import {
  CreateFertilityCaseDto, CreateIVFCycleDto, UpdateIVFCycleDto,
  CreateEmbryoDto, CreateFertilityMedicationDto,
} from '../dto/fertility.dto';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { JwtPayload } from '../../../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('obgyn/fertility')
export class FertilityController {
  constructor(private readonly fertilityService: FertilityService) {}

  // === Cases ===

  @Post('cases')
  @Roles('ADMIN', 'DOCTOR')
  async createCase(@Body() dto: CreateFertilityCaseDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.createCase(user.hospitalId, dto);
  }

  @Get('cases')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getActiveCases(@CurrentUser() user: JwtPayload) {
    return this.fertilityService.findActiveCases(user.hospitalId);
  }

  @Get('cases/patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.fertilityService.findCasesByPatient(patientId);
  }

  @Get('cases/:id')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getCase(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.findCase(user.hospitalId, id);
  }

  @Patch('cases/:id/status')
  @Roles('ADMIN', 'DOCTOR')
  async updateCaseStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.updateCaseStatus(user.hospitalId, id, status);
  }

  // === Cycles ===

  @Post('cycles')
  @Roles('ADMIN', 'DOCTOR')
  async createCycle(@Body() dto: CreateIVFCycleDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.createCycle(user.hospitalId, dto);
  }

  @Get('cycles/:id')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getCycle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.getCycle(user.hospitalId, id);
  }

  @Patch('cycles/:id')
  @Roles('ADMIN', 'DOCTOR')
  async updateCycle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIVFCycleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.updateCycle(user.hospitalId, id, dto);
  }

  // === Embryos ===

  @Post('embryos')
  @Roles('ADMIN', 'DOCTOR')
  async addEmbryo(@Body() dto: CreateEmbryoDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.addEmbryo(user.hospitalId, dto);
  }

  @Patch('embryos/:id/status')
  @Roles('ADMIN', 'DOCTOR')
  async updateEmbryoStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.updateEmbryoStatus(user.hospitalId, id, status);
  }

  // === Medications ===

  @Post('medications')
  @Roles('ADMIN', 'DOCTOR')
  async addMedication(@Body() dto: CreateFertilityMedicationDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.addMedication(user.hospitalId, dto);
  }
}
