import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { IsInt, IsEnum, IsOptional, IsString, Min } from 'class-validator';
import { LabResultStatus, RadiologyStatus } from '@prisma/client';
import { Type } from 'class-transformer';

class CreateLabOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  encounterId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  testId: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

class CreateRadiologyOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  encounterId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  studyId: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

class UpdateLabResultDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  labOrderId: number;

  @IsOptional()
  @IsString()
  resultValue?: string;

  @IsOptional()
  @IsString()
  resultUnit?: string;

  @IsOptional()
  @IsString()
  referenceRange?: string;

  @IsEnum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  resultStatus: LabResultStatus;
}

class UpdateRadiologyReportDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  radiologyOrderId: number;

  @IsEnum(['PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'IN_PROGRESS'])
  status: RadiologyStatus;

  @IsOptional()
  @IsString()
  reportText?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('lab')
  @Roles('ADMIN', 'DOCTOR')
  createLabOrder(
    @Body() dto: CreateLabOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.createLabOrder({
      hospitalId: user.hospitalId,
      encounterId: dto.encounterId,
      orderedById: user.sub,
      testId: dto.testId,
      notes: dto.notes,
    });
  }

  @Post('radiology')
  @Roles('ADMIN', 'DOCTOR')
  createRadiologyOrder(
    @Body() dto: CreateRadiologyOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.createRadiologyOrder({
      hospitalId: user.hospitalId,
      encounterId: dto.encounterId,
      orderedById: user.sub,
      studyId: dto.studyId,
      notes: dto.notes,
    });
  }

  @Get('by-encounter/:id')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  listForEncounter(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const encId = Number(id);
    if (!encId || Number.isNaN(encId)) {
      throw new BadRequestException('رقم Encounter غير صحيح');
    }

    return this.ordersService.listForEncounter(user.hospitalId, encId);
  }

  // 🔹 تسجيل / تحديث نتيجة معملية
  @Post('lab/result')
  @Roles('ADMIN', 'DOCTOR') // لاحقًا: LAB_TECH
  updateLabResult(
    @Body() dto: UpdateLabResultDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.updateLabResult({
      hospitalId: user.hospitalId,
      labOrderId: dto.labOrderId,
      resultValue: dto.resultValue,
      resultUnit: dto.resultUnit,
      referenceRange: dto.referenceRange,
      resultStatus: dto.resultStatus,
    });
  }

  // 🔹 تسجيل / تحديث تقرير أشعة
  @Post('radiology/report')
  @Roles('ADMIN', 'DOCTOR') // لاحقًا: RADIOLOGIST
  updateRadiologyReport(
    @Body() dto: UpdateRadiologyReportDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.updateRadiologyReport({
      hospitalId: user.hospitalId,
      radiologyOrderId: dto.radiologyOrderId,
      status: dto.status,
      reportText: dto.reportText,
    });
  }
}
