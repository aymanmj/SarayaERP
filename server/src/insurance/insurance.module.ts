import { Module } from '@nestjs/common';
import { InsuranceService } from './insurance.service';
import { InsuranceController } from './insurance.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { InsuranceCalculationService } from './insurance-calculation.service';

import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [PrismaModule, AccountingModule, SystemSettingsModule],
  controllers: [InsuranceController],
  providers: [InsuranceService, InsuranceCalculationService],
  exports: [InsuranceService, InsuranceCalculationService], // نحتاجه في BillingService لاحقاً
})
export class InsuranceModule {}
