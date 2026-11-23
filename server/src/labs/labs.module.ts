import { Module } from '@nestjs/common';
import { LabService } from './labs.service';
import { LabController } from './labs.controller';
import { LabSpecimenService } from './lab-specimen.service';
import { LabSpecimenController } from './lab-specimen.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, AccountingModule],
  providers: [LabService, LabSpecimenService],
  controllers: [LabSpecimenController, LabController],
  exports: [LabService, LabSpecimenService],
})
export class LabModule {}
