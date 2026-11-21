import { Module } from '@nestjs/common';
import { RefundWorklistController } from './refund-worklist.controller';
import { InvoiceRefundsController } from './invoice-refunds.controller';
import { InvoiceRefundsService } from './invoice-refunds.service';
import { InvoiceAdjustmentsController } from './invoice-adjustments.controller';
import { InvoiceAdjustmentsService } from './invoice-adjustments.service';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PatientDepositService } from './patient-deposit.service';
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
  providers: [
    BillingService,
    InvoiceAdjustmentsService,
    InvoiceRefundsService,
    PatientDepositService,
  ],
  controllers: [
    BillingController,
    InvoiceAdjustmentsController,
    InvoiceRefundsController,
    RefundWorklistController,
  ],
  exports: [BillingService, PatientDepositService],
})
export class BillingModule {}
