// src/commission/commission.controller.ts

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CommissionService } from './commission.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('commission-rules')
export class CommissionController {
  constructor(private readonly commissionService: CommissionService) {}

  /**
   * GET /commission-rules — جلب جميع القواعد
   */
  @Permissions('commission:view')
  @Get()
  async findAll(@Req() req: any) {
    return this.commissionService.findAll(req.user.hospitalId);
  }

  /**
   * POST /commission-rules — إنشاء/تحديث قاعدة
   */
  @Permissions('commission:manage')
  @Post()
  async upsert(@Req() req: any, @Body() body: any) {
    return this.commissionService.upsert(req.user.hospitalId, {
      serviceType: body.serviceType,
      doctorId: body.doctorId || null,
      doctorRate: Number(body.doctorRate),
    });
  }

  /**
   * POST /commission-rules/bulk — تحديث مجموعة قواعد
   */
  @Permissions('commission:manage')
  @Post('bulk')
  async bulkUpsert(@Req() req: any, @Body() body: { rules: any[] }) {
    return this.commissionService.bulkUpsert(req.user.hospitalId, body.rules);
  }

  /**
   * DELETE /commission-rules/:id — حذف قاعدة
   */
  @Permissions('commission:manage')
  @Delete(':id')
  async remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.commissionService.remove(req.user.hospitalId, id);
  }
}
