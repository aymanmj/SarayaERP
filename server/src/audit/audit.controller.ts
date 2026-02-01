import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  //   @Get('logs')
  //   @Roles('ADMIN', 'IT_ADMIN')
  //   async getLogs(@Req() req: any, @Query() query: any) {
  //     // يمكنك تحسين الفلترة هنا
  //     return this.auditService.findAll(req.user.hospitalId, query);
  //   }

  @Get('logs')
  @Roles('ADMIN', 'IT_ADMIN') // حماية المسار
  async getLogs(@Req() req: any, @Query() query: any) {
    return this.auditService.findAll(req.user.hospitalId, query);
  }
}
