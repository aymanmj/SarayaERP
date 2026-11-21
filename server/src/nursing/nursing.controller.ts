import type { JwtPayload } from '../auth/jwt-payload.type';
import type { Request } from 'express';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  VerifyFiveRightsDto,
  AdministerBarcodeDto,
  AdministerMedicationDto,
  AddNursingNoteDto,
} from './dto/clma.dto';
import { CareTaskStatus } from '@prisma/client';
import { AuditInTransaction } from '../audit/audit.decorator';

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
  @Permissions('nursing:view', 'nursing:dashboard:view', 'nursing:station:view')
  async getInpatients(
    @Req() req: { user: JwtPayload },
    @Query('wardId') wardId?: string,
  ) {
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
  @Permissions('nursing:view', 'nursing:station:view')
  async getMAR(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.nursingService.getPatientMAR(req.user.hospitalId, id);
  }

  // 3. التحقق الخماسي للباركود (CLMA 5 Rights Verification)
  @ApiOperation({
    summary: 'Verify 5 Rights of medication administration via barcodes',
  })
  @ApiParam({ name: 'id', description: 'Encounter ID' })
  @ApiResponse({ status: 200, description: '5 Rights verification completed.' })
  @Post('encounters/:id/verify-five-rights')
  @HttpCode(HttpStatus.OK)
  @Permissions('nursing:station:view', 'nursing:view')
  async verifyFiveRights(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) encounterId: number,
    @Body() dto: VerifyFiveRightsDto,
  ) {
    return this.nursingService.verifyFiveRights(
      req.user.hospitalId,
      encounterId,
      dto.prescriptionItemId,
      dto.patientBarcode,
      dto.drugBarcode,
    );
  }

  // 4. إعطاء دواء عبر الباركود المغلق (CLMA Barcode Administration)
  @ApiOperation({
    summary: 'Administer medication with barcode scanning and CLMA audit',
  })
  @ApiParam({ name: 'id', description: 'Encounter ID' })
  @ApiResponse({
    status: 201,
    description: 'Medication administered with barcode successfully.',
  })
  @Post('encounters/:id/administer-barcode')
  @AuditInTransaction()
  @Permissions('nursing:medications:administer')
  async administerWithBarcode(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) encounterId: number,
    @Body() dto: AdministerBarcodeDto,
  ) {
    return this.nursingService.administerWithBarcode({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
      encounterId,
      prescriptionItemId: dto.prescriptionItemId,
      patientBarcode: dto.patientBarcode,
      drugBarcode: dto.drugBarcode,
      requestId: dto.requestId,
      scheduledSlot: dto.scheduledSlot,
      isEmergencyOverride: dto.isEmergencyOverride ?? false,
      varianceReason: dto.varianceReason,
      notes: dto.notes,
    });
  }

  // 5. تسجيل إعطاء دواء يدوي (eMAR Manual Action)
  @ApiOperation({
    summary: 'Administer medication manually for a prescription item',
  })
  @ApiParam({ name: 'id', description: 'Encounter ID' })
  @ApiResponse({
    status: 201,
    description: 'Medication administered successfully.',
  })
  @Post('encounters/:id/administer-med')
  @AuditInTransaction()
  @Permissions('nursing:medications:administer')
  async administerMed(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) encounterId: number,
    @Body() body: AdministerMedicationDto,
  ) {
    return this.nursingService.administerMedication({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
      encounterId,
      prescriptionItemId: Number(body.prescriptionItemId),
      requestId: body.requestId,
      scheduledSlot: body.scheduledSlot,
      status: body.status,
      notes: body.notes,
    });
  }

  // 6. ملاحظات التمريض
  @ApiOperation({ summary: 'Get nursing notes for an encounter' })
  @ApiParam({ name: 'id', description: 'Encounter ID' })
  @ApiResponse({
    status: 200,
    description: 'Nursing notes retrieved successfully.',
  })
  @Get('encounters/:id/notes')
  @Permissions('nursing:view', 'nursing:station:view')
  async getNotes(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.nursingService.getNursingNotes(req.user.hospitalId, id);
  }

  @ApiOperation({ summary: 'Add a new nursing note to an encounter' })
  @ApiParam({ name: 'id', description: 'Encounter ID' })
  @ApiResponse({ status: 201, description: 'Nursing note added successfully.' })
  @Post('encounters/:id/notes')
  @Permissions('nursing:notes:manage')
  async addNote(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) encounterId: number,
    @Body() body: AddNursingNoteDto,
  ) {
    return this.nursingService.addNursingNote({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      encounterId,
      note: body.note,
      isShiftHandover: body.isShiftHandover || false,
    });
  }

  // 7. المهام السريرية
  @Get('encounters/:id/care-tasks')
  @Permissions('nursing:view', 'nursing:station:view')
  async getCareTasks(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) encounterId: number,
  ) {
    return this.nursingService.getCareTasks(req.user.hospitalId, encounterId);
  }

  @Post('care-tasks/:id/status')
  @Permissions('nursing:notes:manage')
  async updateCareTaskStatus(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) taskId: number,
    @Body() body: { status: CareTaskStatus; notes?: string },
  ) {
    return this.nursingService.updateCareTaskStatus(
      req.user.hospitalId,
      req.user.sub,
      taskId,
      body.status,
      body.notes,
    );
  }

  // 8. MAR Schedule
  @Get('encounters/:id/mar-schedule')
  @Permissions('nursing:view', 'nursing:station:view')
  async getMARSchedule(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) encounterId: number,
    @Query('targetDate') targetDate?: string,
  ) {
    return this.nursingService.generateMARSchedule(
      req.user.hospitalId,
      encounterId,
      targetDate,
    );
  }

  // 9. Overdue Medications Alerts
  @Get('overdue-medications')
  @Permissions('nursing:view', 'nursing:station:view')
  async getOverdueMedications(
    @Req() req: { user: JwtPayload },
    @Query('encounterId') encounterId?: string,
  ) {
    const encId = encounterId ? Number(encounterId) : undefined;
    return this.nursingService.getOverdueMedications(
      req.user.hospitalId,
      encId,
    );
  }
}
