import { Module } from '@nestjs/common';
import { AiCodingService } from './ai-coding.service';
import { AiCodingController } from './ai-coding.controller';
import { VaultModule } from '../../common/vault/vault.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PriceListsModule } from '../../price-lists/price-lists.module';

@Module({
  imports: [VaultModule, PrismaModule, PriceListsModule],
  controllers: [AiCodingController],
  providers: [AiCodingService],
  exports: [AiCodingService],
})
export class AiCodingModule {}
