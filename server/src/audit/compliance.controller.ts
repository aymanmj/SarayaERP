import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';

@ApiTags('Compliance & Security')
@ApiBearerAuth()
@Controller('audit/compliance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Permissions('compliance:view')
  @Get('report')
  @ApiOperation({ summary: 'Generate Enterprise Compliance & Security Report' })
  @ApiResponse({
    status: 200,
    description: 'Returns ISO 27001 / SOC 2 compliance readiness report.',
  })
  async getComplianceReport() {
    return this.complianceService.generateComplianceReport();
  }

  @Permissions('compliance:view')
  // Legacy route for backward compatibility with cached frontend clients
  @Get('/../compliance-report')
  async getComplianceReportLegacy() {
    return this.complianceService.generateComplianceReport();
  }
}
