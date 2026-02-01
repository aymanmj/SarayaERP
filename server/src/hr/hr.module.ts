// src/hr/hr.module.ts

import { Module } from '@nestjs/common';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService], // للتصدير إذا احتجنا
})
export class HrModule {}
