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
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('note-templates')
export class NoteTemplatesController {
  constructor(private readonly service: NoteTemplatesService) {}

  @Get()
  @Permissions('note-templates:view')
  async findAll(@Req() req: any, @Query('specialty') specialty?: string) {
    return this.service.findAll(req.user.hospitalId, specialty);
  }

  @Post()
  @Permissions('note-templates:manage')
  async create(@Req() req: any, @Body() body: any) {
    return this.service.create(req.user.hospitalId, req.user.sub, body);
  }

  @Patch(':id')
  @Permissions('note-templates:manage')
  async update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.service.update(req.user.hospitalId, id, body);
  }

  @Delete(':id')
  @Permissions('note-templates:manage')
  async remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(req.user.hospitalId, id);
  }
}
