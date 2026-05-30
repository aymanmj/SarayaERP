import { Module } from '@nestjs/common';
import { InventoryCountService } from './inventory-count.service';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingModule } from '../accounting/accounting.module';

import { InventoryAutoDepletionListener } from './inventory-auto-depletion.listener';

@Module({
  imports: [AccountingModule],
  controllers: [
    InventoryCountController,
    InventoryController,
    WarehouseController,
  ],
  providers: [
    InventoryCountService,
    InventoryService,
    WarehouseService,
    PrismaService,
    InventoryAutoDepletionListener,
  ],
  exports: [InventoryService, WarehouseService],
})
export class InventoryModule {}
