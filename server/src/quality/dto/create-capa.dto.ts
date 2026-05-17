// src/quality/dto/create-capa.dto.ts

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
import { CapaActionType, CapaStatus } from '@prisma/client';

export class CreateCapaDto {
  @IsInt()
  incidentId: number;

  @IsEnum(CapaActionType)
  actionType: CapaActionType;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsInt()
  assignedToId: number;

  @IsDateString()
  dueDate: string;
}

export class UpdateCapaDto {
  @IsOptional()
  @IsEnum(CapaStatus)
  status?: CapaStatus;

  @IsOptional()
  @IsString()
  completedNotes?: string;
}

export class VerifyCapaDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  verificationNotes: string;

  @IsBoolean()
  isEffective: boolean;
}
