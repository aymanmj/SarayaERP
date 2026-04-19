// src/cdss/cdss.module.ts
// =====================================================================
// نظام دعم القرار السريري (Clinical Decision Support System)
// =====================================================================

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CDSSService } from './cdss.service';
import { CDSSController } from './cdss.controller';
import { CdsHooksController } from './cds-hooks.controller';
import { CDSSListener } from './cdss.listener';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { LabModule } from '../labs/labs.module';
import { VitalsModule } from '../vitals/vitals.module';
import { TerminologyModule } from '../terminology/terminology.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PharmacyModule),
    LabModule,
    VitalsModule,
    TerminologyModule,
  ],
  controllers: [CDSSController, CdsHooksController],
  providers: [CDSSService, CDSSListener],
  exports: [CDSSService],
})
export class CDSSModule {}

