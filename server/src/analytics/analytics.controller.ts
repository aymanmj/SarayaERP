import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @ApiOperation({ summary: 'Get executive dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Executive stats retrieved successfully.',
  })
  @Get('executive')
  @Permissions('analytics:manage')
  async getExecutiveStats(@CurrentUser() user: any) {
    return this.analyticsService.getExecutiveStats(user.hospitalId);
  }

  @ApiOperation({ summary: 'Get clinical variance report for pathways' })
  @ApiResponse({
    status: 200,
    description: 'Clinical variance report retrieved successfully.',
  })
  @Get('clinical-variance')
  @Permissions('analytics:manage')
  async getClinicalVarianceReport(@CurrentUser() user: any, @Req() req: any) {
    // Default to last 30 days if not provided
    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date();
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return this.analyticsService.getClinicalVarianceReport(
      user.hospitalId,
      startDate,
      endDate,
    );
  }

  @ApiOperation({ summary: 'Get clinical KPIs and HIMSS tracking metrics' })
  @ApiResponse({
    status: 200,
    description: 'Clinical KPIs retrieved successfully.',
  })
  @Get('clinical-kpis')
  @Permissions('analytics:manage')
  async getClinicalKPIs(@CurrentUser() user: any, @Req() req: any) {
    // Default to last 30 days if not provided
    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date();
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return this.analyticsService.getClinicalKPIs(
      user.hospitalId,
      startDate,
      endDate,
    );
  }
}
