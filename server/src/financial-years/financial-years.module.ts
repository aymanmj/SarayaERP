// src/financial-years/financial-years.module.ts

import { Module } from '@nestjs/common';
import { FinancialYearsService } from './financial-years.service';
import { FinancialYearsController } from './financial-years.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, AccountingModule],
  providers: [FinancialYearsService],
  controllers: [FinancialYearsController],
  exports: [FinancialYearsService],
})
export class FinancialYearsModule {}
