// src/billing/dto/list-invoices.dto.ts

import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from '@prisma/client';

export class ListInvoicesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  financialYearId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  financialPeriodId?: number;

  @IsOptional()
  @IsEnum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'])
  status?: InvoiceStatus;
}
