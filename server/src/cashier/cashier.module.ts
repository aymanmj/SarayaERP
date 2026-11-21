// src/cashier/cashier.module.ts

import { Module } from '@nestjs/common';
import { CashierSessionsService } from './cashier-sessions.service';
import { CashierSessionsController } from './cashier-sessions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CashierService } from './cashier.service';
import { CashierController } from './cashier.controller';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, AccountingModule],
  providers: [CashierService, CashierSessionsService],
  controllers: [CashierController, CashierSessionsController],
})
export class CashierModule {}
