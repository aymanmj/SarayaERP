// server/src/radiology/dto/radiology-dose.dto.ts
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const RADIATION_MODALITIES = [
  'CT',
  'DX',
  'CR',
  'MG',
  'RF',
  'XA',
  'NM',
  'PT',
] as const;

export class RecordRadiologyDoseDto {
  @IsIn(RADIATION_MODALITIES)
  modality!: (typeof RADIATION_MODALITIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bodyRegion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ctdiVolMgy?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dlpMgyCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dapGyCm2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  effectiveDoseMsv?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  kvp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mas?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  exposureCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
