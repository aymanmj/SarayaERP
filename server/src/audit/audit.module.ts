import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { PrismaModule } from '../prisma/prisma.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuditController, ComplianceController],
  providers: [AuditService, AuditInterceptor, ComplianceService],
  exports: [AuditService, ComplianceService],
})
export class AuditModule {}
