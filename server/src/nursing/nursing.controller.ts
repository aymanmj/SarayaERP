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
import { NursingService } from './nursing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdministrationStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('nursing')
export class NursingController {
  constructor(private readonly nursingService: NursingService) {}

  // 1. لوحة قيادة العنبر
  @Get('inpatients')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  async getInpatients(@Req() req: any, @Query('wardId') wardId?: string) {
    const wId = wardId ? Number(wardId) : undefined;
    return this.nursingService.getInpatients(req.user.hospitalId, wId);
  }

  // 2. سجل الأدوية للمريض (MAR)
  @Get('encounters/:id/mar')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  async getMAR(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.nursingService.getPatientMAR(req.user.hospitalId, id);
  }

  // 3. تسجيل إعطاء دواء
  @Post('encounters/:id/administer-med')
  @Roles('ADMIN', 'NURSE')
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
  @Get('encounters/:id/notes')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  async getNotes(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.nursingService.getNursingNotes(req.user.hospitalId, id);
  }

  @Post('encounters/:id/notes')
  @Roles('ADMIN', 'NURSE')
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
}
