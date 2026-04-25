import { Module, Global } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantGuard } from './tenant.guard';
import { TenantController } from './tenant.controller';
import { ConsolidatedReportingService } from './consolidated-reporting.service';

/**
 * وحدة Multi-Tenancy
 * توفر خدمات إدارة المؤسسات وعزل البيانات والتقارير الموحدة عبر كامل النظام
 * 
 * @Global - متاحة لكل الوحدات بدون استيراد صريح
 */
@Global()
@Module({
  controllers: [TenantController],
  providers: [TenantService, TenantGuard, ConsolidatedReportingService],
  exports: [TenantService, TenantGuard, ConsolidatedReportingService],
})
export class TenantModule {}
