import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClinicalPathwaysService } from './clinical-pathways.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clinical-pathways')
export class ClinicalPathwaysController {
  constructor(private readonly service: ClinicalPathwaysService) {}

  @Post()
  @Permissions('clinical-pathways:manage')
  create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.service.create(user.hospitalId, user.sub, body);
  }

  @Get()
  @Permissions('clinical-pathways:view')
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('scope') scope?: 'published' | 'all',
    @Query('status') status?: any,
    @Query('contentKey') contentKey?: string,
  ) {
    return this.service.findAll(user.hospitalId, {
      search,
      scope,
      status,
      contentKey,
    });
  }

  @Get(':id/history')
  @Permissions('clinical-pathways:view')
  history(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findHistory(user.hospitalId, +id);
  }

  @Get(':id')
  @Permissions('clinical-pathways:view')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(user.hospitalId, +id);
  }

  @Put(':id')
  @Permissions('clinical-pathways:manage')
  update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(user.hospitalId, +id, user.sub, body);
  }

  @Delete(':id')
  @Permissions('clinical-pathways:manage')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(user.hospitalId, +id, user.sub);
  }

  @Post(':id/submit-review')
  @Permissions('clinical-pathways:manage')
  submitForReview(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.submitForReview(
      user.hospitalId,
      +id,
      user.sub,
      body?.notes,
    );
  }

  @Post(':id/approve')
  @Permissions('clinical-pathways:manage')
  approve(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.approve(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/reject')
  @Permissions('clinical-pathways:manage')
  reject(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reject(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/publish')
  @Permissions('clinical-pathways:manage')
  publish(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.publish(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/retire')
  @Permissions('clinical-pathways:manage')
  retire(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.retire(user.hospitalId, +id, user.sub, body?.notes);
  }

  // ==================== ENROLLMENT ====================

  @Post(':id/enroll')
  @Permissions('clinical-pathways:manage')
  enroll(
    @Param('id') id: string,
    @Body() body: { encounterId: number; notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.enroll(
      user.hospitalId,
      user.sub,
      +id,
      body.encounterId,
      body.notes,
    );
  }

  @Get('enrollment/:enrollmentId')
  @Permissions('clinical-pathways:view')
  getEnrollment(@Param('enrollmentId') enrollmentId: string) {
    return this.service.getEnrollment(+enrollmentId);
  }

  @Get('enrollments/by-encounter/:encounterId')
  @Permissions('clinical-pathways:view')
  getEnrollmentsByEncounter(@Param('encounterId') encounterId: string) {
    return this.service.getEnrollmentsByEncounter(+encounterId);
  }

  @Post('enrollment/:id/advance')
  @Permissions('clinical-pathways:manage')
  advanceDay(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.advanceDay(+id, user.sub, user.hospitalId);
  }

  @Post('enrollment/:id/variance')
  @Permissions('clinical-pathways:view')
  reportVariance(
    @Param('id') id: string,
    @Body() body: { stepId: number; varianceType: string; reason: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reportVariance(+id, user.sub, body as any);
  }

  @Post('enrollment/:id/complete')
  @Permissions('clinical-pathways:manage')
  completeEnrollment(@Param('id') id: string) {
    return this.service.completeEnrollment(+id);
  }
}
