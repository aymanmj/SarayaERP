import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { SurgeryConsumableDto, SurgeryWarehousePolicyDto } from './surgery.dto';
import {
  Body,
  Put,
  Delete,
  Header,
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
import { AuditInTransaction } from '../audit/audit.decorator';
import { SurgeryStatus, SurgeryRole, TerminologySystem } from '@prisma/client';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('surgery')
export class SurgeryController {
  constructor(private readonly surgeryService: SurgeryService) {}

  @Get('source-policy')
  @Header('Cache-Control', 'no-store')
  @Permissions('surgery:view', 'surgery:source:manage')
  sourcePolicy(@CurrentUser() user: JwtPayload) {
    return this.surgeryService.surgerySourcePolicy(user.hospitalId);
  }

  @Get('source-policy/warehouses')
  @Header('Cache-Control', 'no-store')
  @Permissions('surgery:source:manage')
  sourceWarehouses(@CurrentUser() user: JwtPayload) {
    return this.surgeryService.surgerySourceWarehouses(user.hospitalId);
  }

  @Put('source-policy')
  @AuditInTransaction()
  @Permissions('surgery:source:manage')
  configureSource(
    @CurrentUser() user: JwtPayload,
    @Body() body: SurgeryWarehousePolicyDto,
  ) {
    return this.surgeryService.configureSurgerySource(
      user.hospitalId,
      user.sub,
      body,
    );
  }

  // ── غرف العمليات ──
  @Get('theatres')
  @Permissions('surgery:view')
  async getTheatres(@Req() req: { user: JwtPayload }) {
    return this.surgeryService.getTheatres(req.user.hospitalId);
  }

  @Post('theatres')
  @Permissions('surgery:manage')
  async createTheatre(
    @Req() req: { user: JwtPayload },
    @Body() body: { name: string },
  ) {
    return this.surgeryService.createTheatre(req.user.hospitalId, body.name);
  }

  // ── خدمات العمليات (Service Catalog) ──
  @Get('service-items')
  @Permissions('surgery:view')
  async getServiceItems(@Req() req: { user: JwtPayload }) {
    return this.surgeryService.getSurgeryServiceItems(req.user.hospitalId);
  }

  // ── جدولة عملية ──
  @Post('schedule')
  @Permissions('surgery:manage')
  async schedule(
    @Req() req: { user: JwtPayload },
    @Body()
    body: {
      encounterId: number | string;
      theatreId: number | string;
      serviceItemId: number | string;
      surgeryName?: string;
      scheduledStart: string | Date;
      scheduledEnd: string | Date;
      teamMembers?: { userId: number; role: SurgeryRole }[];
    },
  ) {
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
  @Permissions('surgery:view')
  async getCases(
    @Req() req: { user: JwtPayload },
    @Query('date') date?: string,
  ) {
    return this.surgeryService.getSurgeryCases(
      req.user.hospitalId,
      date ? new Date(date) : undefined,
    );
  }

  @Get('cases/:id')
  @Permissions('surgery:view')
  async getCaseDetails(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.surgeryService.getCaseDetails(req.user.hospitalId, id);
  }

  // ── تحديث الحالة ──
  @Post('cases/:id/status')
  @AuditInTransaction()
  @Permissions('surgery:manage')
  async updateStatus(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: SurgeryStatus },
  ) {
    return this.surgeryService.updateStatus(
      req.user.hospitalId,
      id,
      body.status,
      req.user.sub,
    );
  }

  // ── ملاحظات (تقرير العملية) ──
  @Post('cases/:id/notes')
  @Permissions('surgery:manage')
  async updateNotes(
    @Req() req: { user: JwtPayload },
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
  @Permissions('surgery:manage')
  async recordPreOpChecklist(
    @Req() req: { user: JwtPayload },
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
  @Permissions('surgery:manage')
  async recordIntraOpLog(
    @Req() req: { user: JwtPayload },
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
  @Permissions('surgery:manage')
  async recordPostOpPACU(
    @Req() req: { user: JwtPayload },
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
  @Permissions('surgery:manage')
  async addTeamMember(
    @Req() req: { user: JwtPayload },
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

  @Delete('cases/:id/team/:memberId')
  @Permissions('surgery:manage')
  async removeCaseTeamMember(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) caseId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.surgeryService.removeTeamMember(
      req.user.hospitalId,
      memberId,
      caseId,
    );
  }

  @Delete('team/:memberId')
  @Permissions('surgery:manage')
  async removeTeamMember(
    @Req() req: { user: JwtPayload },
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.surgeryService.removeTeamMember(req.user.hospitalId, memberId);
  }

  // ── مستهلكات العمليات ──
  @Post('cases/:id/consumables')
  @AuditInTransaction()
  @Permissions('surgery:manage')
  async addConsumable(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SurgeryConsumableDto,
  ) {
    return this.surgeryService.addConsumable({
      hospitalId: user.hospitalId,
      userId: user.sub,
      caseId: id,
      productId: body.productId,
      quantity: body.quantity,
      requestId: body.requestId,
    });
  }
}
