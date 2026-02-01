// src/purchases/purchases.module.ts

import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchaseReturnsController } from './purchase-returns.controller'; // ✅ [NEW]
import { PurchasesService } from './purchases.service';
import { ProcurementService } from './procurement.service';
import { PurchaseReturnsService } from './purchase-returns.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [PurchasesController, PurchaseReturnsController], // ✅ [NEW]
  providers: [
    PurchasesService,
    ProcurementService,
    PurchaseReturnsService,
  ],
  exports: [PurchasesService, ProcurementService, PurchaseReturnsService],
})
export class PurchasesModule {}

// // src/purchases/purchases.module.ts

// import { Module } from '@nestjs/common';
// import { PurchasesService } from './purchases.service';
// import { PurchasesController } from './purchases.controller';
// import { PrismaService } from '../prisma/prisma.service';
// import { AccountingService } from '../accounting/accounting.service';

// @Module({
//   controllers: [PurchasesController],
//   providers: [PurchasesService, PrismaService, AccountingService],
// })
// export class PurchasesModule {}
