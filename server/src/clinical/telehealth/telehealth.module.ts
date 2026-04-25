import { Module } from '@nestjs/common';
import { TelehealthService } from './telehealth.service';
import { TelehealthController } from './telehealth.controller';
import { VaultModule } from '../../common/vault/vault.module';

@Module({
  imports: [VaultModule],
  controllers: [TelehealthController],
  providers: [TelehealthService],
  exports: [TelehealthService],
})
export class TelehealthModule {}
