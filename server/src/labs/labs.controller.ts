// src/labs/labs.controller.ts

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { LabService } from './labs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { RequireFeature } from '../licensing/license.decorator';
import {
  IsArray,
  ArrayNotEmpty,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

class CreateLabOrdersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  testIds!: number[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  doctorId?: number;
}

class CompleteLabOrderDto {
  @IsOptional()
  @IsString()
  resultValue?: string;

  @IsOptional()
  @IsString()
  resultUnit?: string;

  @IsOptional()
  @IsString()
  referenceRange?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lab')
@RequireFeature('LAB')
export class LabController {
  constructor(private readonly labService: LabService) {}

  @Get('catalog')
  async getCatalog(@Req() req: any) {
    return this.labService.getCatalog(req.user.hospitalId);
  }

  @Get('encounters/:encounterId/orders')
  async listOrdersForEncounter(
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Req() req: any,
  ) {
    return this.labService.listOrdersForEncounter(
      encounterId,
      req.user.hospitalId,
    );
  }

  @Post('encounters/:encounterId/orders')
  @Permissions('labs:manage')
  async createOrdersForEncounter(
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Body() dto: CreateLabOrdersDto,
    @Req() req: any,
  ) {
    const doctorId = dto.doctorId ?? req.user.sub;
    return this.labService.createOrdersForEncounter({
      encounterId,
      hospitalId: req.user.hospitalId,
      doctorId,
      testIds: dto.testIds.map(Number),
      notes: dto.notes,
    });
  }

  @Get('worklist')
  @Permissions('labs:view')
  async worklist(@Req() req: any) {
    return this.labService.getWorklist(req.user.hospitalId);
  }

  // ✅ [NEW] زر بدء التحليل (يرسل HL7)
  @Post('orders/:id/start')
  @Permissions('labs:view')
  async startOrder(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.labService.startProcessing(
      req.user.hospitalId,
      id,
      req.user.sub,
    );
  }

  @Patch('orders/:id/complete')
  @Permissions('labs:view')
  async completeOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteLabOrderDto,
    @Req() req: any,
  ) {
    return this.labService.completeOrder({
      hospitalId: req.user.hospitalId,
      labOrderId: id,
      performedById: req.user.sub,
      resultValue: dto.resultValue,
      resultUnit: dto.resultUnit,
      referenceRange: dto.referenceRange,
    });
  }

  // ✅ [NEW] Endpoint لتقرير المختبر المجمع
  @Get('encounters/:id/print')
  @Permissions('labs:view')
  async getCumulativeReport(
    @Param('id', ParseIntPipe) encounterId: number,
    @Req() req: any,
  ) {
    return this.labService.getCumulativeReport(
      req.user.hospitalId,
      encounterId,
    );
  }
}
