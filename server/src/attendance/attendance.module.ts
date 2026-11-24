// src/attendance/attendance.module.ts

import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { BiometricAttendanceService } from './biometric-attendance.service';
import { BiometricAttendanceController } from './biometric-attendance.controller';
import { AdmsDeviceGuard } from './adms-device.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BiometricAttendanceController, AttendanceController],
  providers: [AttendanceService, BiometricAttendanceService, AdmsDeviceGuard],
  exports: [AttendanceService, BiometricAttendanceService],
})
export class AttendanceModule {}
