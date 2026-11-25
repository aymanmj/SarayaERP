import { Module } from '@nestjs/common';
import { LabService } from './labs.service';
import { LabController } from './labs.controller';
import { LabSpecimenService } from './lab-specimen.service';
import { LabSpecimenController } from './lab-specimen.controller';
import { LabQcService } from './lab-qc.service';
import { LabQcController } from './lab-qc.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, AccountingModule],
  providers: [LabService, LabSpecimenService, LabQcService],
  controllers: [LabSpecimenController, LabQcController, LabController],
  exports: [LabService, LabSpecimenService, LabQcService],
})
export class LabModule {}
