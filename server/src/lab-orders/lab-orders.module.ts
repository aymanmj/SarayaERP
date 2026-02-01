// src/lab-orders/lab-orders.module.ts

import { Module } from '@nestjs/common';
import { LabOrdersService } from './lab-orders.service';
import { LabOrdersController } from './lab-orders.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [LabOrdersController],
  providers: [LabOrdersService, PrismaService],
  exports: [LabOrdersService],
})
export class LabOrdersModule {}
