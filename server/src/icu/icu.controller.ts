import { Controller, Post, Body, Param, Get, Query, Req, UseGuards, ParseIntPipe, Put } from '@nestjs/common';
import { IcuService } from './icu.service';
import { RecordVitalsDto } from './dto/icu.dto';
import { DailyAssessmentDto } from './dto/icu-assessment.dto';
import { CreateMedicationDripDto, TitrateDripDto } from './dto/icu-drip.dto';
import { CreateEquipmentUsageDto } from './dto/icu-equipment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; 

@Controller('icu')
@UseGuards(JwtAuthGuard)
export class IcuController {
  constructor(private readonly icuService: IcuService) {}

  // ==========================================
  // DASHBOARD
  // ==========================================
  @Get('dashboard/stats')
  async getDashboardStats(@Req() req: any) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getIcuDashboardStats(hospitalId);
  }

  @Get('patients')
  async getIcuPatients(@Req() req: any) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getIcuPatients(hospitalId);
  }

  // ==========================================
  // FLOWSHEET
  // ==========================================
  @Post('flowsheet')
  async recordEntry(@Req() req: any, @Body() dto: RecordVitalsDto) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.recordFlowsheetEntry(hospitalId, userId, dto);
  }

  @Get('flowsheet/:encounterId')
  async getFlowsheet(
    @Req() req: any, 
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Query('date') date: string
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getFlowsheet(hospitalId, encounterId, date || new Date().toISOString());
  }

  @Get('io-balance/:encounterId')
  async getIOBalance(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Query('date') date: string
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getCumulativeIO(hospitalId, encounterId, date || new Date().toISOString());
  }

  // ==========================================
  // DAILY CLINICAL ASSESSMENTS
  // ==========================================
  @Post('assessments')
  async createDailyAssessment(@Req() req: any, @Body() dto: DailyAssessmentDto) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.createDailyAssessment(hospitalId, userId, dto);
  }

  @Get('assessments/:encounterId')
  async getDailyAssessments(@Req() req: any, @Param('encounterId', ParseIntPipe) encounterId: number) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getDailyAssessments(hospitalId, encounterId);
  }

  // ==========================================
  // MEDICATION DRIPS
  // ==========================================
  @Post('drips')
  async createMedicationDrip(@Req() req: any, @Body() dto: CreateMedicationDripDto) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.createMedicationDrip(hospitalId, userId, dto);
  }

  @Put('drips/:dripId/titrate')
  async titrateDrip(
    @Req() req: any, 
    @Param('dripId', ParseIntPipe) dripId: number,
    @Body() dto: TitrateDripDto
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.titrateDrip(hospitalId, dripId, userId, dto);
  }

  @Put('drips/:dripId/stop')
  async stopDrip(
    @Req() req: any, 
    @Param('dripId', ParseIntPipe) dripId: number,
    @Body() body: { reason?: string }
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.stopDrip(hospitalId, dripId, userId, body.reason);
  }

  @Get('drips/:encounterId')
  async getActiveDrips(@Req() req: any, @Param('encounterId', ParseIntPipe) encounterId: number) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getActiveDrips(hospitalId, encounterId);
  }

  // ==========================================
  // EQUIPMENT USAGE
  // ==========================================
  @Post('equipment')
  async createEquipmentUsage(@Req() req: any, @Body() dto: CreateEquipmentUsageDto) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.createEquipmentUsage(hospitalId, dto);
  }

  @Put('equipment/:usageId/stop')
  async stopEquipmentUsage(@Req() req: any, @Param('usageId', ParseIntPipe) usageId: number) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.stopEquipmentUsage(hospitalId, usageId);
  }

  @Get('equipment/:encounterId')
  async getEquipmentUsage(@Req() req: any, @Param('encounterId', ParseIntPipe) encounterId: number) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getEquipmentUsage(hospitalId, encounterId);
  }

  // ==========================================
  // NICU SEPARATION
  // ==========================================
  @Post('nicu/separate/:motherId')
  async separateNewborn(
    @Req() req: any,
    @Param('motherId', ParseIntPipe) motherId: number,
    @Body() details: any
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.separateNewbornPatient(hospitalId, userId, motherId, details);
  }
}
