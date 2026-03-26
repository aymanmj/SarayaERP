import { Module } from '@nestjs/common';
import { IcuService } from './icu.service';
import { IcuController } from './icu.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [IcuController],
  providers: [IcuService],
  exports: [IcuService]
})
export class IcuModule {}
