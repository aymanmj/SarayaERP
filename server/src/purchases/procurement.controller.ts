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
  NotFoundException,
} from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
  IsDateString,
  Min,
  IsNumber,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { POStatus } from '@prisma/client';

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

class PODirectItemDto {
  @IsInt()
  productId!: number;

  @IsInt()
  uomId!: number;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

class CreatePODirectDto {
  @IsInt()
  supplierId!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PODirectItemDto)
  items!: PODirectItemDto[];
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

  @Get('orders/:id')
  @Permissions('inventory:view')
  async getPOById(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, hospitalId: req.user.hospitalId },
      include: {
        supplier: true,
        createdBy: true,
        items: {
          include: {
            product: true,
            uom: true,
          },
        },
      },
    });
    if (!po) {
      throw new NotFoundException('أمر الشراء غير موجود');
    }
    return po;
  }

  @Post('orders')
  @Permissions('inventory:manage')
  async createPODirect(@Req() req: any, @Body() dto: CreatePODirectDto) {
    return this.procurementService.createPODirect({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      supplierId: dto.supplierId,
      notes: dto.notes,
      items: dto.items,
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

  @Patch('orders/:id/status')
  @Permissions('inventory:manage')
  async updatePOStatus(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: POStatus,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, hospitalId: req.user.hospitalId },
    });
    if (!po) {
      throw new NotFoundException('أمر الشراء غير موجود');
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status },
    });
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
      items: dto.items.map((i) => ({
        ...i,
        expiryDate: new Date(i.expiryDate),
      })),
      notes: dto.notes,
    });
  }
}
