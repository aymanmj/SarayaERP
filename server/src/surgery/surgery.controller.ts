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
import { SurgeryService } from './surgery.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { SurgeryStatus, SurgeryRole, TerminologySystem } from '@prisma/client';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('surgery')
export class SurgeryController {
  constructor(private readonly surgeryService: SurgeryService) {}

  // ── غرف العمليات ──
  @Get('theatres')
  async getTheatres(@Req() req: any) {
    return this.surgeryService.getTheatres(req.user.hospitalId);
  }

  @Post('theatres')
  @Permissions('surgery:manage')
  async createTheatre(@Req() req: any, @Body() body: { name: string }) {
    return this.surgeryService.createTheatre(req.user.hospitalId, body.name);
  }

  // ── خدمات العمليات (Service Catalog) ──
  @Get('service-items')
  async getServiceItems(@Req() req: any) {
    return this.surgeryService.getSurgeryServiceItems(req.user.hospitalId);
  }

  // ── جدولة عملية ──
  @Post('schedule')
  @Permissions('surgery:view')
  async schedule(@Req() req: any, @Body() body: any) {
    return this.surgeryService.scheduleSurgery({
      hospitalId: req.user.hospitalId,
      encounterId: Number(body.encounterId),
      theatreId: Number(body.theatreId),
      serviceItemId: Number(body.serviceItemId),
      surgeryName: body.surgeryName || undefined,
      scheduledStart: new Date(body.scheduledStart),
      scheduledEnd: new Date(body.scheduledEnd),
      teamMembers: body.teamMembers,
    });
  }

  // ── قائمة العمليات ──
  @Get('cases')
  async getCases(@Req() req: any, @Query('date') date?: string) {
    return this.surgeryService.getSurgeryCases(
      req.user.hospitalId,
      date ? new Date(date) : undefined,
    );
  }

  @Get('cases/:id')
  async getCaseDetails(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.surgeryService.getCaseDetails(req.user.hospitalId, id);
  }

  // ── تحديث الحالة ──
  @Post('cases/:id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: SurgeryStatus },
  ) {
    return this.surgeryService.updateStatus(
      req.user.hospitalId,
      id,
      body.status,
    );
  }

  // ── ملاحظات (تقرير العملية) ──
  @Post('cases/:id/notes')
  async updateNotes(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      surgeonNotes?: string;
      anesthesiaNotes?: string;
      preOpDiagnosis?: string;
      postOpDiagnosis?: string;
      procedureConceptId?: number;
      preOpDiagnosisConceptId?: number;
      postOpDiagnosisConceptId?: number;
      procedureTerminologySystem?: TerminologySystem;
      procedureTerminologyCode?: string;
      preOpTerminologySystem?: TerminologySystem;
      preOpTerminologyCode?: string;
      postOpTerminologySystem?: TerminologySystem;
      postOpTerminologyCode?: string;
    },
  ) {
    return this.surgeryService.updateNotes(req.user.hospitalId, id, body);
  }

  @Post('cases/:id/preop-checklist')
  async recordPreOpChecklist(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.surgeryService.recordPreOpChecklist(
      req.user.hospitalId,
      id,
      body,
      req.user.sub,
    );
  }

  @Post('cases/:id/intraop-log')
  async recordIntraOpLog(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.surgeryService.recordIntraOpLog(
      req.user.hospitalId,
      id,
      body,
      req.user.sub,
    );
  }

  @Post('cases/:id/postop-pacu')
  async recordPostOpPACU(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.surgeryService.recordPostOpPACU(
      req.user.hospitalId,
      id,
      body,
      req.user.sub,
    );
  }

  // ── إدارة الطاقم ──
  @Post('cases/:id/team')
  async addTeamMember(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { userId: number; role: SurgeryRole; commission?: number },
  ) {
    return this.surgeryService.addTeamMember(
      req.user.hospitalId,
      id,
      Number(body.userId),
      body.role,
      body.commission,
    );
  }

  // ── مستهلكات العمليات ──
  @Post('cases/:id/consumables')
  async addConsumable(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { productId: number; quantity: number },
  ) {
    return this.surgeryService.addConsumable({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      caseId: id,
      productId: Number(body.productId),
      quantity: Number(body.quantity),
    });
  }
}
