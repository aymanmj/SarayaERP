import { Module } from '@nestjs/common';
import { InventoryCountService } from './inventory-count.service';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';

@Module({
  controllers: [InventoryCountController, InventoryController],
  providers: [
    InventoryCountService,
    InventoryService,
    PrismaService,
    AccountingService,
  ],
})
export class InventoryModule {}
