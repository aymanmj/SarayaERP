// server/src/accounting/dto/budgets-cashflow.dto.ts
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertBudgetLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  financialYearId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  accountId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  costCenterId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period1?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period3?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period4?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period5?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period6?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period7?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period8?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period9?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period10?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period11?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  period12?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
