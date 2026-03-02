// src/payroll/payroll.module.ts

import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { CommissionModule } from '../commission/commission.module';

@Module({
  imports: [
    PrismaModule,
    AccountingModule,
    AttendanceModule,
    CommissionModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}

// import { Module } from '@nestjs/common';
// import { PayrollService } from './payroll.service';
// import { PayrollController } from './payroll.controller';
// import { PrismaModule } from '../prisma/prisma.module';
// import { AccountingModule } from '../accounting/accounting.module';

// @Module({
//   imports: [PrismaModule, AccountingModule],
//   controllers: [PayrollController],
//   providers: [PayrollService],
// })
// export class PayrollModule {}
