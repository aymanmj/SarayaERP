import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Body,
  Param,
  Put,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { InventoryCountService } from './inventory-count.service';
import { InventoryCountStatus, InventoryCountType } from '@prisma/client';
import { IsInt, IsEnum, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';

class CreateInventoryCountDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  hospitalId?: number;

  @IsInt()
  @Type(() => Number)
  warehouseId: number;

  @IsEnum(['FULL', 'QUARTERLY', 'SPOT_CHECK'])
  type: InventoryCountType;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('inventory/counts')
@UseGuards(JwtAuthGuard)
export class InventoryCountController {
  constructor(private readonly service: InventoryCountService) {}

  private resolveHospitalId(user: JwtPayload, requestedHospitalId?: number) {
    if (requestedHospitalId == null) {
      return user.hospitalId;
    }

    if (user.isSuperAdmin) {
      return requestedHospitalId;
    }

    if (requestedHospitalId !== user.hospitalId) {
      throw new ForbiddenException('Hospital scope mismatch');
    }

    return user.hospitalId;
  }

  @Post()
  create(
    @Body() dto: CreateInventoryCountDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createDraftCount({
      hospitalId: this.resolveHospitalId(user, dto.hospitalId),
      warehouseId: dto.warehouseId,
      type: dto.type,
      notes: dto.notes,
      userId: user.sub,
    });
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('hospitalId') hospitalId?: string,
  ) {
    return this.service.findAll(
      this.resolveHospitalId(user, hospitalId ? Number(hospitalId) : undefined),
    );
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('hospitalId') hospitalId?: string,
  ) {
    return this.service.getCount(
      id,
      this.resolveHospitalId(user, hospitalId ? Number(hospitalId) : undefined),
    );
  }

  @Put(':id/lines/:lineId')
  updateLine(
    @CurrentUser() user: JwtPayload,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body('physicalQty') physicalQty: number,
  ) {
    return this.service.updateLine(lineId, physicalQty, user.hospitalId);
  }

  @Put(':id/status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: InventoryCountStatus,
  ) {
    return this.service.updateStatus(id, status, user.hospitalId);
  }

  @Post(':id/post')
  postCount(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.postCount(id, user.sub, user.hospitalId);
  }

  @Get('dashboard/stats')
  getDashboardStats(
    @CurrentUser() user: JwtPayload,
    @Query('hospitalId') hospitalId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.getDashboardStats(
      this.resolveHospitalId(user, hospitalId ? Number(hospitalId) : undefined),
      warehouseId ? Number(warehouseId) : undefined,
    );
  }
}
