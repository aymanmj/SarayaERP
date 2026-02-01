import { Module } from '@nestjs/common';
import { NursingService } from './nursing.service';
import { NursingController } from './nursing.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NursingController],
  providers: [NursingService],
})
export class NursingModule {}
