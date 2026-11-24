// server/src/surgery/dto/surgical-package.dto.ts
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const PACKAGE_CATEGORIES = [
  'ROOM',
  'SURGERY',
  'ANESTHESIA',
  'LAB',
  'RADIOLOGY',
  'PHARMACY',
  'CONSUMABLES',
  'CONSULTATION',
  'PROCEDURE',
] as const;

export const PACKAGE_COVERAGE_MODES = [
  'INCLUDED_UNLIMITED',
  'INCLUDED_CAPPED',
  'EXCLUDED',
] as const;

export class PackageInclusionInputDto {
  @IsIn(PACKAGE_CATEGORIES)
  category!: (typeof PACKAGE_CATEGORIES)[number];

  @IsIn(PACKAGE_COVERAGE_MODES)
  coverageMode!: (typeof PACKAGE_COVERAGE_MODES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  capAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class CreateSurgicalPackageDto {
  @IsString()
  @MaxLength(48)
  code!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  drgCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  packagePrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  includedStayDays?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PackageInclusionInputDto)
  inclusions!: PackageInclusionInputDto[];
}

export class EnrollEncounterPackageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  encounterId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  packageId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class SettlePackageEnrollmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
