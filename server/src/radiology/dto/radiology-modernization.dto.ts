import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RADIOLOGY_CONTRAST_TYPES,
  RADIOLOGY_MODALITIES,
  RADIOLOGY_PREGNANCY_STATUSES,
  type RadiologyContrastType,
  type RadiologyModality,
  type RadiologyPregnancyStatus,
} from '../radiology-report.util';

export class CreateRadiologyOrdersDto {
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  studyIds!: number[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  doctorId?: number;

  @IsOptional()
  @IsIn(RADIOLOGY_PREGNANCY_STATUSES)
  pregnancyStatus?: RadiologyPregnancyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  contrastOverrideReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  radiationOverrideReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  stationId?: number;
}

export class CheckRadiologySafetyDto {
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  studyIds!: number[];

  @IsOptional()
  @IsIn(RADIOLOGY_PREGNANCY_STATUSES)
  pregnancyStatus?: RadiologyPregnancyStatus;
}

export class SaveRadiologyReportDto {
  @IsOptional()
  @IsString()
  reportText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  indicationText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  techniqueText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  findingsText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6000)
  impressionText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  biradsScore?: string;

  @IsOptional()
  @IsBoolean()
  isCriticalFinding?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  criticalFindingSummary?: string;

  @IsOptional()
  @IsBoolean()
  finalize?: boolean;
}

export class AddRadiologyAddendumDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  addendumText!: string;

  @IsOptional()
  @IsBoolean()
  isCriticalFinding?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  criticalFindingSummary?: string;
}

export class CancelRadiologyOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RecordRadiologyReadBackDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  notifiedToName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  notifiedToUserId?: number;

  @IsIn(['PHONE', 'IN_PERSON', 'DIRECT_MESSAGE', 'PAGER'])
  communicationChannel!: 'PHONE' | 'IN_PERSON' | 'DIRECT_MESSAGE' | 'PAGER';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  readBackNotes?: string;
}

export class CreateRadiologyStudyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  arabicName?: string;

  @IsIn(RADIOLOGY_MODALITIES)
  modality!: RadiologyModality;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  bodyPart?: string;

  @IsOptional()
  @IsBoolean()
  requiresContrast?: boolean;

  @IsOptional()
  @IsIn(RADIOLOGY_CONTRAST_TYPES)
  contrastType?: RadiologyContrastType;

  @IsOptional()
  @IsBoolean()
  ionizingRadiation?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minEgfrThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceItemId?: number;
}

export class CreateRadiologyTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsIn(RADIOLOGY_MODALITIES)
  modality?: RadiologyModality;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  bodyPart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  indicationTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  techniqueTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  findingsTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6000)
  impressionTemplate?: string;
}

export class CreateRadiologyStationDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{1,16}$/u)
  stationAet!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  stationName!: string;

  @IsIn(RADIOLOGY_MODALITIES)
  modality!: RadiologyModality;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roomLocation?: string;
}
