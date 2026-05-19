import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { IcuService } from './icu.service';
import { RecordVitalsDto } from './dto/icu.dto';
import { DailyAssessmentDto } from './dto/icu-assessment.dto';
import { CreateMedicationDripDto, TitrateDripDto } from './dto/icu-drip.dto';
import { CreateEquipmentUsageDto } from './dto/icu-equipment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';

@Controller('icu')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IcuController {
  constructor(private readonly icuService: IcuService) {}

  // ==========================================
  // DASHBOARD
  // ==========================================
  @Permissions('icu:view')
  @Get('dashboard/stats')
  async getDashboardStats(@Req() req: any) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getIcuDashboardStats(hospitalId);
  }

  @Permissions('icu:view')
  @Get('patients')
  async getIcuPatients(@Req() req: any) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getIcuPatients(hospitalId);
  }

  // ==========================================
  // FLOWSHEET
  // ==========================================
  @Permissions('icu:manage')
  @Post('flowsheet')
  async recordEntry(@Req() req: any, @Body() dto: RecordVitalsDto) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.recordFlowsheetEntry(hospitalId, userId, dto);
  }

  @Permissions('icu:view')
  @Get('flowsheet/:encounterId')
  async getFlowsheet(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Query('date') date: string,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getFlowsheet(
      hospitalId,
      encounterId,
      date || new Date().toISOString(),
    );
  }

  @Permissions('icu:view')
  @Get('io-balance/:encounterId')
  async getIOBalance(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Query('date') date: string,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getCumulativeIO(
      hospitalId,
      encounterId,
      date || new Date().toISOString(),
    );
  }

  // ==========================================
  // DAILY CLINICAL ASSESSMENTS
  // ==========================================
  @Permissions('icu:manage')
  @Post('assessments')
  async createDailyAssessment(
    @Req() req: any,
    @Body() dto: DailyAssessmentDto,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.createDailyAssessment(hospitalId, userId, dto);
  }

  @Permissions('icu:view')
  @Get('assessments/:encounterId')
  async getDailyAssessments(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getDailyAssessments(hospitalId, encounterId);
  }

  // ==========================================
  // MEDICATION DRIPS
  // ==========================================
  @Permissions('icu:manage')
  @Post('drips')
  async createMedicationDrip(
    @Req() req: any,
    @Body() dto: CreateMedicationDripDto,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.createMedicationDrip(hospitalId, userId, dto);
  }

  @Permissions('icu:manage')
  @Put('drips/:dripId/titrate')
  async titrateDrip(
    @Req() req: any,
    @Param('dripId', ParseIntPipe) dripId: number,
    @Body() dto: TitrateDripDto,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.titrateDrip(hospitalId, dripId, userId, dto);
  }

  @Permissions('icu:manage')
  @Put('drips/:dripId/stop')
  async stopDrip(
    @Req() req: any,
    @Param('dripId', ParseIntPipe) dripId: number,
    @Body() body: { reason?: string },
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.stopDrip(hospitalId, dripId, userId, body.reason);
  }

  @Permissions('icu:view')
  @Get('drips/:encounterId')
  async getActiveDrips(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getActiveDrips(hospitalId, encounterId);
  }

  // ==========================================
  // EQUIPMENT USAGE
  // ==========================================
  @Permissions('icu:manage')
  @Post('equipment')
  async createEquipmentUsage(
    @Req() req: any,
    @Body() dto: CreateEquipmentUsageDto,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.createEquipmentUsage(hospitalId, dto);
  }

  @Permissions('icu:manage')
  @Put('equipment/:usageId/stop')
  async stopEquipmentUsage(
    @Req() req: any,
    @Param('usageId', ParseIntPipe) usageId: number,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.stopEquipmentUsage(hospitalId, usageId);
  }

  @Permissions('icu:view')
  @Get('equipment/:encounterId')
  async getEquipmentUsage(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getEquipmentUsage(hospitalId, encounterId);
  }

  // ==========================================
  // FLUID BALANCE TRENDING
  // ==========================================
  @Permissions('icu:view')
  @Get('fluid-balance/trend/:encounterId')
  async getFluidBalanceTrend(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Query('days') days?: string,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getFluidBalanceTrend(
      hospitalId,
      encounterId,
      days ? parseInt(days, 10) : 7,
    );
  }

  // ==========================================
  // VENTILATOR SETTINGS
  // ==========================================
  @Permissions('icu:manage')
  @Post('ventilator/settings')
  async recordVentilatorSettings(@Req() req: any, @Body() dto: any) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.recordVentilatorSettings(hospitalId, userId, dto);
  }

  @Permissions('icu:view')
  @Get('ventilator/history/:encounterId')
  async getVentilatorHistory(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getVentilatorHistory(hospitalId, encounterId);
  }

  // ==========================================
  // NICU SEPARATION
  // ==========================================
  @Permissions('icu:manage')
  @Post('nicu/separate/:motherId')
  async separateNewborn(
    @Req() req: any,
    @Param('motherId', ParseIntPipe) motherId: number,
    @Body() details: any,
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.separateNewbornPatient(
      hospitalId,
      userId,
      motherId,
      details,
    );
  }
}
