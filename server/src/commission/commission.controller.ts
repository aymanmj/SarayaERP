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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commission-rules')
@Roles('ADMIN', 'CEO')
export class CommissionController {
  constructor(private readonly commissionService: CommissionService) {}

  /**
   * GET /commission-rules — جلب جميع القواعد
   */
  @Get()
  async findAll(@Req() req: any) {
    return this.commissionService.findAll(req.user.hospitalId);
  }

  /**
   * POST /commission-rules — إنشاء/تحديث قاعدة
   */
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
  @Post('bulk')
  async bulkUpsert(@Req() req: any, @Body() body: { rules: any[] }) {
    return this.commissionService.bulkUpsert(req.user.hospitalId, body.rules);
  }

  /**
   * DELETE /commission-rules/:id — حذف قاعدة
   */
  @Delete(':id')
  async remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.commissionService.remove(req.user.hospitalId, id);
  }
}
