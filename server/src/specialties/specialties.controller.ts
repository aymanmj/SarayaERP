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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Get()
  async findAll() {
    return this.specialtiesService.findAll();
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() body: any) {
    return this.specialtiesService.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.specialtiesService.update(id, body);
  }
}
