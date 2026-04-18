/**
 * Patient Portal — Medical Records Controller
 * 
 * Read-only access to the patient's complete medical history.
 * All endpoints enforce patient-scoped isolation via PatientAuthGuard.
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatientPortalService } from '../patient-portal.service';
import { PatientAuthGuard } from '../auth/patient-auth.guard';
import { CurrentPatient } from '../auth/current-patient.decorator';

@ApiTags('Patient Portal — Medical Records')
@ApiBearerAuth()
@UseGuards(PatientAuthGuard)
@Controller('patient-portal/v1/medical')
export class PortalMedicalController {
  constructor(private readonly portalService: PatientPortalService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'لوحة المعلومات', description: 'ملخص شامل — الموعد القادم، آخر النتائج، الرصيد، التأمين' })
  async getDashboard(@CurrentPatient() patient: any) {
    return this.portalService.getDashboard(patient.sub, patient.hospitalId);
  }

  @Get('profile')
  @ApiOperation({ summary: 'الملف الشخصي الكامل' })
  async getProfile(@CurrentPatient() patient: any) {
    return this.portalService.getProfile(patient.sub, patient.hospitalId);
  }

  @Get('vitals')
  @ApiOperation({ summary: 'سجل العلامات الحيوية' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getVitals(
    @CurrentPatient() patient: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.portalService.getVitals(patient.sub, Number(page) || 1, Number(limit) || 20);
  }

  @Get('vitals/:id')
  @ApiOperation({ summary: 'تفصيل قراءة علامات حيوية' })
  async getVitalById(
    @CurrentPatient() patient: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portalService.getVitalById(patient.sub, id);
  }

  @Get('lab-results')
  @ApiOperation({ summary: 'نتائج المختبر' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLabResults(
    @CurrentPatient() patient: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.portalService.getLabResults(patient.sub, Number(page) || 1, Number(limit) || 20);
  }

  @Get('lab-results/:id')
  @ApiOperation({ summary: 'تفصيل نتيجة مختبر' })
  async getLabResultById(
    @CurrentPatient() patient: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portalService.getLabResultById(patient.sub, id);
  }

  @Get('medications')
  @ApiOperation({ summary: 'الأدوية والوصفات' })
  async getMedications(@CurrentPatient() patient: any) {
    return this.portalService.getMedications(patient.sub);
  }

  @Get('allergies')
  @ApiOperation({ summary: 'الحساسيات' })
  async getAllergies(@CurrentPatient() patient: any) {
    return this.portalService.getAllergies(patient.sub);
  }

  @Get('diagnoses')
  @ApiOperation({ summary: 'التشخيصات والمشاكل الطبية' })
  async getDiagnoses(@CurrentPatient() patient: any) {
    return this.portalService.getDiagnoses(patient.sub);
  }

  @Get('encounters')
  @ApiOperation({ summary: 'سجل الزيارات' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEncounters(
    @CurrentPatient() patient: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.portalService.getEncounters(patient.sub, Number(page) || 1, Number(limit) || 20);
  }

  @Get('encounters/:id')
  @ApiOperation({ summary: 'تفاصيل زيارة' })
  async getEncounterById(
    @CurrentPatient() patient: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portalService.getEncounterById(patient.sub, id);
  }
}
