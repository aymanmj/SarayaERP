import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BloodBankService } from './blood-bank.service';
import { BloodBankController } from './blood-bank.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BloodBankController],
  providers: [BloodBankService],
  exports: [BloodBankService],
})
export class BloodBankModule {}
