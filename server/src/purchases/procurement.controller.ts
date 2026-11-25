import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { CreateGoodsReceiptDto } from './dto/goods-receipt.dto';
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
import { AuditInTransaction } from '../audit/audit.decorator';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
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
  async getSuppliers(@Req() req: { user: JwtPayload }) {
    return this.prisma.supplier.findMany({
      where: { hospitalId: req.user.hospitalId, isActive: true },
    });
  }

  @Post('suppliers')
  @Permissions('inventory:manage')
  async createSupplier(
    @Req() req: { user: JwtPayload },
    @Body() dto: CreateSupplierDto,
  ) {
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
  async getPRs(@Req() req: { user: JwtPayload }) {
    return this.prisma.purchaseRequest.findMany({
      where: { hospitalId: req.user.hospitalId },
      include: {
        department: true,
        requestedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('requests')
  @Permissions('inventory:manage')
  async createPR(@Req() req: { user: JwtPayload }, @Body() dto: CreatePRDto) {
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
  async getPOs(@Req() req: { user: JwtPayload }) {
    return this.prisma.purchaseOrder.findMany({
      where: { hospitalId: req.user.hospitalId },
      include: {
        supplier: true,
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('orders/:id')
  @Permissions('inventory:view')
  async getPOById(
    @Req() req: { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, hospitalId: req.user.hospitalId },
      include: {
        supplier: true,
        createdBy: { select: { id: true, fullName: true } },
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
    return {
      ...po,
      items: po.items.map((item) => ({
        ...item,
        remainingQuantity: item.quantity
          .minus(item.receivedQuantity)
          .toFixed(3),
      })),
    };
  }

  @Post('orders')
  @Permissions('inventory:manage')
  async createPODirect(
    @Req() req: { user: JwtPayload },
    @Body() dto: CreatePODirectDto,
  ) {
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
  async createPOFromPR(
    @Req() req: { user: JwtPayload },
    @Body() dto: CreatePOFromPRDto,
  ) {
    return this.procurementService.createPOFromPR(
      req.user.hospitalId,
      req.user.sub,
      dto.prId,
      dto.supplierId,
    );
  }

  @Patch('orders/:id/status')
  @Permissions('inventory:manage')
  @AuditInTransaction()
  async updatePOStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: POStatus,
  ) {
    return this.procurementService.updatePOStatus(
      user.hospitalId,
      user.sub,
      id,
      status,
    );
  }

  // ==============================
  // Goods Receipts
  // ==============================

  @Post('receipts')
  @Permissions('inventory:manage')
  @AuditInTransaction()
  async createGRN(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateGoodsReceiptDto,
  ) {
    return this.procurementService.createGRN({
      hospitalId: user.hospitalId,
      userId: user.sub,
      requestId: dto.requestId,
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
