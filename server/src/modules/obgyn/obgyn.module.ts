import { Module } from '@nestjs/common';
import { ObstetricHistoryService } from './services/obstetric-history.service';
import { ObstetricHistoryController } from './controllers/obstetric-history.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { PatientsModule } from '../../patients/patients.module';
import { DeliveryService } from './services/delivery.service';
import { DeliveryController } from './controllers/delivery.controller';

import { BillingModule } from '../../billing/billing.module';

@Module({
  imports: [PrismaModule, PatientsModule, BillingModule],
  controllers: [ObstetricHistoryController, DeliveryController],
  providers: [ObstetricHistoryService, DeliveryService],
  exports: [ObstetricHistoryService, DeliveryService],
})
export class ObGynModule {}
