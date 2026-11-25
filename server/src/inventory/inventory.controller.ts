import type { JwtPayload } from '../auth/jwt-payload.type';
// src/inventory/inventory.controller.ts

import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Put,
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
import { AuditInTransaction } from '../audit/audit.decorator';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsISO8601,
  MinLength,
  MaxLength,
  Matches,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import {
  InventoryBatchStatus,
  MaterialRequestStatus,
  RecallContactAudience,
  RecallContactChannel,
  RecallContactOutcome,
} from '@prisma/client';

// ✅ Product UOM DTOs
class CreateProductUomDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
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
  @Min(1)
  @Max(2147483647)
  @Type(() => Number)
  productId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Type(() => Number)
  quantity!: number;
}

// ✅ تعريف DTO للتحويل المباشر
class TransferStockDto {
  @IsUUID()
  requestKey!: string;
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @Type(() => Number)
  fromWarehouseId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
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
  @Min(1)
  @Max(2147483647)
  @Type(() => Number)
  productId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @Type(() => Number)
  uomId?: number;

  @IsNumber({ maxDecimalPlaces: 3 })
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
  @Min(1)
  @Max(2147483647)
  @Type(() => Number)
  requestingWarehouseId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  @Type(() => Number)
  fulfillingWarehouseId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
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
  @Min(1)
  @Max(2147483647)
  @Type(() => Number)
  productId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;
}

class IssueMaterialRequestDto {
  @IsUUID()
  requestKey!: string;
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

class SetBatchRestrictionDto {
  @IsEnum(InventoryBatchStatus)
  status!: InventoryBatchStatus;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

class RecallIsolationDto {
  @IsInt()
  @Min(1)
  stockVersion!: number;

  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/)
  isolatedQuantity!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  location!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;

  @IsUUID('4')
  requestId!: string;
}

class RecallTraceQuery {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  before?: number;
}

class RecallContactQuery extends RecallTraceQuery {
  @IsEnum(RecallContactAudience)
  audience!: RecallContactAudience;
}

class RecallContactDto {
  @IsEnum(RecallContactAudience)
  audience!: RecallContactAudience;

  @IsEnum(RecallContactOutcome)
  outcome!: RecallContactOutcome;

  @IsEnum(RecallContactChannel)
  channel!: RecallContactChannel;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;

  @IsUUID('4')
  requestId!: string;
}

class RecallSupplierReceiptDto {
  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/)
  quantity!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  evidenceReference!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  receivedBy!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  receivedAt!: string;

  @IsUUID('4')
  requestId!: string;
}

