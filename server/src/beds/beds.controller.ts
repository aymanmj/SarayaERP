import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { BedsService } from './beds.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
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

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('beds')
export class BedsController {
  constructor(private readonly bedsService: BedsService) {}

  // 🔹 ملخص حالة الأسرة (للتمريض/الإدارة)
  @Get('summary')
  @Permissions('beds:view')
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.bedsService.getSummary(user.hospitalId);
  }

  // 🔹 شجرة العنابر / الغرف / الأسرة (مفيدة للـ UI)
  @Get('tree')
  @Permissions('beds:view')
  getTree(@CurrentUser() user: JwtPayload) {
    return this.bedsService.listTree(user.hospitalId);
  }

  // 🔹 ربط Encounter بسرير (تنويم مريض)
  @Post('assign')
  @Permissions('beds:view')
  assignBed(@Body() dto: AssignBedDto, @CurrentUser() user: JwtPayload) {
    return this.bedsService.assignBed(
      user.hospitalId,
      dto.encounterId,
      dto.bedId,
    );
  }

  // 🔹 فك الربط (خروج المريض من السرير)
  @Post('release')
  @Permissions('beds:view')
  releaseBed(@Body() dto: ReleaseBedDto, @CurrentUser() user: JwtPayload) {
    return this.bedsService.releaseBed(user.hospitalId, dto.encounterId);
  }

  // 🔹 بعد انتهاء التنظيف: تحويل السرير من CLEANING إلى AVAILABLE
  @Post('mark-clean')
  @Permissions('beds:view') // لاحقًا نقدر نضيف ROLE خاص مثلاً HOUSEKEEPING
  markBedClean(@Body() dto: MarkBedCleanDto, @CurrentUser() user: JwtPayload) {
    return this.bedsService.markBedClean(user.hospitalId, dto.bedId);
  }

  // ✅ الإعدادات (Admin Only)
  @Post('wards')
  @Permissions('beds:manage')
  createWard(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.bedsService.createWard(user.hospitalId, body);
  }

  @Post('rooms')
  @Permissions('beds:manage')
  createRoom(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.bedsService.createRoom(
      user.hospitalId,
      body.wardId,
      body.roomNumber,
    );
  }

  @Post('beds')
  @Permissions('beds:manage')
  createBed(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.bedsService.createBed(
      user.hospitalId,
      body.roomId,
      body.bedNumber,
    );
  }

  // ============== EDIT / DELETE ENDPOINTS ==============

  @Patch('wards/:id')
  @Permissions('beds:manage')
  updateWard(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.bedsService.updateWard(user.hospitalId, id, body);
  }

  @Delete('wards/:id')
  @Permissions('beds:manage')
  deleteWard(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.bedsService.deleteWard(user.hospitalId, id);
  }

  @Patch('rooms/:id')
  @Permissions('beds:manage')
  updateRoom(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.bedsService.updateRoom(user.hospitalId, id, body);
  }

  @Delete('rooms/:id')
  @Permissions('beds:manage')
  deleteRoom(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.bedsService.deleteRoom(user.hospitalId, id);
  }

  @Patch('beds/:id')
  @Permissions('beds:manage')
  updateBed(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.bedsService.updateBed(user.hospitalId, id, body);
  }

  @Delete('beds/:id')
  @Permissions('beds:manage')
  deleteBed(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.bedsService.deleteBed(user.hospitalId, id);
  }

  // =====================================================

  @Get('services')
  @Permissions('beds:manage')
  getBedServices(@CurrentUser() user: JwtPayload) {
    return this.bedsService.getBedServices(user.hospitalId);
  }
}
