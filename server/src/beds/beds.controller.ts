import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { BedsService } from './beds.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class AssignBedDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  encounterId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  bedId: number;
}

class ReleaseBedDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  encounterId: number;
}

class MarkBedCleanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bedId: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('beds')
export class BedsController {
  constructor(private readonly bedsService: BedsService) {}

  // 🔹 ملخص حالة الأسرة (للتمريض/الإدارة)
  @Get('summary')
  @Roles('ADMIN', 'NURSE')
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.bedsService.getSummary(user.hospitalId);
  }

  // 🔹 شجرة العنابر / الغرف / الأسرة (مفيدة للـ UI)
  @Get('tree')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  getTree(@CurrentUser() user: JwtPayload) {
    return this.bedsService.listTree(user.hospitalId);
  }

  // 🔹 ربط Encounter بسرير (تنويم مريض)
  @Post('assign')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  assignBed(@Body() dto: AssignBedDto, @CurrentUser() user: JwtPayload) {
    return this.bedsService.assignBed(
      user.hospitalId,
      dto.encounterId,
      dto.bedId,
    );
  }

  // 🔹 فك الربط (خروج المريض من السرير)
  @Post('release')
  @Roles('ADMIN', 'NURSE')
  releaseBed(@Body() dto: ReleaseBedDto, @CurrentUser() user: JwtPayload) {
    return this.bedsService.releaseBed(user.hospitalId, dto.encounterId);
  }

  // 🔹 بعد انتهاء التنظيف: تحويل السرير من CLEANING إلى AVAILABLE
  @Post('mark-clean')
  @Roles('ADMIN', 'NURSE') // لاحقًا نقدر نضيف ROLE خاص مثلاً HOUSEKEEPING
  markBedClean(@Body() dto: MarkBedCleanDto, @CurrentUser() user: JwtPayload) {
    return this.bedsService.markBedClean(user.hospitalId, dto.bedId);
  }

  // ✅ الإعدادات (Admin Only)
  @Post('wards')
  @Roles('ADMIN')
  createWard(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.bedsService.createWard(user.hospitalId, body);
  }

  @Post('rooms')
  @Roles('ADMIN')
  createRoom(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.bedsService.createRoom(
      user.hospitalId,
      body.wardId,
      body.roomNumber,
    );
  }

  @Post('beds')
  @Roles('ADMIN')
  createBed(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.bedsService.createBed(
      user.hospitalId,
      body.roomId,
      body.bedNumber,
    );
  }

  @Get('services')
  @Roles('ADMIN')
  getBedServices(@CurrentUser() user: JwtPayload) {
    return this.bedsService.getBedServices(user.hospitalId);
  }
}
