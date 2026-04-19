import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { OrderSetsService } from './order-sets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('order-sets')
export class OrderSetsController {
  constructor(private readonly service: OrderSetsService) {}

  @Post()
  @Roles('ADMIN', 'DOCTOR')
  create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.service.create(user.hospitalId, user.sub, body);
  }

  @Get()
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: string,
    @Query('specialty') specialty?: string,
    @Query('search') search?: string,
    @Query('scope') scope?: 'published' | 'all',
    @Query('status') status?: any,
    @Query('contentKey') contentKey?: string,
  ) {
    return this.service.findAll(user.hospitalId, { category, specialty, search, scope, status, contentKey });
  }

  @Get('categories')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  getCategories(@CurrentUser() user: JwtPayload) {
    return this.service.getCategories(user.hospitalId);
  }

  @Get('specialties')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  getSpecialties(@CurrentUser() user: JwtPayload) {
    return this.service.getSpecialties(user.hospitalId);
  }

  @Get(':id/history')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  history(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findHistory(user.hospitalId, +id);
  }

  @Get(':id')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(user.hospitalId, +id);
  }

  @Put(':id')
  @Roles('ADMIN', 'DOCTOR')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.service.update(user.hospitalId, +id, user.sub, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(user.hospitalId, +id, user.sub);
  }

  @Post(':id/submit-review')
  @Roles('ADMIN', 'DOCTOR')
  submitForReview(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.submitForReview(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/approve')
  @Roles('ADMIN')
  approve(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.approve(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/reject')
  @Roles('ADMIN')
  reject(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reject(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/publish')
  @Roles('ADMIN')
  publish(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.publish(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/retire')
  @Roles('ADMIN')
  retire(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.retire(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/execute')
  @Roles('ADMIN', 'DOCTOR')
  execute(
    @Param('id') id: string,
    @Body() body: { encounterId: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.execute(user.hospitalId, user.sub, +id, body.encounterId);
  }
}
