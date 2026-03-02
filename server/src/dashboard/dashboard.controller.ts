// src/dashboard/dashboard.controller.ts

import { Controller, Get, UseGuards, Req, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async getStats(@Req() req: any, @Query('period') period?: string) {
    return this.dashboardService.getStats(
      req.user.hospitalId,
      req.user.sub,
      req.user.roles,
      period || 'today',
    );
  }

  @Get('recent-activities')
  async getRecentActivities(@Req() req: any) {
    return this.dashboardService.getRecentActivities(req.user.hospitalId);
  }
}
