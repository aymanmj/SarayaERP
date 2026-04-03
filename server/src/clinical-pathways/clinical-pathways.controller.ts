import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { ClinicalPathwaysService } from './clinical-pathways.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clinical-pathways')
export class ClinicalPathwaysController {
  constructor(private readonly service: ClinicalPathwaysService) {}

  @Post()
  @Roles('ADMIN', 'DOCTOR')
  create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.service.create(user.hospitalId, user.sub, body);
  }

  @Get()
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  findAll(@CurrentUser() user: JwtPayload, @Query('search') search?: string) {
    return this.service.findAll(user.hospitalId, { search });
  }

  @Get(':id')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(user.hospitalId, +id);
  }

  @Put(':id')
  @Roles('ADMIN', 'DOCTOR')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.service.update(user.hospitalId, +id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(user.hospitalId, +id);
  }

  // ==================== ENROLLMENT ====================

  @Post(':id/enroll')
  @Roles('ADMIN', 'DOCTOR')
  enroll(
    @Param('id') id: string,
    @Body() body: { encounterId: number; notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.enroll(user.hospitalId, user.sub, +id, body.encounterId, body.notes);
  }

  @Get('enrollment/:enrollmentId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  getEnrollment(@Param('enrollmentId') enrollmentId: string) {
    return this.service.getEnrollment(+enrollmentId);
  }

  @Get('enrollments/by-encounter/:encounterId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  getEnrollmentsByEncounter(@Param('encounterId') encounterId: string) {
    return this.service.getEnrollmentsByEncounter(+encounterId);
  }

  @Post('enrollment/:id/advance')
  @Roles('ADMIN', 'DOCTOR')
  advanceDay(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.advanceDay(+id, user.sub, user.hospitalId);
  }

  @Post('enrollment/:id/variance')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  reportVariance(
    @Param('id') id: string,
    @Body() body: { stepId: number; varianceType: string; reason: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reportVariance(+id, user.sub, body as any);
  }

  @Post('enrollment/:id/complete')
  @Roles('ADMIN', 'DOCTOR')
  completeEnrollment(@Param('id') id: string) {
    return this.service.completeEnrollment(+id);
  }
}
