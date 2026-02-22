import { Module } from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { EncountersController } from './encounters.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SoftDeleteService } from '../common/soft-delete.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { PriceListsModule } from '../price-lists/price-lists.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, SystemSettingsModule, PriceListsModule, AccountingModule],
  providers: [EncountersService, SoftDeleteService],
  controllers: [EncountersController],
  exports: [EncountersService],
})
export class EncountersModule {}

