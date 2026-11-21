import { BillingModule } from '../billing/billing.module';
import { Module } from '@nestjs/common';
import { AdmissionController } from './admission.controller';
import { AdmissionService } from './admission.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [
    BillingModule,
    PrismaModule,
    AuthModule,
    SystemSettingsModule,
    AccountingModule,
  ],
  controllers: [AdmissionController],
  providers: [AdmissionService],
  exports: [AdmissionService],
})
export class AdmissionModule {}
