// src/inventory/inventory.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Patch,
  Delete,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { MaterialRequestStatus } from '@prisma/client';

// ✅ Product UOM DTOs
class CreateProductUomDto {
  @IsInt()
  @Type(() => Number)
  uomId!: number;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  conversionRate!: number;

  @IsOptional()
  @IsBoolean()
  isPurchasingUOM?: boolean;

  @IsOptional()
  @IsBoolean()
  isIssuingUOM?: boolean;
}

// ✅ تعريف DTO للبند في التحويل المباشر
class TransferItemDto {
  @IsInt()
  @Type(() => Number)
  productId!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}

// ✅ تعريف DTO للتحويل المباشر
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

// ✅ تعريف DTO للبند في طلب المواد
class MaterialRequestItemDto {
  @IsInt()
  @Type(() => Number)
  productId!: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  uomId?: number;

  @Min(0.001)
  @Type(() => Number)
  requestedQty!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ✅ تعريف DTO لإنشاء طلب المواد
class CreateMaterialRequestDto {
  @IsInt()
  @Type(() => Number)
  requestingWarehouseId!: number;

  @IsInt()
  @Type(() => Number)
  fulfillingWarehouseId!: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  fromDepartmentId?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialRequestItemDto)
  items!: MaterialRequestItemDto[];
}

// ✅ DTO للصرف التفصيلي بالتشغيلات
class IssueItemDto {
  @IsInt()
  @Type(() => Number)
  productId!: number;

  @Min(0.001)
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;
}

class IssueMaterialRequestDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssueItemDto)
  items?: IssueItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

class RejectRequestDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // 🔔 لوحة تنبيهات المخزون
  @Get('alerts')
  @Permissions('inventory:view')
  async getStockAlerts(@CurrentUser() user: any) {
    return this.inventoryService.monitorStockLevels(user.hospitalId);
  }

  // عرض رصيد مخزن معين
  @Get('warehouses/:id/stock')
  @Permissions('inventory:view')
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

  // إجراء تحويل مخزني مباشر (بدون طلب)
  @Post('transfer')
  @Permissions('inventory:manage')
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

  // ====================================================
  //  مسارات دورة حياة طلب المواد وصرفها (Material Request)
  // ====================================================

  // إنشاء طلب مواد
  @Post('material-requests')
  @Permissions('inventory:manage')
  async createMaterialRequest(@Req() req: any, @Body() dto: CreateMaterialRequestDto) {
    return this.inventoryService.createMaterialRequest({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      requestingWarehouseId: dto.requestingWarehouseId,
      fulfillingWarehouseId: dto.fulfillingWarehouseId,
      fromDepartmentId: dto.fromDepartmentId,
      notes: dto.notes,
      items: dto.items,
    });
  }

  // جلب قائمة طلبات المواد مع تصفية اختيارية
  @Get('material-requests')
  @Permissions('inventory:view')
  async getMaterialRequests(
    @Req() req: any,
    @Query('status') status?: MaterialRequestStatus,
    @Query('q') search?: string,
  ) {
    return this.inventoryService.getMaterialRequests(req.user.hospitalId, {
      status,
      search,
    });
  }

  // جلب تفاصيل طلب مواد محدد
  @Get('material-requests/:id')
  @Permissions('inventory:view')
  async getMaterialRequestById(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inventoryService.getMaterialRequestById(req.user.hospitalId, id);
  }

  // اعتماد طلب مواد (للصرف)
  @Post('material-requests/:id/approve')
  @Permissions('inventory:manage')
  async approveMaterialRequest(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inventoryService.approveMaterialRequest(
      req.user.hospitalId,
      id,
      req.user.sub,
    );
  }

  // رفض طلب مواد مع شرح الأسباب
  @Post('material-requests/:id/reject')
  @Permissions('inventory:manage')
  async rejectMaterialRequest(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectRequestDto,
  ) {
    return this.inventoryService.rejectMaterialRequest(
      req.user.hospitalId,
      id,
      req.user.sub,
      dto.notes,
    );
  }

  // صرف طلب المواد (إنشاء إذن صرف مع FEFO وتخصيص التشغيلات الاختياري)
  @Post('material-requests/:id/issue')
  @Permissions('inventory:manage')
  async issueMaterialRequest(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueMaterialRequestDto,
  ) {
    return this.inventoryService.issueMaterialRequest({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      materialRequestId: id,
      notes: dto.notes,
      items: dto.items,
    });
  }

  // استلام إذن الصرف (تأكيد وصول المواد للمخزن المستلم)
  @Post('stock-issues/:id/receive')
  @Permissions('inventory:manage')
  async receiveStockIssue(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inventoryService.receiveStockIssue(
      req.user.hospitalId,
      id,
      req.user.sub,
    );
  }

  // ==========================================
  // Product UOM Management
  // ==========================================
  @Get('products')
  @Permissions('inventory:view')
  async getProducts(@CurrentUser() user: any) {
    return this.inventoryService.getProductsWithUoms(user.hospitalId);
  }

  @Post('products/:productId/uoms')
  @Permissions('inventory:manage')
  async addProductUom(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateProductUomDto,
  ) {
    return this.inventoryService.addProductUom(productId, dto);
  }

  @Delete('products/:productId/uoms/:uomId')
  @Permissions('inventory:manage')
  async removeProductUom(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('uomId', ParseIntPipe) uomId: number,
  ) {
    return this.inventoryService.removeProductUom(productId, uomId);
  }

  // ==========================================
  // Master Data
  // ==========================================
  @Get('master-data/categories')
  @Permissions('inventory:view')
  async getCategories(@CurrentUser() user: any) {
    return this.inventoryService.getItemCategories(user.hospitalId);
  }

  @Post('master-data/categories')
  @Permissions('inventory:manage')
  async createCategory(@CurrentUser() user: any, @Body() dto: any) {
    return this.inventoryService.createItemCategory(user.hospitalId, dto);
  }

  @Get('master-data/products')
  @Permissions('inventory:view')
  async getMasterProducts(@CurrentUser() user: any) {
    return this.inventoryService.getMasterProducts(user.hospitalId);
  }

  @Post('master-data/products')
  @Permissions('inventory:manage')
  async createProduct(@CurrentUser() user: any, @Body() dto: any) {
    return this.inventoryService.createProduct(user.hospitalId, dto);
  }
}
