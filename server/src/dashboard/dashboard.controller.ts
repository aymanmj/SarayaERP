// src/dashboard/dashboard.controller.ts

import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Permissions('dashboard:view')
  @Get('stats')
  async getStats(@CurrentUser() user: any, @Query('period') period?: string) {
    return this.dashboardService.getStats(
      user.hospitalId,
      user.sub,
      user.roles,
      period || 'today',
    );
  }

  @Permissions('dashboard:view')
  @Get('recent-activities')
  async getRecentActivities(@CurrentUser() user: any) {
    return this.dashboardService.getRecentActivities(user.hospitalId);
  }
}

