import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegistryCriteriaDto {
  @IsString()
  @MaxLength(64)
  type: string;

  @IsString()
  @MaxLength(32)
  operator: string;

  @IsString()
  @MaxLength(255)
  value: string;
}

export class CareGapRuleInputDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MaxLength(64)
  targetType: string;

  @IsString()
  @MaxLength(120)
  targetValue: string;

  @IsInt()
  @Min(1)
  frequencyDays: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertRegistryDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegistryCriteriaDto)
  criteria: RegistryCriteriaDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CareGapRuleInputDto)
  careGapRules: CareGapRuleInputDto[] = [];
}
