// src/purchases/purchases.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PurchasesService } from './purchases.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { ProcurementService } from './procurement.service';

class PurchaseInvoiceLineDto {
  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  unitPrice!: number;

  // (Posting Account: Expense OR Inventory)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  expenseAccountId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  inventoryItemId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  drugItemId?: number;
}

class CreatePurchaseInvoiceDto {
  @Type(() => Number)
  @IsNumber()
  supplierId!: number;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsDateString()
  invoiceDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  vatAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  warehouseId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceLineDto)
  lines!: PurchaseInvoiceLineDto[];
}

class UpdatePurchaseInvoiceDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  supplierId?: number;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsDateString()
  invoiceDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  vatAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * ✅ مهم جداً:
   * - نسمح بـ null فعلاً بدون ما تتحول إلى 0
   * - ونتحقق أنها رقم فقط لو كانت ليست null/undefined
   */
  @ValidateIf((o, v) => v !== undefined && v !== null)
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsNumber()
  warehouseId?: number | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceLineDto)
  lines!: PurchaseInvoiceLineDto[];
}

class CancelPurchaseInvoiceDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

class RecordSupplierPaymentDto {
  @Type(() => Number)
  @IsNumber()
  supplierId!: number;

  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN', 'ACCOUNTANT')
@Controller('purchases')
export class PurchasesController {
  constructor(
    private purchases: PurchasesService,
    private procurement: ProcurementService,
  ) {}

  @Get('invoices')
  async list(@Req() req: any) {
    const hospitalId = req.user.hospitalId as number;
    return this.purchases.listPurchaseInvoices(hospitalId);
  }

  @Get('invoices/:id')
  async getOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const hospitalId = req.user.hospitalId as number;
    return this.purchases.getPurchaseInvoice(hospitalId, id);
  }

  @Post('invoices')
  @Permissions('purchases:invoice:create')
  async createInvoice(@Req() req: any, @Body() dto: CreatePurchaseInvoiceDto) {
    const hospitalId = req.user.hospitalId as number;
    const userId = (req.user as any)?.id ?? (req.user as any)?.sub;

    return this.purchases.createPurchaseInvoice({
      hospitalId,
      supplierId: dto.supplierId,
      invoiceNumber: dto.invoiceNumber,
      invoiceDate: new Date(dto.invoiceDate),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      currency: dto.currency,
      discountAmount: dto.discountAmount,
      vatAmount: dto.vatAmount,
      notes: dto.notes,
      lines: dto.lines,
      userId,
      warehouseId: dto.warehouseId,
    });
  }

  @Post('invoices/:id/approve')
  @Permissions('purchases:invoice:approve')
  async approveInvoice(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const hospitalId = req.user.hospitalId as number;
    const userId = (req.user as any)?.id ?? (req.user as any)?.sub;

    return this.purchases.approvePurchaseInvoice({
      hospitalId,
      purchaseInvoiceId: id,
      userId,
    });
  }

  @Patch('invoices/:id')
  async updateInvoice(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseInvoiceDto,
  ) {
    const hospitalId = req.user.hospitalId as number;
    const userId = (req.user as any)?.id ?? (req.user as any)?.sub;

    return this.purchases.updatePurchaseInvoice({
      hospitalId,
      purchaseInvoiceId: id,
      userId,
      supplierId: dto.supplierId,
      invoiceNumber: dto.invoiceNumber,
      invoiceDate: new Date(dto.invoiceDate),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      currency: dto.currency,
      discountAmount: dto.discountAmount,
      vatAmount: dto.vatAmount,
      notes: dto.notes,
      warehouseId: dto.warehouseId,
      lines: dto.lines,
    });
  }

  @Post('invoices/:id/cancel')
  async cancelInvoice(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelPurchaseInvoiceDto,
  ) {
    const hospitalId = req.user.hospitalId as number;
    const userId = (req.user as any)?.id ?? (req.user as any)?.sub;

    return this.purchases.cancelPurchaseInvoice({
      hospitalId,
      purchaseInvoiceId: id,
      userId,
      reason: dto.reason,
    });
  }

  @Post('invoices/:id/payments')
  async recordPayment(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordSupplierPaymentDto,
  ) {
    const hospitalId = req.user.hospitalId as number;
    const userId = (req.user as any)?.id ?? (req.user as any)?.sub;

    return this.purchases.recordSupplierPayment({
      hospitalId,
      purchaseInvoiceId: id,
      supplierId: dto.supplierId,
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference,
      notes: dto.notes,
      userId,
    });
  }

  @Post('pr')
  async createPR(@Req() req: any, @Body() body: any) {
    return this.procurement.createPR({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      items: body.items,
      notes: body.notes,
    });
  }

  @Post('pr/:id/convert-to-po')
  async convertToPO(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { supplierId: number },
  ) {
    return this.procurement.createPOFromPR(
      req.user.hospitalId,
      req.user.sub,
      id,
      body.supplierId,
    );
  }

  @Post('grn')
  async createGRN(@Req() req: any, @Body() body: any) {
    return this.procurement.createGRN({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      poId: body.poId,
      warehouseId: body.warehouseId,
      items: body.items, // { productId, quantity, batchNumber, expiryDate }
      notes: body.notes,
    });
  }
}
