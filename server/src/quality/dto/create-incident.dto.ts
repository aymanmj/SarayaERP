// src/quality/dto/create-incident.dto.ts

import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  MinLength,
} from 'class-validator';
import {
  IncidentType,
  IncidentSeverity,
  RootCauseCategory,
  IncidentStatus,
} from '@prisma/client';

export class CreateIncidentDto {
  @IsDateString()
  incidentDate: string;

  @IsEnum(IncidentType)
  incidentType: IncidentType;

  @IsEnum(IncidentSeverity)
  severity: IncidentSeverity;

  @IsString()
  @IsNotEmpty()
  @MinLength(20, { message: 'وصف الحادثة يجب أن يكون 20 حرفاً على الأقل' })
  description: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsInt()
  patientId?: number;

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @IsOptional()
  @IsString()
  immediateAction?: string; // الإجراء الفوري المتخذ
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional()
  @IsString()
  investigationNotes?: string;

  @IsOptional()
  @IsString()
  rootCause?: string;

  @IsOptional()
  @IsEnum(RootCauseCategory)
  rootCauseCategory?: RootCauseCategory;

  @IsOptional()
  @IsString()
  contributingFactors?: string;

  @IsOptional()
  @IsInt()
  investigatedById?: number;
}
