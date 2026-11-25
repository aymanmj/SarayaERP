import { Module } from '@nestjs/common';
import { RadiologyService } from './radiology.service';
import { RadiologyController } from './radiology.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PriceListsModule } from '../price-lists/price-lists.module';
import { AccountingModule } from '../accounting/accounting.module';
import { RadiologyPacsController } from './radiology-pacs.controller';
import { RadiologyPacsService } from './radiology-pacs.service';
import { RadiologyMwlService } from './radiology-mwl.service';
import { AuthModule } from '../auth/auth.module';
import { RadiologyViewerController } from './radiology-viewer.controller';
import { RadiologyViewerService } from './radiology-viewer.service';
import { RadiologyDoseController } from './radiology-dose.controller';
import { RadiologyDoseService } from './radiology-dose.service';

@Module({
  imports: [PrismaModule, PriceListsModule, AccountingModule, AuthModule],
  providers: [
    RadiologyService,
    RadiologyPacsService,
    RadiologyMwlService,
    RadiologyViewerService,
    RadiologyDoseService,
  ],
  controllers: [
    RadiologyDoseController,
    RadiologyController,
    RadiologyPacsController,
    RadiologyViewerController,
  ],
  exports: [RadiologyService, RadiologyDoseService],
})
export class RadiologyModule {}
