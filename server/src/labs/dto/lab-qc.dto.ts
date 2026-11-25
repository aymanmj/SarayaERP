// server/src/labs/dto/lab-qc.dto.ts
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export const QC_LEVELS = [
  'LEVEL_1_LOW',
  'LEVEL_2_NORMAL',
  'LEVEL_3_HIGH',
] as const;

export class CreateLabQcLotDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  testId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  analyzerName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  lotNumber!: string;

  @IsIn(QC_LEVELS)
  level!: (typeof QC_LEVELS)[number];

  @Type(() => Number)
  @IsNumber()
  targetMean!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  targetSd!: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class RecordLabQcRunDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qcLotId!: number;

  @Type(() => Number)
  @IsNumber()
  measuredValue!: number;

  @IsOptional()
  @IsDateString()
  measuredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  correctiveAction?: string;
}

export class ReviewLabQcRunDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  correctiveAction!: string;
}
