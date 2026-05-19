import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { NursingService } from './nursing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { AdministrationStatus } from '@prisma/client';

@ApiTags('nursing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('nursing')
export class NursingController {
  constructor(private readonly nursingService: NursingService) {}

  // 1. لوحة قيادة العنبر
  @ApiOperation({ summary: 'Get inpatients for nursing ward board' })
  @ApiQuery({ name: 'wardId', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Inpatients retrieved successfully.',
  })
  @Get('inpatients')
  @Permissions('nursing:view')
  async getInpatients(@Req() req: any, @Query('wardId') wardId?: string) {
    const wId = wardId ? Number(wardId) : undefined;
    return this.nursingService.getInpatients(req.user.hospitalId, wId);
  }

  // 2. سجل الأدوية للمريض (MAR)
  @ApiOperation({
    summary: 'Get Medication Administration Record (MAR) for an encounter',
  })
  @ApiParam({ name: 'id', description: 'Encounter ID' })
  @ApiResponse({ status: 200, description: 'MAR retrieved successfully.' })
  @Get('encounters/:id/mar')
  @Permissions('nursing:view')
  async getMAR(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.nursingService.getPatientMAR(req.user.hospitalId, id);
  }

  // 3. تسجيل إعطاء دواء
  @ApiOperation({ summary: 'Administer medication for a prescription item' })
  @ApiParam({ name: 'id', description: 'Encounter ID' })
  @ApiResponse({
    status: 201,
    description: 'Medication administered successfully.',
  })
  @Post('encounters/:id/administer-med')
  @Permissions('nursing:view')
  async administerMed(
    @Req() req: any,
    @Param('id', ParseIntPipe) encounterId: number,
    @Body()
    body: {
      prescriptionItemId: number;
      status: AdministrationStatus;
      notes?: string;
    },
  ) {
    return this.nursingService.administerMedication({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      encounterId,
      prescriptionItemId: Number(body.prescriptionItemId),
      status: body.status,
      notes: body.notes,
    });
  }

  // 4. ملاحظات التمريض
  @ApiOperation({ summary: 'Get nursing notes for an encounter' })
  @ApiParam({ name: 'id', description: 'Encounter ID' })
  @ApiResponse({
    status: 200,
    description: 'Nursing notes retrieved successfully.',
  })
  @Get('encounters/:id/notes')
  @Permissions('nursing:view')
  async getNotes(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.nursingService.getNursingNotes(req.user.hospitalId, id);
  }

  @ApiOperation({ summary: 'Add a new nursing note to an encounter' })
  @ApiParam({ name: 'id', description: 'Encounter ID' })
  @ApiResponse({ status: 201, description: 'Nursing note added successfully.' })
  @Post('encounters/:id/notes')
  @Permissions('nursing:view')
  async addNote(
    @Req() req: any,
    @Param('id', ParseIntPipe) encounterId: number,
    @Body() body: { note: string; isShiftHandover?: boolean },
  ) {
    return this.nursingService.addNursingNote({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      encounterId,
      note: body.note,
      isShiftHandover: body.isShiftHandover || false,
    });
  }

  // 5. المهام السريرية
  @Get('encounters/:id/care-tasks')
  @Permissions('nursing:view')
  async getCareTasks(@Param('id', ParseIntPipe) encounterId: number) {
    return this.nursingService.getCareTasks(encounterId);
  }

  @Post('care-tasks/:id/status')
  @Permissions('nursing:view')
  async updateCareTaskStatus(
    @Req() req: any,
    @Param('id', ParseIntPipe) taskId: number,
    @Body() body: { status: any; notes?: string },
  ) {
    return this.nursingService.updateCareTaskStatus(
      req.user.sub,
      taskId,
      body.status,
      body.notes,
    );
  }

  // 6. MAR Schedule
  @Get('encounters/:id/mar-schedule')
  @Permissions('nursing:view')
  async getMARSchedule(
    @Req() req: any,
    @Param('id', ParseIntPipe) encounterId: number,
    @Query('targetDate') targetDate?: string,
  ) {
    const date = targetDate ? new Date(targetDate) : new Date();
    return this.nursingService.generateMARSchedule(
      req.user.hospitalId,
      encounterId,
      date,
    );
  }

  // 7. Overdue Medications Alerts
  @Get('overdue-medications')
  @Permissions('nursing:view')
  async getOverdueMedications(
    @Req() req: any,
    @Query('encounterId') encounterId?: string,
  ) {
    const encId = encounterId ? Number(encounterId) : undefined;
    return this.nursingService.getOverdueMedications(
      req.user.hospitalId,
      encId,
    );
  }
}
