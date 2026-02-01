// src/financial-years/dto/create-financial-year.dto.ts

import { IsInt, Min, Max, IsOptional, IsString, IsISO8601 } from 'class-validator';

export class CreateFinancialYearDto {
  @IsInt()
  @Min(1900)
  @Max(2100)
  year: number;

  @IsOptional()
  @IsString()
  name?: string;         // اسم السنة (اختياري)

  @IsOptional()
  @IsString()
  description?: string;  // ملاحظات / وصف (اختياري)

  @IsISO8601()
  startDate: string;     // "2024-12-26"

  @IsISO8601()
  endDate: string;       // "2025-12-25"
}
