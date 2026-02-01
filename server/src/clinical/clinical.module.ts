
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InpatientRoundsService } from './inpatient/inpatient-rounds.service';
import { InpatientRoundsController } from './inpatient/inpatient-rounds.controller';

@Module({
  imports: [PrismaModule],
  providers: [InpatientRoundsService],
  controllers: [InpatientRoundsController],
  exports: [InpatientRoundsService],
})
export class ClinicalModule {}
