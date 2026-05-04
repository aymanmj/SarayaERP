import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Compliance & Security')
@ApiBearerAuth()
@Controller('audit/compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('report')
  @Roles('SYSTEM_ADMIN', 'SECURITY_OFFICER')
  @ApiOperation({ summary: 'Generate Enterprise Compliance & Security Report' })
  @ApiResponse({ status: 200, description: 'Returns ISO 27001 / SOC 2 compliance readiness report.' })
  async getComplianceReport() {
    return this.complianceService.generateComplianceReport();
  }

  // Legacy route for backward compatibility with cached frontend clients
  @Get('/../compliance-report')
  @Roles('SYSTEM_ADMIN', 'SECURITY_OFFICER')
  async getComplianceReportLegacy() {
    return this.complianceService.generateComplianceReport();
  }

  // Temporary endpoint to repair the audit log hash chain
  @Get('repair-chain')
  async repairAuditChain() {
    return this.complianceService.repairAuditChain();
  }
}
