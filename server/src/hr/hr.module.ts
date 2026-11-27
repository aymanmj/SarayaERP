// src/hr/hr.module.ts

import { Module } from '@nestjs/common';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
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
    EmployeesController,
    HrController,
  ],
  providers: [
    HrService,
    EmployeesService,
    StaffCredentialingService,
    HrFinancialService,
  ],
  exports: [
    HrService,
    EmployeesService,
    StaffCredentialingService,
    HrFinancialService,
  ],
})
export class HrModule {}
