// src/cashier/cashier.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CashierService } from './cashier.service';
import { CashierController } from './cashier.controller';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, AccountingModule],
  providers: [CashierService],
  controllers: [CashierController],
})
export class CashierModule {}
