import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseIntPipe,
  Req,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

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

class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  name?: string;

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

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliers: SuppliersService) {}

  @Get()
  async list(@Req() req: any) {
    const hospitalId = req.user.hospitalId as number;
    return this.suppliers.listSuppliers(hospitalId);
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateSupplierDto) {
    const hospitalId = req.user.hospitalId as number;
    return this.suppliers.createSupplier(hospitalId, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ) {
    const hospitalId = req.user.hospitalId as number;
    return this.suppliers.updateSupplier(hospitalId, id, dto);
  }

  // ✅ الأفضل نخلي aging قبل statement (ترتيب فقط)
  @Get('aging')
  async aging(@Req() req: any, @Query('asOf') asOf?: string) {
    const hospitalId = req.user.hospitalId as number;

    let asOfDate: Date | undefined;

    if (asOf) {
      const d = new Date(asOf);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999); // ✅ نهاية اليوم
        asOfDate = d;
      }
    }

    return this.suppliers.getSuppliersAging(hospitalId, asOfDate);
  }

  @Get(':id/statement')
  async statement(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const hospitalId = req.user.hospitalId as number;

    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0); // ✅ بداية اليوم
        fromDate = d;
      }
    }

    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999); // ✅ نهاية اليوم
        toDate = d;
      }
    }

    return this.suppliers.getSupplierStatement(hospitalId, id, {
      fromDate,
      toDate,
    });
  }
}
