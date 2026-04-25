import { Module } from '@nestjs/common';
import { AiCodingService } from './ai-coding.service';
import { AiCodingController } from './ai-coding.controller';
import { VaultModule } from '../../common/vault/vault.module';

@Module({
  imports: [VaultModule],
  controllers: [AiCodingController],
  providers: [AiCodingService],
  exports: [AiCodingService],
})
export class AiCodingModule {}
