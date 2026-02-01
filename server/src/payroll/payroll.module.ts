// src/payroll/payroll.module.ts

import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
// 👇 استيراد الموديول
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [
    PrismaModule,
    AccountingModule,
    AttendanceModule, // 👈 إضافة AttendanceModule هنا
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
