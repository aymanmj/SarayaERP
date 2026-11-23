import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const SPECIMEN_TYPES = [
  'BLOOD_EDTA',
  'BLOOD_SERUM',
  'BLOOD_CULTURE',
  'URINE',
  'SWAB',
  'SPUTUM',
  'STOOL',
  'CSF',
  'TISSUE',
  'OTHER',
] as const;

export const REJECTION_CODES = [
  'HEMOLYZED',
  'CLOTTED',
  'INSUFFICIENT_VOLUME',
  'UNLABELED',
  'WRONG_CONTAINER',
  'LEAKED',
  'EXPIRED_TRANSPORT',
  'CONTAMINATED',
  'OTHER',
] as const;

export const GROWTH_STATUSES = [
  'NO_GROWTH',
  'MIXED_FLORA',
  'SIGNIFICANT_GROWTH',
  'CONTAMINATED',
] as const;

export const AST_INTERPRETATIONS = ['S', 'I', 'R', 'SDD'] as const;

export class CollectSpecimenDto {
  @IsInt()
  @IsPositive()
  labOrderId!: number;

  @IsIn(SPECIMEN_TYPES)
  specimenType!: (typeof SPECIMEN_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  containerType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  collectionSite?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  recollectionOfId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReceiveSpecimenDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectSpecimenDto {
  @IsIn(REJECTION_CODES)
  rejectionCode!: (typeof REJECTION_CODES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  rejectionReason!: string;

  @IsOptional()
  @IsBoolean()
  requestRecollection?: boolean;
}

export class UpdateSpecimenStatusDto {
  @IsIn(['IN_PROCESS', 'STORED', 'DISPOSED'])
  status!: 'IN_PROCESS' | 'STORED' | 'DISPOSED';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  storageLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CultureSensitivityItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  antibioticName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  antibioticCode?: string;

  @IsIn(AST_INTERPRETATIONS)
  interpretation!: (typeof AST_INTERPRETATIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  micValue?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  zoneDiameterMm?: number;

  @IsOptional()
  @IsBoolean()
  isRestricted?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class UpsertCultureReportDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  reportId?: number;

  @IsInt()
  @IsPositive()
  labOrderId!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  specimenId?: number;

  @IsOptional()
  @IsIn(['PRELIMINARY', 'INTERIM'])
  status?: 'PRELIMINARY' | 'INTERIM';

  @IsIn(GROWTH_STATUSES)
  growthStatus!: (typeof GROWTH_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  gramStain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organismName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  organismCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  colonyCount?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  incubationHours?: number;

  @IsOptional()
  @IsString()
  comments?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CultureSensitivityItemDto)
  sensitivities?: CultureSensitivityItemDto[];
}
