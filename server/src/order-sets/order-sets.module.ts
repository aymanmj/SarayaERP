import { Module } from '@nestjs/common';
import { OrderSetsService } from './order-sets.service';
import { OrderSetsController } from './order-sets.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [PrismaModule, OrdersModule],
  controllers: [OrderSetsController],
  providers: [OrderSetsService],
  exports: [OrderSetsService],
})
export class OrderSetsModule {}
