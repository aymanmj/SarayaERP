/**
 * Patient Portal — Appointments Controller
 * 
 * Allows patients to view, book, and cancel appointments.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatientPortalService } from '../patient-portal.service';
import { PatientAuthGuard } from '../auth/patient-auth.guard';
import { CurrentPatient } from '../auth/current-patient.decorator';
import { BookAppointmentDto } from '../dto/portal.dto';

@ApiTags('Patient Portal — Appointments')
@ApiBearerAuth()
@UseGuards(PatientAuthGuard)
@Controller('patient-portal/v1/appointments')
export class PortalAppointmentsController {
  constructor(private readonly portalService: PatientPortalService) {}

  @Get()
  @ApiOperation({ summary: 'قائمة المواعيد' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAppointments(
    @CurrentPatient() patient: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.portalService.getAppointments(patient.sub, Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل موعد' })
  async getAppointmentById(
    @CurrentPatient() patient: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portalService.getAppointmentById(patient.sub, id);
  }

  @Post('book')
  @ApiOperation({ summary: 'حجز موعد جديد', description: 'يسمح للمريض بحجز موعد مع طبيب محدد' })
  async bookAppointment(
    @CurrentPatient() patient: any,
    @Body() dto: BookAppointmentDto,
  ) {
    return this.portalService.bookAppointment(patient.sub, patient.hospitalId, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'إلغاء موعد' })
  async cancelAppointment(
    @CurrentPatient() patient: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portalService.cancelAppointment(patient.sub, id);
  }
}
