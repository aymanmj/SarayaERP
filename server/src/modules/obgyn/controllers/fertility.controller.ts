import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { FertilityService } from '../services/fertility.service';
import {
  CreateFertilityCaseDto,
  CreateIVFCycleDto,
  UpdateIVFCycleDto,
  CreateEmbryoDto,
  CreateFertilityMedicationDto,
  CreateSemenAnalysisDto,
  CreateAndrologyVisitDto,
  CreateCryoTankDto,
  CreateCryoCanisterDto,
  CreateCryoItemDto,
  ThawCryoItemDto,
  CreateHormoneTestDto,
  CreateAndrologySurgeryDto,
  CreateAndrologyMedicationDto,
  CreateAndrologyInvestigationDto,
} from '../dto/fertility.dto';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { Permissions } from '../../../auth/permissions.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { JwtPayload } from '../../../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('obgyn/fertility')
export class FertilityController {
  constructor(private readonly fertilityService: FertilityService) {}

  // ===================== Fertility Cases (Couple-Centric) =====================

  @Permissions('obgyn:manage')
  @Post('cases')
  async createCase(
    @Body() dto: CreateFertilityCaseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.createCase(user.hospitalId, dto);
  }

  @Permissions('obgyn:view')
  @Get('cases')
  async getActiveCases(@CurrentUser() user: JwtPayload) {
    return this.fertilityService.findActiveCases(user.hospitalId);
  }

