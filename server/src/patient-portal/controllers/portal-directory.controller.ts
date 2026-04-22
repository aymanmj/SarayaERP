import { Controller, Get, Query, UseGuards, ParseIntPipe, BadRequestException, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatientPortalService } from '../patient-portal.service';
import { PatientAuthGuard } from '../auth/patient-auth.guard';
import { CurrentPatient } from '../auth/current-patient.decorator';

@ApiTags('Patient Portal — Directory')
@ApiBearerAuth()
@UseGuards(PatientAuthGuard)
@Controller('patient-portal/v1/directory')
export class PortalDirectoryController {
  constructor(private readonly portalService: PatientPortalService) {}

  @Get('departments')
  @ApiOperation({ summary: 'قائمة الأقسام المتاحة للحجز' })
  async getDepartments(@CurrentPatient() patient: any) {
    return this.portalService.getDepartments(patient.hospitalId);
  }

  @Get('doctors')
  @ApiOperation({ summary: 'قائمة الأطباء المتاحين للحجز' })
  @ApiQuery({ name: 'departmentId', required: false, type: Number })
  async getDoctors(
    @CurrentPatient() patient: any,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.portalService.getDoctors(
      patient.hospitalId,
      departmentId ? parseInt(departmentId, 10) : undefined,
    );
  }

  @Get('doctors/:doctorId/slots')
  @ApiOperation({ summary: 'عرض الفترات المتاحة للحجز لطبيب معين' })
  @ApiQuery({ name: 'date', required: true, type: String, description: 'YYYY-MM-DD' })
  async getAvailableSlots(
    @CurrentPatient() patient: any,
    @Param('doctorId', ParseIntPipe) doctorId: number,
    @Query('date') date: string,
  ) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('يجب إدخال التاريخ بصيغة YYYY-MM-DD');
    }
    return this.portalService.getDoctorAvailableSlots(patient.hospitalId, doctorId, date);
  }
}
