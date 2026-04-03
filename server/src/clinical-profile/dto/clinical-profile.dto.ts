// src/clinical-profile/dto/clinical-profile.dto.ts
// =====================================================================
// DTOs للسجل الطبي الشامل (Patient Clinical Profile)
// =====================================================================

import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEnum,
  IsDateString,
  IsNotEmpty,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ======================== Problem List DTOs ========================

export enum ProblemTypeDto {
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
  CHRONIC = 'CHRONIC',
  INACTIVE = 'INACTIVE',
}

export enum ProblemSeverityDto {
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  LIFE_THREATENING = 'LIFE_THREATENING',
}

export class CreateProblemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsInt()
  diagnosisCodeId?: number;

  @IsOptional()
  @IsEnum(ProblemTypeDto)
  type?: ProblemTypeDto;

  @IsOptional()
  @IsEnum(ProblemSeverityDto)
  severity?: ProblemSeverityDto;

  @IsOptional()
  @IsDateString()
  onsetDate?: string;

  @IsOptional()
  @IsDateString()
  resolvedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isChronic?: boolean;
}

export class UpdateProblemDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProblemTypeDto)
  type?: ProblemTypeDto;

  @IsOptional()
  @IsEnum(ProblemSeverityDto)
  severity?: ProblemSeverityDto;

  @IsOptional()
  @IsDateString()
  resolvedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isChronic?: boolean;
}

// ======================== Medical History DTOs ========================

export enum SmokingStatusDto {
  NEVER = 'NEVER',
  FORMER = 'FORMER',
  CURRENT = 'CURRENT',
  UNKNOWN = 'UNKNOWN',
}

export class UpsertMedicalHistoryDto {
  @IsOptional()
  @IsEnum(SmokingStatusDto)
  smokingStatus?: SmokingStatusDto;

  @IsOptional()
  @IsString()
  alcoholUse?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  exerciseLevel?: string;

  @IsOptional()
  @IsString()
  dietNotes?: string;

  @IsOptional()
  @IsString()
  socialNotes?: string;

  @IsOptional()
  @IsString()
  mobilityStatus?: string;

  @IsOptional()
  @IsString()
  adlStatus?: string;
}

// ======================== PMH Entry DTOs ========================

export class CreatePMHEntryDto {
  @IsString()
  @IsNotEmpty()
  condition: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  diagnosisYear?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ======================== Surgical History DTOs ========================

export class CreateSurgicalEntryDto {
  @IsString()
  @IsNotEmpty()
  procedure: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  surgeryYear?: number;

  @IsOptional()
  @IsString()
  hospitalName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ======================== Family History DTOs ========================

export enum FamilyRelationDto {
  FATHER = 'FATHER',
  MOTHER = 'MOTHER',
  BROTHER = 'BROTHER',
  SISTER = 'SISTER',
  SON = 'SON',
  DAUGHTER = 'DAUGHTER',
  GRANDFATHER = 'GRANDFATHER',
  GRANDMOTHER = 'GRANDMOTHER',
  UNCLE = 'UNCLE',
  AUNT = 'AUNT',
  OTHER = 'OTHER',
}

export class CreateFamilyHistoryDto {
  @IsEnum(FamilyRelationDto)
  relation: FamilyRelationDto;

  @IsString()
  @IsNotEmpty()
  condition: string;

  @IsOptional()
  @IsInt()
  ageOfOnset?: number;

  @IsOptional()
  @IsBoolean()
  isDeceased?: boolean;

  @IsOptional()
  @IsString()
  causeOfDeath?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ======================== Home Medication DTOs ========================

export enum MedicationSourceDto {
  PATIENT_REPORTED = 'PATIENT_REPORTED',
  PHARMACY_RECORD = 'PHARMACY_RECORD',
  REFERRAL_LETTER = 'REFERRAL_LETTER',
  PREVIOUS_ADMISSION = 'PREVIOUS_ADMISSION',
}

export class CreateHomeMedicationDto {
  @IsString()
  @IsNotEmpty()
  medicationName: string;

  @IsOptional()
  @IsString()
  dose?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  prescribedBy?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(MedicationSourceDto)
  source?: MedicationSourceDto;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateHomeMedicationDto {
  @IsOptional()
  @IsString()
  medicationName?: string;

  @IsOptional()
  @IsString()
  dose?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
