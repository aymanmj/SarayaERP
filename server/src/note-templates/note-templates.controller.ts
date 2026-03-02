// src/note-templates/note-templates.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { NoteTemplatesService } from './note-templates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('note-templates')
export class NoteTemplatesController {
  constructor(private readonly service: NoteTemplatesService) {}

  @Get()
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  async findAll(@Req() req: any, @Query('specialty') specialty?: string) {
    return this.service.findAll(req.user.hospitalId, specialty);
  }

  @Post()
  @Roles('ADMIN', 'DOCTOR')
  async create(@Req() req: any, @Body() body: any) {
    return this.service.create(req.user.hospitalId, req.user.sub, body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DOCTOR')
  async update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.service.update(req.user.hospitalId, id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(req.user.hospitalId, id);
  }
}
