// src/cdss/cdss.controller.ts
// =====================================================================
// واجهة برمجة التطبيقات لنظام دعم القرار السريري
// =====================================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CDSSService } from './cdss.service';
import type { PrescriptionCheckInput } from './cdss.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { RequireFeature } from '../licensing/license.decorator';
import {
  CheckLabResultDto,
  CheckVitalsDto,
  OverrideAlertDto,
  PrescriptionCheckDto,
} from './cdss.dto';

@ApiTags('CDSS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cdss')
@RequireFeature('CDSS')
export class CDSSController {
  constructor(private readonly cdssService: CDSSService) {}

  // ======================== السياق السريري ========================

  @ApiOperation({ summary: 'جلب السياق السريري الكامل للمريض' })
  @ApiParam({ name: 'patientId', description: 'معرف المريض' })
  @Get('context/:patientId')
  async getPatientClinicalContext(
    @CurrentUser() user: any,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.cdssService.getPatientClinicalContext(user.hospitalId, patientId);
  }

  @ApiOperation({ summary: 'جلب الأدوية الحالية للمريض' })
  @ApiParam({ name: 'patientId', description: 'معرف المريض' })
  @Get('patient/:patientId/medications')
  async getPatientMedications(
    @CurrentUser() user: any,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.cdssService.getPatientCurrentMedications(user.hospitalId, patientId);
  }

  // ======================== فحص الوصفات ========================

  @ApiOperation({ summary: 'فحص شامل للوصفة الطبية قبل الحفظ' })
  @Post('check-prescription')
  async checkPrescription(
    @CurrentUser() user: any,
    @Body() input: PrescriptionCheckDto,
  ) {
    const checkInput: PrescriptionCheckInput = {
      ...input,
      hospitalId: user.hospitalId,
    };
    return this.cdssService.checkPrescription(checkInput);
  }

  @ApiOperation({ summary: 'فحص التفاعلات الدوائية فقط' })
  @Post('check-interactions')
  async checkDrugInteractions(@Body() body: { drugs: string[] }) {
    return this.cdssService.checkDrugInteractions(body.drugs);
  }

  // ======================== فحص نتائج المختبر ========================

  @ApiOperation({ summary: 'فحص نتيجة مختبرية وإنشاء تنبيه إذا كانت حرجة' })
  @Post('check-lab-result')
  async checkLabResult(
    @CurrentUser() user: any,
    @Body() input: CheckLabResultDto,
  ) {
    return this.cdssService.checkLabResultAndAlert({
      ...input,
      hospitalId: user.hospitalId,
    });
  }

  // ======================== فحص العلامات الحيوية ========================

  @ApiOperation({ summary: 'فحص العلامات الحيوية وإنشاء تنبيهات إذا كانت حرجة' })
  @Post('check-vitals')
  async checkVitals(
    @CurrentUser() user: any,
    @Body() input: CheckVitalsDto,
  ) {
    return this.cdssService.checkVitalsAndAlert({
      ...input,
      hospitalId: user.hospitalId,
    });
  }

  // ======================== التنبيهات ========================

  @ApiOperation({ summary: 'جلب تنبيهات المريض النشطة' })
  @ApiParam({ name: 'patientId', description: 'معرف المريض' })
  @Get('alerts/patient/:patientId')
  async getPatientAlerts(
    @CurrentUser() user: any,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.cdssService.getPatientActiveAlerts(user.hospitalId, patientId);
  }

  @ApiOperation({ summary: 'الاعتراف بالتنبيه' })
  @ApiParam({ name: 'id', description: 'معرف التنبيه' })
  @Post('alerts/:id/acknowledge')
  async acknowledgeAlert(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) alertId: number,
  ) {
    return this.cdssService.acknowledgeAlert(alertId, user.sub);
  }

  @ApiOperation({ summary: 'تجاوز التنبيه مع سبب' })
  @ApiParam({ name: 'id', description: 'معرف التنبيه' })
  @Post('alerts/:id/override')
  async overrideAlert(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) alertId: number,
    @Body() body: OverrideAlertDto,
  ) {
    return this.cdssService.overrideAlert(alertId, user.sub, body.reason);
  }

  // ======================== قاعدة المعرفة ========================

  @ApiOperation({ summary: 'البحث في التفاعلات الدوائية' })
  @Get('interactions')
  async searchInteractions(
    @Query('drug') drug: string,
    @Query('limit') limit = '20',
  ) {
    // TODO: تنفيذ البحث في قاعدة البيانات
    return {
      message: 'Search endpoint - to be implemented with full-text search',
      drug,
      limit: parseInt(limit),
    };
  }
}

