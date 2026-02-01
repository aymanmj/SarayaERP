// src/pharmacy/pharmacy.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
import { PharmacyController } from './pharmacy.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CDSSModule } from '../cdss/cdss.module';

@Module({
  imports: [
    PrismaModule,
    AccountingModule,
    forwardRef(() => CDSSModule),
  ],
  providers: [PharmacyService],
  controllers: [PharmacyController],
  exports: [PharmacyService],
})
export class PharmacyModule {}
