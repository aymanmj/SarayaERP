// src/purchases/procurement.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested, IsDateString, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

class CreateSupplierDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class PRItemDto {
  @IsInt()
  productId!: number;

  @IsInt()
  uomId!: number;

  @IsInt()
  @Min(1)
  quantity!: number;
}

class CreatePRDto {
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PRItemDto)
  items!: PRItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

class CreatePOFromPRDto {
  @IsInt()
  prId!: number;

  @IsInt()
  supplierId!: number;
}

class GRNItemDto {
  @IsInt()
  productId!: number;

  @IsInt()
  uomId!: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  batchNumber!: string;

  @IsDateString()
  expiryDate!: string;
}

class CreateGRNDto {
  @IsInt()
  poId!: number;

  @IsInt()
  warehouseId!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GRNItemDto)
  items!: GRNItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('procurement')
export class ProcurementController {
  constructor(
    private readonly procurementService: ProcurementService,
    private readonly prisma: PrismaService,
  ) {}

  // ==============================
  // Suppliers
  // ==============================

  @Get('suppliers')
  @Permissions('inventory:view') // Reusing inventory permissions for now, could be purchases:view
  async getSuppliers(@Req() req: any) {
    return this.prisma.supplier.findMany({
      where: { hospitalId: req.user.hospitalId, isActive: true },
    });
  }

  @Post('suppliers')
  @Permissions('inventory:manage')
  async createSupplier(@Req() req: any, @Body() dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: {
        hospitalId: req.user.hospitalId,
        ...dto,
      },
    });
  }

  // ==============================
  // Purchase Requests
  // ==============================

  @Get('requests')
  @Permissions('inventory:view')
  async getPRs(@Req() req: any) {
    return this.prisma.purchaseRequest.findMany({
      where: { hospitalId: req.user.hospitalId },
      include: {
        department: true,
        requestedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('requests')
  @Permissions('inventory:manage')
  async createPR(@Req() req: any, @Body() dto: CreatePRDto) {
    return this.procurementService.createPR({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      departmentId: dto.departmentId,
      items: dto.items,
      notes: dto.notes,
    });
  }

  // ==============================
  // Purchase Orders
  // ==============================

  @Get('orders')
  @Permissions('inventory:view')
  async getPOs(@Req() req: any) {
    return this.prisma.purchaseOrder.findMany({
      where: { hospitalId: req.user.hospitalId },
      include: {
        supplier: true,
        createdBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('orders/from-pr')
  @Permissions('inventory:manage')
  async createPOFromPR(@Req() req: any, @Body() dto: CreatePOFromPRDto) {
    return this.procurementService.createPOFromPR(
      req.user.hospitalId,
      req.user.sub,
      dto.prId,
      dto.supplierId,
    );
  }

  // ==============================
  // Goods Receipts
  // ==============================

  @Post('receipts')
  @Permissions('inventory:manage')
  async createGRN(@Req() req: any, @Body() dto: CreateGRNDto) {
    return this.procurementService.createGRN({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      poId: dto.poId,
      warehouseId: dto.warehouseId,
      items: dto.items.map(i => ({
        ...i,
        expiryDate: new Date(i.expiryDate),
      })),
      notes: dto.notes,
    });
  }
}
