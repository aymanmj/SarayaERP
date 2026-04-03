import { Module } from '@nestjs/common';
import { ClinicalPathwaysService } from './clinical-pathways.service';
import { ClinicalPathwaysController } from './clinical-pathways.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderSetsModule } from '../order-sets/order-sets.module';

@Module({
  imports: [PrismaModule, OrderSetsModule],
  controllers: [ClinicalPathwaysController],
  providers: [ClinicalPathwaysService],
  exports: [ClinicalPathwaysService],
})
export class ClinicalPathwaysModule {}
