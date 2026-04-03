// src/clinical-profile/clinical-profile.controller.ts
// =====================================================================
// Patient Clinical Profile REST API
// =====================================================================

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicalProfileService } from './clinical-profile.service';
import {
  CreateProblemDto,
  UpdateProblemDto,
  UpsertMedicalHistoryDto,
  CreatePMHEntryDto,
  CreateSurgicalEntryDto,
  CreateFamilyHistoryDto,
  CreateHomeMedicationDto,
  UpdateHomeMedicationDto,
} from './dto/clinical-profile.dto';

@Controller('patients/:patientId')
@UseGuards(JwtAuthGuard)
export class ClinicalProfileController {
  constructor(private readonly service: ClinicalProfileService) {}

  // ======================== Clinical Summary ========================

  @Get('clinical-summary')
  async getClinicalSummary(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Request() req: any,
  ) {
    return this.service.getClinicalSummary(patientId, req.user.hospitalId);
  }

  // ======================== Problem List ========================

  @Get('problems')
  async getProblems(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Request() req: any,
  ) {
    return this.service.getProblems(patientId, req.user.hospitalId);
  }

  @Post('problems')
  async createProblem(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: CreateProblemDto,
    @Request() req: any,
  ) {
    return this.service.createProblem(patientId, req.user.hospitalId, req.user.id, dto);
  }

  @Patch('problems/:problemId')
  async updateProblem(
    @Param('problemId', ParseIntPipe) problemId: number,
    @Body() dto: UpdateProblemDto,
    @Request() req: any,
  ) {
    return this.service.updateProblem(problemId, req.user.hospitalId, dto);
  }

  @Delete('problems/:problemId')
  async deleteProblem(
    @Param('problemId', ParseIntPipe) problemId: number,
    @Request() req: any,
  ) {
    return this.service.deleteProblem(problemId, req.user.hospitalId);
  }

  // ======================== Medical History ========================

  @Get('medical-history')
  async getMedicalHistory(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Request() req: any,
  ) {
    return this.service.getMedicalHistory(patientId, req.user.hospitalId);
  }

  @Put('medical-history')
  async upsertMedicalHistory(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: UpsertMedicalHistoryDto,
    @Request() req: any,
  ) {
    return this.service.upsertMedicalHistory(patientId, req.user.hospitalId, dto);
  }

  // ======================== PMH Entries ========================

  @Post('pmh-entries')
  async createPMHEntry(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: CreatePMHEntryDto,
    @Request() req: any,
  ) {
    return this.service.createPMHEntry(patientId, req.user.hospitalId, dto);
  }

  @Delete('pmh-entries/:entryId')
  async deletePMHEntry(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Request() req: any,
  ) {
    return this.service.deletePMHEntry(entryId, req.user.hospitalId);
  }

  // ======================== Surgical Entries ========================

  @Post('surgical-entries')
  async createSurgicalEntry(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: CreateSurgicalEntryDto,
    @Request() req: any,
  ) {
    return this.service.createSurgicalEntry(patientId, req.user.hospitalId, dto);
  }

  @Delete('surgical-entries/:entryId')
  async deleteSurgicalEntry(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Request() req: any,
  ) {
    return this.service.deleteSurgicalEntry(entryId, req.user.hospitalId);
  }

  // ======================== Family History ========================

  @Post('family-history')
  async createFamilyHistoryEntry(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: CreateFamilyHistoryDto,
    @Request() req: any,
  ) {
    return this.service.createFamilyHistoryEntry(patientId, req.user.hospitalId, dto);
  }

  @Delete('family-history/:entryId')
  async deleteFamilyHistoryEntry(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Request() req: any,
  ) {
    return this.service.deleteFamilyHistoryEntry(entryId, req.user.hospitalId);
  }

  // ======================== Home Medications ========================

  @Get('home-medications')
  async getHomeMedications(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Request() req: any,
  ) {
    return this.service.getHomeMedications(patientId, req.user.hospitalId);
  }

  @Post('home-medications')
  async createHomeMedication(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: CreateHomeMedicationDto,
    @Request() req: any,
  ) {
    return this.service.createHomeMedication(patientId, req.user.hospitalId, req.user.id, dto);
  }

  @Patch('home-medications/:medicationId')
  async updateHomeMedication(
    @Param('medicationId', ParseIntPipe) medicationId: number,
    @Body() dto: UpdateHomeMedicationDto,
    @Request() req: any,
  ) {
    return this.service.updateHomeMedication(medicationId, req.user.hospitalId, dto);
  }

  @Post('home-medications/:medicationId/verify')
  async verifyHomeMedication(
    @Param('medicationId', ParseIntPipe) medicationId: number,
    @Request() req: any,
  ) {
    return this.service.verifyHomeMedication(medicationId, req.user.hospitalId, req.user.id);
  }

  @Delete('home-medications/:medicationId')
  async deleteHomeMedication(
    @Param('medicationId', ParseIntPipe) medicationId: number,
    @Request() req: any,
  ) {
    return this.service.deleteHomeMedication(medicationId, req.user.hospitalId);
  }
}
