import { Module } from '@nestjs/common';
import { InventoryCountService } from './inventory-count.service';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingModule } from '../accounting/accounting.module';
import { RecallDisposalController } from './recall-disposal.controller';
import { RecallDisposalService } from './recall-disposal.service';

import { InventoryAutoDepletionListener } from './inventory-auto-depletion.listener';
import {
  ConsumptionOperationsController,
  ConsumptionOperationsService,
} from './consumption-operations.controller';

@Module({
  imports: [AccountingModule],
  controllers: [
    RecallDisposalController,
    ConsumptionOperationsController,
    InventoryCountController,
    InventoryController,
    WarehouseController,
  ],
  providers: [
    RecallDisposalService,
    ConsumptionOperationsService,
    InventoryCountService,
    InventoryService,
    WarehouseService,
    PrismaService,
    InventoryAutoDepletionListener,
  ],
  exports: [InventoryService, WarehouseService],
})
export class InventoryModule {}
