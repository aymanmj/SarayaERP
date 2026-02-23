import { Module } from '@nestjs/common';
import { ObstetricHistoryService } from './services/obstetric-history.service';
import { ObstetricHistoryController } from './controllers/obstetric-history.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { PatientsModule } from '../../patients/patients.module';
import { DeliveryService } from './services/delivery.service';
import { DeliveryController } from './controllers/delivery.controller';
import { AntenatalCareService } from './services/antenatal-care.service';
import { AntenatalCareController } from './controllers/antenatal-care.controller';
import { FertilityService } from './services/fertility.service';
import { FertilityController } from './controllers/fertility.controller';
import { BillingModule } from '../../billing/billing.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [PrismaModule, PatientsModule, BillingModule, NotificationsModule],
  controllers: [
    ObstetricHistoryController,
    DeliveryController,
    AntenatalCareController,
    FertilityController,
  ],
  providers: [
    ObstetricHistoryService,
    DeliveryService,
    AntenatalCareService,
    FertilityService,
  ],
  exports: [
    ObstetricHistoryService,
    DeliveryService,
    AntenatalCareService,
    FertilityService,
  ],
})
export class ObGynModule {}
