import {
  Controller, Post, Get, Patch, Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { FertilityService } from '../services/fertility.service';
import {
  CreateFertilityCaseDto, CreateIVFCycleDto, UpdateIVFCycleDto,
  CreateEmbryoDto, CreateFertilityMedicationDto,
  CreateSemenAnalysisDto, CreateAndrologyVisitDto,
  CreateCryoTankDto, CreateCryoCanisterDto, CreateCryoItemDto, ThawCryoItemDto,
  CreateHormoneTestDto, CreateAndrologySurgeryDto, CreateAndrologyMedicationDto
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

  // ===================== Fertility Cases (Couple-Centric) =====================

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

  @Patch('cases/:id/link-male')
  @Roles('ADMIN', 'DOCTOR')
  async linkMalePatient(
    @Param('id', ParseIntPipe) id: number,
    @Body('malePatientId', ParseIntPipe) malePatientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.linkMalePatient(user.hospitalId, id, malePatientId);
  }

  // ===================== IVF Cycles =====================

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

  // ===================== Embryos =====================

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

  // ===================== Medications =====================

  @Post('medications')
  @Roles('ADMIN', 'DOCTOR')
  async addMedication(@Body() dto: CreateFertilityMedicationDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.addMedication(user.hospitalId, dto);
  }

  // ===================== Semen Analysis (أمراض الذكورة) =====================

  @Post('semen-analysis')
  @Roles('ADMIN', 'DOCTOR')
  async createSemenAnalysis(@Body() dto: CreateSemenAnalysisDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.createSemenAnalysis(user.hospitalId, dto);
  }

  @Get('semen-analysis/patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getSemenAnalyses(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getSemenAnalyses(user.hospitalId, patientId);
  }

  // ===================== Andrology Visits =====================

  @Post('andrology')
  @Roles('ADMIN', 'DOCTOR')
  async createAndrologyVisit(@Body() dto: CreateAndrologyVisitDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.createAndrologyVisit(user.hospitalId, dto);
  }

  @Get('andrology/patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getAndrologyVisits(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getAndrologyVisits(user.hospitalId, patientId);
  }

  // ===================== Hormone Tests =====================

  @Post('hormone-tests')
  @Roles('ADMIN', 'DOCTOR')
  async createHormoneTest(@Body() dto: CreateHormoneTestDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.createHormoneTest(user.hospitalId, dto);
  }

  @Get('hormone-tests/patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getHormoneTests(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getHormoneTests(user.hospitalId, patientId);
  }

  // ===================== Andrology Surgeries =====================
  @Post('andrology/surgeries')
  @Roles('ADMIN', 'DOCTOR')
  async createAndrologySurgery(@Body() dto: CreateAndrologySurgeryDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.createAndrologySurgery(user.hospitalId, dto);
  }

  @Get('andrology/surgeries/patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getAndrologySurgeries(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getAndrologySurgeries(user.hospitalId, patientId);
  }

  // ===================== Andrology Medications =====================
  @Post('andrology/medications')
  @Roles('ADMIN', 'DOCTOR')
  async createAndrologyMedication(@Body() dto: CreateAndrologyMedicationDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.createAndrologyMedication(user.hospitalId, dto);
  }

  @Get('andrology/medications/patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getAndrologyMedications(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getAndrologyMedications(user.hospitalId, patientId);
  }

  // ===================== Cryo Bank =====================

  @Post('cryo/tanks')
  @Roles('ADMIN')
  async createCryoTank(@Body() dto: CreateCryoTankDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.createCryoTank(user.hospitalId, dto);
  }

  @Get('cryo/tanks')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getCryoTanks(@CurrentUser() user: JwtPayload) {
    return this.fertilityService.getCryoTanks(user.hospitalId);
  }

  @Post('cryo/canisters')
  @Roles('ADMIN')
  async addCryoCanister(@Body() dto: CreateCryoCanisterDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.addCryoCanister(user.hospitalId, dto);
  }

  @Post('cryo/items')
  @Roles('ADMIN', 'DOCTOR')
  async addCryoItem(@Body() dto: CreateCryoItemDto, @CurrentUser() user: JwtPayload) {
    return this.fertilityService.addCryoItem(user.hospitalId, dto);
  }

  @Patch('cryo/items/:id/thaw')
  @Roles('ADMIN', 'DOCTOR')
  async thawCryoItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ThawCryoItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.thawCryoItem(user.hospitalId, id, dto);
  }

  @Patch('cryo/items/:id/discard')
  @Roles('ADMIN', 'DOCTOR')
  async discardCryoItem(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.discardCryoItem(user.hospitalId, id);
  }

  @Get('cryo/patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async getCryoByPatient(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getCryoItemsByPatient(user.hospitalId, patientId);
  }
}
