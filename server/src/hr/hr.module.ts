// src/hr/hr.module.ts

import { Module } from '@nestjs/common';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';
import { StaffCredentialingService } from './staff-credentialing.service';
import { StaffCredentialingController } from './staff-credentialing.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StaffCredentialingController, HrController],
  providers: [HrService, StaffCredentialingService],
  exports: [HrService, StaffCredentialingService],
})
export class HrModule {}
