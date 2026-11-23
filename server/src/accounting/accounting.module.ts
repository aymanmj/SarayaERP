// src/accounting/accounting.module.ts

import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { TreasuryFxController } from './treasury-fx.controller';
import { CurrencyExchangeService } from './currency-exchange.service';
import { BankReconciliationService } from './bank-reconciliation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingListener } from './listeners/accounting.listener';
import { CostCentersService } from './cost-centers.service';

@Module({
  imports: [PrismaModule],
  controllers: [TreasuryFxController, AccountingController],
  providers: [
    AccountingService,
    AccountingListener,
    CostCentersService,
    CurrencyExchangeService,
    BankReconciliationService,
  ],
  exports: [
    AccountingService,
    CostCentersService,
    CurrencyExchangeService,
    BankReconciliationService,
  ],
})
export class AccountingModule {}

// // src/accounting/accounting.module.ts

// import { Module } from '@nestjs/common';
// import { AccountingService } from './accounting.service';
// import { AccountingController } from './accounting.controller';
// import { PrismaService } from '../prisma/prisma.service';
// import { FinancialYearsModule } from '../financial-years/financial-years.module';

// @Module({
//   imports: [FinancialYearsModule],
//   controllers: [AccountingController],
//   providers: [AccountingService, PrismaService],
//   exports: [AccountingService], // مهم: علشان نقدر نستخدمه في Modules أخرى
// })
// export class AccountingModule {}
