// src/accounting/dto/close-financial-year.dto.ts

import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CloseFinancialYearDto {
  @IsInt()
  @Min(1)
  retainedEarningsAccountId: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export type CloseFinancialYearResultDto = {
  financialYearId: number;
  financialYearName: string;
  closingEntryId: number;
  totalRevenue: number;
  totalExpense: number;
  netProfit: number; // موجب = ربح، سالب = خسارة
};