  @Permissions('obgyn:view')
  @Get('cases/patient/:patientId')
  async getByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.fertilityService.findCasesByPatient(patientId);
  }

  @Permissions('obgyn:view')
  @Get('cases/:id')
  async getCase(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.findCase(user.hospitalId, id);
  }

  @Permissions('obgyn:manage')
  @Patch('cases/:id/status')
  async updateCaseStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.updateCaseStatus(user.hospitalId, id, status);
  }

  @Permissions('obgyn:manage')
  @Patch('cases/:id/link-male')
  async linkMalePatient(
    @Param('id', ParseIntPipe) id: number,
    @Body('malePatientId', ParseIntPipe) malePatientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.linkMalePatient(
      user.hospitalId,
      id,
      malePatientId,
    );
  }

  // ===================== IVF Cycles =====================

  @Permissions('obgyn:manage')
  @Post('cycles')
  async createCycle(
    @Body() dto: CreateIVFCycleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.createCycle(user.hospitalId, dto);
  }

  @Permissions('obgyn:view')
  @Get('cycles/:id')
  async getCycle(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getCycle(user.hospitalId, id);
  }

  @Permissions('obgyn:manage')
  @Patch('cycles/:id')
  async updateCycle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIVFCycleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.updateCycle(user.hospitalId, id, dto);
  }

  // ===================== Embryos =====================

  @Post('embryos')
  @Permissions('obgyn:manage')
  async addEmbryo(
    @Body() dto: CreateEmbryoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.addEmbryo(user.hospitalId, dto);
  }

  @Patch('embryos/:id/status')
  @Permissions('obgyn:manage')
  async updateEmbryoStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.updateEmbryoStatus(
      user.hospitalId,
      id,
      status,
    );
  }

  // ===================== Medications =====================

  @Post('medications')
  @Permissions('obgyn:manage')
  async addMedication(
    @Body() dto: CreateFertilityMedicationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.addMedication(user.hospitalId, dto);
  }

  // ===================== Semen Analysis (Ø£Ù…Ø±Ø§Ø¶ Ø§Ù„Ø°ÙƒÙˆØ±Ø©) =====================

  @Post('semen-analysis')
  @Permissions('obgyn:manage')
  async createSemenAnalysis(
    @Body() dto: CreateSemenAnalysisDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.createSemenAnalysis(user.hospitalId, dto);
  }

  @Get('semen-analysis/patient/:patientId')
  @Permissions('obgyn:view')
  async getSemenAnalyses(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getSemenAnalyses(user.hospitalId, patientId);
  }

  // ===================== Andrology Visits =====================

  @Post('andrology')
  @Permissions('obgyn:manage')
  async createAndrologyVisit(
    @Body() dto: CreateAndrologyVisitDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.createAndrologyVisit(user.hospitalId, dto);
  }

  @Get('andrology/patient/:patientId')
  @Permissions('obgyn:view')
  async getAndrologyVisits(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getAndrologyVisits(user.hospitalId, patientId);
  }

  // ===================== Hormone Tests =====================

  @Post('hormone-tests')
  @Permissions('obgyn:manage')
  async createHormoneTest(
    @Body() dto: CreateHormoneTestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.createHormoneTest(user.hospitalId, dto);
  }

  @Get('hormone-tests/patient/:patientId')
  @Permissions('obgyn:view')
  async getHormoneTests(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getHormoneTests(user.hospitalId, patientId);
  }

  // ===================== Andrology Surgeries =====================
  @Post('andrology/surgeries')
  @Permissions('obgyn:manage')
  async createAndrologySurgery(
    @Body() dto: CreateAndrologySurgeryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.createAndrologySurgery(user.hospitalId, dto);
  }

  @Get('andrology/surgeries/patient/:patientId')
  @Permissions('obgyn:view')
  async getAndrologySurgeries(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getAndrologySurgeries(
      user.hospitalId,
      patientId,
    );
  }

  // ===================== Andrology Medications =====================
  @Post('andrology/medications')
  @Permissions('obgyn:manage')
  async createAndrologyMedication(
    @Body() dto: CreateAndrologyMedicationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.createAndrologyMedication(
      user.hospitalId,
      dto,
    );
  }

  @Get('andrology/medications/patient/:patientId')
  @Permissions('obgyn:view')
  async getAndrologyMedications(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getAndrologyMedications(
      user.hospitalId,
      patientId,
    );
  }

  // ===================== Andrology Investigations =====================
  @Post('andrology/investigations')
  @Permissions('obgyn:manage')
  async createAndrologyInvestigation(
    @Body() dto: CreateAndrologyInvestigationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.createAndrologyInvestigation(
      user.hospitalId,
      dto,
    );
  }

  @Get('andrology/investigations/patient/:patientId')
  @Permissions('obgyn:view')
  async getAndrologyInvestigations(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getAndrologyInvestigations(
      user.hospitalId,
      patientId,
    );
  }

  // ===================== Cryo Bank =====================

  @Post('cryo/tanks')
  @Permissions('obgyn:manage')
  async createCryoTank(
    @Body() dto: CreateCryoTankDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.createCryoTank(user.hospitalId, dto);
  }

  @Get('cryo/tanks')
  @Permissions('obgyn:view')
  async getCryoTanks(@CurrentUser() user: JwtPayload) {
    return this.fertilityService.getCryoTanks(user.hospitalId);
  }

  @Post('cryo/canisters')
  @Permissions('obgyn:manage')
  async addCryoCanister(
    @Body() dto: CreateCryoCanisterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.addCryoCanister(user.hospitalId, dto);
  }

  @Post('cryo/items')
  @Permissions('obgyn:manage')
  async addCryoItem(
    @Body() dto: CreateCryoItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.addCryoItem(user.hospitalId, dto);
  }

  @Patch('cryo/items/:id/thaw')
  @Permissions('obgyn:manage')
  async thawCryoItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ThawCryoItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.thawCryoItem(user.hospitalId, id, dto);
  }

  @Patch('cryo/items/:id/discard')
  @Permissions('obgyn:manage')
  async discardCryoItem(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.discardCryoItem(user.hospitalId, id);
  }

  @Get('cryo/patient/:patientId')
  @Permissions('obgyn:view')
  async getCryoByPatient(
    @Param('patientId', ParseIntPipe) patientId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fertilityService.getCryoItemsByPatient(
      user.hospitalId,
      patientId,
    );
  }
}
