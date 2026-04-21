/**
 * Patient Portal — Medication Refill Controller
 * 
 * Allows patients to request prescription refills.
 * All endpoints enforce patient-scoped data isolation.
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatientAuthGuard } from '../auth/patient-auth.guard';
import { CurrentPatient } from '../auth/current-patient.decorator';
import { PortalRefillService } from '../refill/portal-refill.service';
import { RequestRefillDto } from '../dto/portal.dto';

@ApiTags('Patient Portal — Refills')
@ApiBearerAuth()
@UseGuards(PatientAuthGuard)
@Controller('patient-portal/v1/refills')
export class PortalRefillController {
  constructor(private readonly refillService: PortalRefillService) {}

  @Post()
  @ApiOperation({ summary: 'طلب تجديد وصفة' })
  async requestRefill(
    @CurrentPatient() patient: any,
    @Body() dto: RequestRefillDto,
  ) {
    return this.refillService.requestRefill(patient.sub, patient.hospitalId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'قائمة طلبات التجديد' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRefillRequests(
    @CurrentPatient() patient: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.refillService.getRefillRequests(patient.sub, Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل طلب تجديد' })
  async getRefillById(
    @CurrentPatient() patient: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.refillService.getRefillById(patient.sub, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'إلغاء طلب تجديد معلق' })
  async cancelRefill(
    @CurrentPatient() patient: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.refillService.cancelRefill(patient.sub, id);
  }
}
