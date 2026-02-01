// src/financial-years/financial-years.controller.ts

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
import { FinancialYearsService } from './financial-years.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { CreateFinancialYearDto } from './dto/create-financial-year.dto';
import { UpdateFinancialYearStatusDto } from './dto/update-financial-year-status.dto';

type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; error: { code: string; message: string } };
type ApiResponse<T> = ApiOk<T> | ApiErr;

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN') // ممكن تضيف ACCOUNTANT لاحقًا
@Controller('financial-years')
export class FinancialYearsController {
  constructor(private readonly service: FinancialYearsService) {}

  // قائمة السنوات المالية
  @Get()
  async listYears(@CurrentUser() user: JwtPayload) {
    return this.service.listYears(user.hospitalId);
  }

  // إنشاء سنة مالية جديدة
  // إنشاء سنة مالية جديدة
  @Post()
  async createYear(
    @Body() dto: CreateFinancialYearDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createYear({
      hospitalId: user.hospitalId,
      userId: user.sub,
      year: dto.year,
      name: dto.name,
      description: dto.description,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
  }

  // تحديث حالة السنة المالية + تعيينها كسنة حالية
  @Patch(':id/status')
  async updateYearStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFinancialYearStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateYearStatus({
      hospitalId: user.hospitalId,
      yearId: id,
      userId: user.sub,
      status: dto.status,
      isCurrent: dto.isCurrent,
    });
  }

  // توليد فترات شهرية تلقائيًا
  @Post(':id/generate-periods')
  async generatePeriods(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.generateMonthlyPeriods(user.hospitalId, id, user.sub);
  }

  // قائمة الفترات لسنة معينة
  @Get(':id/periods')
  async listPeriods(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listPeriods(user.hospitalId, id);
  }

  // فتح فترة
  @Patch('periods/:id/open')
  async openPeriod(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.openPeriod(user.hospitalId, id, user.sub);
  }

  // إغلاق فترة
  @Patch('periods/:id/close')
  async closePeriod(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.closePeriod(user.hospitalId, id, user.sub);
  }

  @Get('current')
  async getCurrent(@CurrentUser() user: JwtPayload) {
    const fy = await this.service.getCurrentYearNullable(user.hospitalId);

    if (!fy) {
      return null;
    }
    return fy;
  }
}
