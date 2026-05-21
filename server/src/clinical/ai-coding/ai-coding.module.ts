import { Module } from '@nestjs/common';
import { AiCodingService } from './ai-coding.service';
import { AiCodingController } from './ai-coding.controller';
import { FollowUpListener } from './follow-up.listener';
import { VaultModule } from '../../common/vault/vault.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PriceListsModule } from '../../price-lists/price-lists.module';
import { BillingModule } from '../../billing/billing.module';
import { ServicesModule } from '../../services/services.module';

@Module({
  imports: [
    VaultModule,
    PrismaModule,
    PriceListsModule,
    BillingModule,
    ServicesModule,
  ],
  controllers: [AiCodingController],
  providers: [AiCodingService, FollowUpListener],
  exports: [AiCodingService],
})
export class AiCodingModule {}
