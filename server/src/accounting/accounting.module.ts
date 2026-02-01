// src/accounting/accounting.module.ts

import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingListener } from './listeners/accounting.listener';
import { CostCentersService } from './cost-centers.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountingController],
  providers: [AccountingService, AccountingListener, CostCentersService],
  exports: [AccountingService, CostCentersService],
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
