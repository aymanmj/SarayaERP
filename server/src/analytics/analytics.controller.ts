import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('executive')
  @Roles('ADMIN', 'CEO', 'CFO', 'MANAGER')
  async getExecutiveStats(@CurrentUser() user: any) {
    return this.analyticsService.getExecutiveStats(user.hospitalId);
  }

  @Get('clinical-variance')
  @Roles('ADMIN', 'CEO', 'CMO', 'QUALITY_MANAGER')
  async getClinicalVarianceReport(
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    // Default to last 30 days if not provided
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return this.analyticsService.getClinicalVarianceReport(user.hospitalId, startDate, endDate);
  }
}
