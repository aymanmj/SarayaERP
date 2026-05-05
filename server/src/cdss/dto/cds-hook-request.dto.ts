// src/cdss/dto/cds-hook-request.dto.ts
// [SECURITY FIX F-015] Typed DTO for CDS Hooks invocation requests

import { IsObject, IsOptional, IsString, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

class DraftOrderDto {
  @IsOptional()
  @IsString()
  genericName?: string;

  @IsOptional()
  @IsString()
  code?: string;
}

class CdsHookContextDto {
  @IsOptional()
  patientId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftOrderDto)
  draftOrders?: DraftOrderDto[];
}

export class CdsHookRequestDto {
  @IsOptional()
  @IsString()
  hookInstance?: string;

  @IsOptional()
  @IsString()
  hook?: string;

  @IsOptional()
  @IsObject()
  fhirServer?: Record<string, any>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CdsHookContextDto)
  context?: CdsHookContextDto;

  @IsOptional()
  @IsObject()
  prefetch?: Record<string, any>;
}
