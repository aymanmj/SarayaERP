import { Module } from '@nestjs/common';
import { SurgeryService } from './surgery.service';
import { SurgeryController } from './surgery.controller';
import { SurgicalSafetyService } from './surgical-safety.service';
import { SurgicalSafetyController } from './surgical-safety.controller';
import { SurgicalPackageService } from './surgical-package.service';
import { SurgicalPackageController } from './surgical-package.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CommissionModule } from '../commission/commission.module';

@Module({
  imports: [PrismaModule, AccountingModule, CommissionModule],
  controllers: [
    SurgicalSafetyController,
    SurgicalPackageController,
    SurgeryController,
  ],
  providers: [SurgeryService, SurgicalSafetyService, SurgicalPackageService],
  exports: [SurgicalSafetyService, SurgicalPackageService],
})
export class SurgeryModule {}
