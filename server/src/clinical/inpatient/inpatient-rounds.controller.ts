
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { InpatientRoundsService } from './inpatient-rounds.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import type { JwtPayload } from '../../auth/jwt-payload.type';
import { CarePlanType, NoteType } from '@prisma/client';

@Controller('clinical/inpatient')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InpatientRoundsController {
  constructor(private service: InpatientRoundsService) {}

  // ======================== DOCTOR ENDPOINTS ========================

  @Get('my-rotation')
  @Permissions('INPATIENT_VIEW_MY_PATIENTS', 'nursing:station:view', 'clinical:patients:view')
  async getMyRotation(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? parseInt(page) : 1;
    const l = limit ? parseInt(limit) : 20;

    // If user is a Nurse or Admin, show all patients (or filtered by their dept)
    if (user.roles.includes('NURSE') || user.roles.includes('ADMIN')) {
      return this.service.getAllInpatients(user.hospitalId, user.sub, p, l);
    }
    // Otherwise (Doctor), show only assigned patients
    return this.service.getMyPatients(user.sub, p, l);
  }

  // ======================== NURSING ENDPOINTS ========================

  @Get('all-patients')
  @Permissions('INPATIENT_VIEW_ALL_PATIENTS')
  async getAllPatients(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? parseInt(page) : 1;
    const l = limit ? parseInt(limit) : 20;
    return this.service.getAllInpatients(user.hospitalId, user.sub, p, l);
  }

  @Get('encounters/:id/notes')
  @Permissions('INPATIENT_VIEW_NOTES')
  async getNotes(@Param('id', ParseIntPipe) id: number) {
    return this.service.getNotes(id);
  }

  @Post('encounters/:id/notes')
  @Permissions('INPATIENT_ADD_NOTE')
  async addNote(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() body: { content: string; type?: NoteType },
  ) {
    return this.service.addRoundNote(id, user.sub, body.content, body.type);
  }

  @Get('encounters/:id/care-plan')
  @Permissions('INPATIENT_VIEW_CARE_PLAN')
  async getCarePlan(@Param('id', ParseIntPipe) id: number) {
    return this.service.getCarePlan(id);
  }

  @Post('encounters/:id/care-plan')
  @Permissions('INPATIENT_ADD_ORDER')
  async addItem(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() body: { instruction: string; type?: CarePlanType; frequency?: string },
  ) {
    return this.service.addCarePlanItem(id, user.sub, body.instruction, body.type, body.frequency);
  }

  @Put('care-plan/:itemId/complete')
  @Permissions('INPATIENT_COMPLETE_ORDER')
  async completeItem(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.service.completeCarePlanItem(itemId);
  }

  // ======================== NURSING ENDPOINTS ========================

  @Post('care-plan/:itemId/execute')
  @Permissions('INPATIENT_EXECUTE_ORDER')
  async executeItem(
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: JwtPayload,
    @Body() body: { resultValue?: string; note?: string },
  ) {
    return this.service.executeCarePlanItem(itemId, user.sub, body.resultValue, body.note);
  }

  @Get('care-plan/:itemId/executions')
  @Permissions('INPATIENT_VIEW_EXECUTIONS')
  async getExecutions(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.service.getExecutionHistory(itemId);
  }

  // --- Utility / Data Fixes ---
  
  @Post('fix-data/update-departments')
  @Permissions('INPATIENT_VIEW_ALL_PATIENTS') // Reusing admin/nurse permission basically
  async fixEncounterDepartments() {
      return this.service.fixDepartmentIds();
  }
}
