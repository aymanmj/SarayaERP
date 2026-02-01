import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FinancialYearsModule } from '../financial-years/financial-years.module';
import { AccountingModule } from '../accounting/accounting.module';
import { InsuranceModule } from '../insurance/insurance.module';

@Module({
  imports: [
    PrismaModule,
    FinancialYearsModule,
    AccountingModule,
    InsuranceModule,
  ],
  providers: [BillingService],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}
