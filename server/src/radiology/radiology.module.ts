import { Module } from '@nestjs/common';
import { RadiologyService } from './radiology.service';
import { RadiologyController } from './radiology.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PriceListsModule } from '../price-lists/price-lists.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, PriceListsModule, AccountingModule],
  providers: [RadiologyService],
  controllers: [RadiologyController],
  exports: [RadiologyService],
})
export class RadiologyModule {}
