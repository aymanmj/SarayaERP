import { MedicationFrequency, MedicationRoute } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class ReplacementItemDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  drugItemId!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  dose!: string;

  @IsEnum(MedicationRoute)
  route!: MedicationRoute;

  @IsEnum(MedicationFrequency)
  frequency!: MedicationFrequency;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  durationDays!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class PrescriptionReplacementDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  overrideSafety?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  overrideReason?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReplacementItemDto)
  items!: ReplacementItemDto[];
}
