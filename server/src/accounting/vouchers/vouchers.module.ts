import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { VouchersController } from './vouchers.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingModule } from '../accounting.module';

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [VouchersController],
  providers: [VouchersService],
})
export class VouchersModule {}
