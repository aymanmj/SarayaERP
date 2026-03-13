import { Module } from '@nestjs/common';
import { IcuService } from './icu.service';
import { IcuController } from './icu.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [IcuController],
  providers: [IcuService],
  exports: [IcuService]
})
export class IcuModule {}
