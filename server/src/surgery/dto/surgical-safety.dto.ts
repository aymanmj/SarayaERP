import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ANESTHESIA_TYPES,
  ASA_CLASSES,
  SURGICAL_COUNT_CATEGORIES,
  WHO_CHECKLIST_PHASES,
  type AnesthesiaType,
  type AsaClass,
  type SurgicalCountCategory,
  type WhoChecklistPhase,
} from '../surgical-safety.util';

export class RecordWhoChecklistDto {
  @IsIn(WHO_CHECKLIST_PHASES)
  phase!: WhoChecklistPhase;

  @IsObject()
  checklistItems!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  siteMarked?: boolean;

  @IsOptional()
  @IsBoolean()
  consentConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  allergyChecked?: boolean;

  @IsOptional()
  @IsBoolean()
  antibioticProphylaxisGiven?: boolean;

  @IsOptional()
  @IsBoolean()
  imagingDisplayed?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  verifiedById?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateSurgicalCountItemDto {
  @IsIn(SURGICAL_COUNT_CATEGORIES)
  category!: SurgicalCountCategory;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  itemName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  initialCount!: number;
}

export class AddSurgicalCountDeltaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  addedDelta!: number;
}

export class VerifySurgicalCountDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ResolveSurgicalCountDiscrepancyDto {
  @IsIn(['RESOLVED_WITH_XRAY', 'ESCALATED_INCIDENT'])
  resolutionStatus!: 'RESOLVED_WITH_XRAY' | 'ESCALATED_INCIDENT';

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  resolutionNotes!: string;
}

export class SaveAnesthesiaRecordDto {
  @IsIn(ASA_CLASSES)
  asaClass!: AsaClass;

  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;

  @IsIn(ANESTHESIA_TYPES)
  anesthesiaType!: AnesthesiaType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  airwayManagement?: string;

  @IsOptional()
  @IsDateString()
  inductionTime?: string;

  @IsOptional()
  @IsDateString()
  emergenceTime?: string;

  @IsOptional()
  agentsUsed?: unknown;

  @IsOptional()
  vitalsTimeline?: unknown;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fluidsInMl?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedBloodLossMl?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  urineOutputMl?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  pacuAldreteScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  complications?: string;
}

export class SignDeliverySafetyDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
