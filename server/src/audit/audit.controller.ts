import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @Permissions('audit:manage') // حماية المسار
  async getLogs(
    @Req() req: { user: JwtPayload },
    @Query() query: Parameters<AuditService['findAll']>[1],
  ) {
    return this.auditService.findAll(req.user.hospitalId, query);
  }

  @Get('integrity-check')
  @Permissions('audit:manage')
  async verifyIntegrity() {
    return this.auditService.verifyChain();
  }
}
