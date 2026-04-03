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
  ) {
    return this.service.findAll(user.hospitalId, { category, specialty, search });
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
