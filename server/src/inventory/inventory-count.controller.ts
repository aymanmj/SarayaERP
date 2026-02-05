import {
  Controller,
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

class CreateInventoryCountDto {
  @IsInt()
  @Type(() => Number)
  hospitalId: number;

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
// @UseGuards(JwtAuthGuard)
export class InventoryCountController {
  constructor(private readonly service: InventoryCountService) {}

  @Post()
  create(
    @Body() dto: CreateInventoryCountDto,
    // @GetUser() user: any
  ) {
    // Mock user for now if Auth not fully integrated in context
    // Using ID 99 (admin) which exists in the database
    const userId = 99; 
    return this.service.createDraftCount({
      ...dto,
      userId,
    });
  }

  @Get()
  findAll(@Query('hospitalId', ParseIntPipe) hospitalId: number) {
    return this.service.findAll(hospitalId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('hospitalId') hospitalId?: string,
  ) {
    return this.service.getCount(id, hospitalId ? Number(hospitalId) : undefined);
  }

  @Put(':id/lines/:lineId')
  updateLine(
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body('physicalQty') physicalQty: number,
  ) {
    return this.service.updateLine(lineId, physicalQty);
  }

  @Put(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: InventoryCountStatus,
  ) {
    return this.service.updateStatus(id, status);
  }

  @Post(':id/post')
  postCount(
    @Param('id', ParseIntPipe) id: number,
    // @GetUser() user: any
  ) {
    const userId = 1;
    return this.service.postCount(id, userId);
  }
  @Get('dashboard/stats')
  getDashboardStats(
    @Query('hospitalId', ParseIntPipe) hospitalId: number,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.getDashboardStats(
      hospitalId,
      warehouseId ? Number(warehouseId) : undefined,
    );
  }
}
