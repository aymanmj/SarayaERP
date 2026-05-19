// server/src/departments/departments.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('departments')
@Permissions('departments:manage') // إدارة الأقسام للأدمن فقط
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @Permissions('departments:view')
  async findAll(@Req() req: any) {
    return this.departmentsService.findAll(req.user.hospitalId);
  }

  @Post()
  async create(@Req() req: any, @Body() body: any) {
    return this.departmentsService.create(req.user.hospitalId, body);
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.departmentsService.update(req.user.hospitalId, id, body);
  }

  @Delete(':id')
  async delete(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.delete(
      req.user.hospitalId,
      id,
      req.user.sub,
    );
  }
}
