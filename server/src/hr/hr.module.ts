// src/hr/hr.module.ts

import { Module } from '@nestjs/common';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';
import { StaffCredentialingService } from './staff-credentialing.service';
import { StaffCredentialingController } from './staff-credentialing.controller';
import { HrFinancialService } from './hr-financial.service';
import { HrFinancialController } from './hr-financial.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [
    StaffCredentialingController,
    HrFinancialController,
    HrController,
  ],
  providers: [HrService, StaffCredentialingService, HrFinancialService],
  exports: [HrService, StaffCredentialingService, HrFinancialService],
})
export class HrModule {}
