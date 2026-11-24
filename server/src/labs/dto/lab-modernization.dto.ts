import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLabOrdersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  testIds!: number[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsInt()
  doctorId?: number;
}

export class LabResultParameterInputDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  parameterId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  parameterName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  range?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  flag?: string;
}

export class CompleteLabOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  resultValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  resultUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceRange?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabResultParameterInputDto)
  parameters?: LabResultParameterInputDto[];

  @IsOptional()
  @IsBoolean()
  verifyImmediately?: boolean;
}

export class AmendLabOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  resultValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  resultUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceRange?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabResultParameterInputDto)
  parameters?: LabResultParameterInputDto[];
}

export class CancelLabOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class RecordCriticalReadBackDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  notifiedClinicianId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  notifiedClinicianName!: string;

  @IsIn(['PHONE', 'IN_PERSON', 'SYSTEM_ALERT'])
  notificationMethod!: 'PHONE' | 'IN_PERSON' | 'SYSTEM_ALERT';

  @IsBoolean()
  readBackConfirmed!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  readBackValue!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class LabTestParameterDefDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  refRange?: string;
}

export class CreateLabTestCatalogDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  arabicName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  serviceItemId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabTestParameterDefDto)
  parameters?: LabTestParameterDefDto[];
}

export class CreateLabReferenceRangeDto {
  @IsInt()
  @Min(1)
  labTestId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  parameterId?: number;

  @IsOptional()
  @IsIn(['ANY', 'MALE', 'FEMALE'])
  gender?: 'ANY' | 'MALE' | 'FEMALE';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50000)
  ageMinDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50000)
  ageMaxDays?: number;

  @IsOptional()
  @IsString()
  @Matches(/^-?\d+(\.\d{1,4})?$/)
  normalLow?: string;

  @IsOptional()
  @IsString()
  @Matches(/^-?\d+(\.\d{1,4})?$/)
  normalHigh?: string;

  @IsOptional()
  @IsString()
  @Matches(/^-?\d+(\.\d{1,4})?$/)
  criticalLow?: string;

  @IsOptional()
  @IsString()
  @Matches(/^-?\d+(\.\d{1,4})?$/)
  criticalHigh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  textRange?: string;
}
