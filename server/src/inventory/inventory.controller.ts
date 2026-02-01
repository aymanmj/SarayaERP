// src/inventory/inventory.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CurrentUser } from '../auth/current-user.decorator'; // 👈
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

// ✅ تعريف DTO قوي للبنود
class TransferItemDto {
  @IsInt()
  @Type(() => Number)
  productId!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}

// ✅ تعريف DTO لطلب التحويل
class TransferStockDto {
  @IsInt()
  @Type(() => Number)
  fromWarehouseId!: number;

  @IsInt()
  @Type(() => Number)
  toWarehouseId!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items!: TransferItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // 🔔 لوحة تنبيهات المخزون
  @Get('alerts')
  @Roles('ADMIN', 'PHARMACIST', 'STORE_MANAGER')
  async getStockAlerts(@CurrentUser() user: any) {
    return this.inventoryService.monitorStockLevels(user.hospitalId);
  }

  // عرض رصيد مخزن معين
  @Get('warehouses/:id/stock')
  @Roles('ADMIN', 'PHARMACIST', 'STORE_KEEPER', 'DOCTOR') // أضفنا DOCTOR للمعاينة
  async getWarehouseStock(
    @Req() req: any,
    @Param('id', ParseIntPipe) warehouseId: number,
    @Query('q') search?: string,
  ) {
    return this.inventoryService.getWarehouseStock(
      req.user.hospitalId,
      warehouseId,
      search,
    );
  }

  // قائمة المخازن
  @Get('warehouses')
  async listWarehouses(@Req() req: any) {
    return this.inventoryService.listWarehouses(req.user.hospitalId);
  }

  // إجراء تحويل مخزني
  @Post('transfer')
  @Roles('ADMIN', 'STORE_KEEPER')
  async transferStock(@Req() req: any, @Body() dto: TransferStockDto) {
    return this.inventoryService.transferStock({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      fromWarehouseId: dto.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId,
      items: dto.items,
      notes: dto.notes,
    });
  }
}