function canViewRecallPatients(user: JwtPayload) {
  return (
    user.roles.includes('ADMIN') ||
    user.permissions.includes('ADMIN_FULL_ACCESS') ||
    user.permissions.includes('patients:view')
  );
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stock/:id/recall-followup')
  @Header('Cache-Control', 'no-store')
  @Permissions('inventory:manage')
  getRecallFollowup(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) stockId: number,
    @Query() query: RecallTraceQuery,
  ) {
    return this.inventoryService.recallFollowup(
      user.hospitalId,
      user.sub,
      stockId,
      canViewRecallPatients(user),
      query.before,
    );
  }

  @Get('stock/:id/recall-contacts/:movementId')
  @Header('Cache-Control', 'no-store')
  @Permissions('inventory:manage')
  getRecallContacts(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) stockId: number,
    @Param('movementId', ParseIntPipe) movementId: number,
    @Query() query: RecallContactQuery,
  ) {
    return this.inventoryService.recallContacts(
      user.hospitalId,
      user.sub,
      stockId,
      movementId,
      query.audience,
      canViewRecallPatients(user),
      query.before,
    );
  }

  @Post('stock/:id/recall-contacts/:movementId')
  @Permissions('inventory:manage')
  saveRecallContact(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) stockId: number,
    @Param('movementId', ParseIntPipe) movementId: number,
    @Body() body: RecallContactDto,
  ) {
    return this.inventoryService.recordRecallContact(
      user.hospitalId,
      user.sub,
      stockId,
      movementId,
      canViewRecallPatients(user),
      body,
    );
  }

  @Get('stock/:id/recall-supplier-receipts/:movementId')
  @Header('Cache-Control', 'no-store')
  @Permissions('inventory:manage')
  getRecallSupplierReceipts(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) stockId: number,
    @Param('movementId', ParseIntPipe) movementId: number,
    @Query() query: RecallTraceQuery,
  ) {
    return this.inventoryService.recallSupplierReceipts(
      user.hospitalId,
      stockId,
      movementId,
      query.before,
    );
  }

  @Post('stock/:id/recall-supplier-receipts/:movementId')
  @Permissions('inventory:manage')
  saveRecallSupplierReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) stockId: number,
    @Param('movementId', ParseIntPipe) movementId: number,
    @Body() body: RecallSupplierReceiptDto,
  ) {
    return this.inventoryService.recordRecallSupplierReceipt(
      user.hospitalId,
      user.sub,
      stockId,
      movementId,
      body,
    );
  }

  @Post('stock/:id/recall-isolation')
  @Permissions('inventory:manage')
  recordRecallIsolation(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) stockId: number,
    @Body() body: RecallIsolationDto,
  ) {
    return this.inventoryService.recordRecallIsolation(
      user.hospitalId,
      user.sub,
      stockId,
      body,
    );
  }

  @Post('stock/:id/batch-restriction')
  @Permissions('inventory:manage')
  setBatchRestriction(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) stockId: number,
    @Body() body: SetBatchRestrictionDto,
  ) {
    return this.inventoryService.changeBatchRestriction(
      user.hospitalId,
      user.sub,
      stockId,
      body.status,
      body.reason,
    );
  }

  // 🔔 لوحة تنبيهات المخزون
  @Get('alerts')
  @Permissions('inventory:view')
  async getStockAlerts(@CurrentUser() user: JwtPayload) {
    return this.inventoryService.monitorStockLevels(user.hospitalId);
  }

  // عرض رصيد مخزن معين
  @Get('warehouses/:id/stock')
  @Permissions('inventory:view')
  async getWarehouseStock(
    @Req() req: { user: JwtPayload },
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
  @Permissions('inventory:view', 'inventory:manage')
  @Get('warehouses')
  async listWarehouses(@Req() req: { user: JwtPayload }) {
    return this.inventoryService.listWarehouses(req.user.hospitalId);
  }

  // إجراء تحويل مخزني مباشر (بدون طلب)
  @Get('in-transit')
  @Permissions('inventory:view')
  getInTransit(@CurrentUser() user: { hospitalId: number }) {
    return this.inventoryService.getInTransit(user.hospitalId);
  }

  @Post('transfer')
  @Permissions('inventory:manage')
  @AuditInTransaction()
  async transferStock(
    @Req() req: { user: JwtPayload },
    @Body() dto: TransferStockDto,
  ) {
    return this.inventoryService.transferStock({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      fromWarehouseId: dto.fromWarehouseId,
      requestKey: dto.requestKey,
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
  async createMaterialRequest(
    @Req() req: { user: JwtPayload },
    @Body() dto: CreateMaterialRequestDto,
  ) {
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
    @Req() req: { user: JwtPayload },
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
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inventoryService.getMaterialRequestById(
      req.user.hospitalId,
      id,
    );
  }

  // اعتماد طلب مواد (للصرف)
  @Post('material-requests/:id/approve')
  @Permissions('inventory:manage')
  async approveMaterialRequest(
    @Req() req: { user: JwtPayload },
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
    @Req() req: { user: JwtPayload },
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
  @AuditInTransaction()
  async issueMaterialRequest(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueMaterialRequestDto,
  ) {
    return this.inventoryService.issueMaterialRequest({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      materialRequestId: id,
      requestKey: dto.requestKey,
      notes: dto.notes,
      items: dto.items,
    });
  }

  // استلام إذن الصرف (تأكيد وصول المواد للمخزن المستلم)
  @Post('stock-issues/:id/receive')
  @Permissions('inventory:manage')
  @AuditInTransaction()
  async receiveStockIssue(
    @Req() req: { user: JwtPayload },
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
  async getProducts(@CurrentUser() user: JwtPayload) {
    return this.inventoryService.getProductsWithUoms(user.hospitalId);
  }

  @Post('products/:productId/uoms')
  @Permissions('inventory:manage')
  async addProductUom(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateProductUomDto,
  ) {
    return this.inventoryService.addProductUom(user.hospitalId, productId, dto);
  }

  @Delete('products/:productId/uoms/:uomId')
  @Permissions('inventory:manage')
  async removeProductUom(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseIntPipe) productId: number,
    @Param('uomId', ParseIntPipe) uomId: number,
  ) {
    return this.inventoryService.removeProductUom(
      user.hospitalId,
      productId,
      uomId,
    );
  }

  // ==========================================
  // Master Data
  // ==========================================
  @Get('master-data/categories')
  @Permissions('inventory:view')
  async getCategories(@CurrentUser() user: JwtPayload) {
    return this.inventoryService.getItemCategories(user.hospitalId);
  }

  @Post('master-data/categories')
  @Permissions('inventory:manage')
  async createCategory(@CurrentUser() user: JwtPayload, @Body() dto: any) {
    return this.inventoryService.createItemCategory(user.hospitalId, dto);
  }

  @Get('master-data/products')
  @Permissions('inventory:view')
  async getMasterProducts(@CurrentUser() user: JwtPayload) {
    return this.inventoryService.getMasterProducts(user.hospitalId);
  }

  @Post('master-data/products')
  @Permissions('inventory:manage')
  async createProduct(@CurrentUser() user: JwtPayload, @Body() dto: any) {
    return this.inventoryService.createProduct(user.hospitalId, dto);
  }

  @Get('master-data/uoms')
  @Permissions('inventory:view')
  async getUOMs(@CurrentUser() user: JwtPayload) {
    return this.inventoryService.getUOMs(user.hospitalId);
  }

  @Post('master-data/uoms')
  @Permissions('inventory:manage')
  async createUOM(@CurrentUser() user: JwtPayload, @Body() dto: any) {
    return this.inventoryService.createUOM(user.hospitalId, dto);
  }

  @Put('master-data/uoms/:id')
  @Permissions('inventory:manage')
  async updateUOM(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    return this.inventoryService.updateUOM(user.hospitalId, id, dto);
  }

  @Delete('master-data/uoms/:id')
  @Permissions('inventory:manage')
  async deleteUOM(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inventoryService.deleteUOM(user.hospitalId, id);
  }
}
