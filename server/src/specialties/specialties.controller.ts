// server/src/specialties/specialties.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SpecialtiesService } from './specialties.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Permissions('specialties:view')
  @Get()
  async findAll() {
    return this.specialtiesService.findAll();
  }

  @Permissions('specialties:manage')
  @Post()
  async create(@Body() body: any) {
    return this.specialtiesService.create(body);
  }

  @Permissions('specialties:manage')
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.specialtiesService.update(id, body);
  }
}
