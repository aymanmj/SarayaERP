import { Module } from '@nestjs/common';
import { OrderSetsService } from './order-sets.service';
import { OrderSetsController } from './order-sets.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { LabModule } from '../labs/labs.module';
import { RadiologyModule } from '../radiology/radiology.module';

@Module({
  imports: [PrismaModule, OrdersModule, LabModule, RadiologyModule],
  controllers: [OrderSetsController],
  providers: [OrderSetsService],
  exports: [OrderSetsService],
})
export class OrderSetsModule {}
