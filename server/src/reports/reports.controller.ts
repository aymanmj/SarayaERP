// src/reports/reports.controller.ts

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
@Roles('ADMIN', 'ACCOUNTANT', 'CEO') // حماية المسارات للصلاحيات العليا فقط
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * 1. تحليل نمو الدخل والمصروفات (الرسم البياني للمساحات)
   * GET /reports/financial-summary?year=2025
   */
  @Get('financial-summary')
  async getFinancialSummary(@Req() req: any, @Query('year') year?: string) {
    const y = year ? Number(year) : new Date().getFullYear();
    // نستخدم الخدمة المطورة التي تحسب التدفق النقدي (Cash Basis)
    return this.reportsService.getFinancialSummary(req.user.hospitalId, y);
  }

  /**
   * 2. كفاءة الأقسام (الرسم البياني الدائري)
   * GET /reports/operational-stats
   */
  @Get('operational-stats')
  async getOperationalStats(@Req() req: any) {
    return this.reportsService.getOperationalStats(req.user.hospitalId);
  }

  /**
   * 3. مؤشرات الأداء التشغيلي (كروت الـ KPIs) - ✅ تم حل مشكلة الـ 404
   * GET /reports/operational-kpis
   */
  @Get('operational-kpis')
  async getOperationalKPIs(@Req() req: any) {
    return this.reportsService.getOperationalKPIs(req.user.hospitalId);
  }

  /**
   * 4. الأطباء الأكثر نشاطاً (الرسم البياني لعدد الحالات)
   * GET /reports/top-performing
   */
  @Get('top-performing')
  async getTopPerforming(@Req() req: any) {
    return this.reportsService.getTopPerforming(req.user.hospitalId);
  }
}

// import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
// import { ReportsService } from './reports.service';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';

// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('reports')
// @Roles('ADMIN', 'ACCOUNTANT', 'CEO') // صلاحيات عليا
// export class ReportsController {
//   constructor(private readonly reportsService: ReportsService) {}

//   @Get('financial-summary')
//   async getFinancialSummary(@Req() req: any, @Query('year') year?: string) {
//     const y = year ? Number(year) : new Date().getFullYear();
//     return this.reportsService.getFinancialSummary(req.user.hospitalId, y);
//   }

//   @Get('operational-stats')
//   async getOperationalStats(@Req() req: any) {
//     return this.reportsService.getOperationalStats(req.user.hospitalId);
//   }

//   @Get('top-performing')
//   async getTopPerforming(@Req() req: any) {
//     return this.reportsService.getTopPerforming(req.user.hospitalId);
//   }
// }
