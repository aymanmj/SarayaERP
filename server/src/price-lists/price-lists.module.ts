import { Global, Module } from '@nestjs/common';
import { PriceListsService } from './price-lists.service';
import { PriceListsController } from './price-lists.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Global() // لكي نستخدم الخدمة في كل مكان دون استيراد الموديول كل مرة
@Module({
  imports: [PrismaModule],
  controllers: [PriceListsController],
  providers: [PriceListsService],
  exports: [PriceListsService],
})
export class PriceListsModule {}
