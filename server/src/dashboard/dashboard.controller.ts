// src/dashboard/dashboard.controller.ts

import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async getStats(@Req() req: any) {
    // نمرر الـ ID والـ Roles
    return this.dashboardService.getStats(
      req.user.hospitalId,
      req.user.sub,
      req.user.roles,
    );
  }
}
