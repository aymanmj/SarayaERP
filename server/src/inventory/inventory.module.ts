import { Module } from '@nestjs/common';
import { InventoryCountService } from './inventory-count.service';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';

import { InventoryAutoDepletionListener } from './inventory-auto-depletion.listener';

@Module({
  controllers: [InventoryCountController, InventoryController, WarehouseController],
  providers: [
    InventoryCountService,
    InventoryService,
    WarehouseService,
    PrismaService,
    AccountingService,
    InventoryAutoDepletionListener,
  ],
  exports: [InventoryService, WarehouseService],
})
export class InventoryModule {}
