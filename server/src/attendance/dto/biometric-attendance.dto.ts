// server/src/attendance/dto/biometric-attendance.dto.ts
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const CONNECTION_MODES = ['ADMS', 'DIRECT_TCP'] as const;
export const MOVEMENT_TYPES = ['TEMP_LEAVE', 'RETURN'] as const;
export const MOVEMENT_DECISIONS = ['APPROVED', 'REJECTED'] as const;
export const ABSENCE_CLASSIFICATIONS = [
  'AUTHORIZED',
  'UNAUTHORIZED',
  'SICK',
  'VACATION',
] as const;

export class CreateBiometricDeviceDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  @IsString()
  @MaxLength(64)
  serialNumber!: string;

  @IsString()
  @MaxLength(64)
  ipAddress!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsIn(CONNECTION_MODES)
  connectionMode?: (typeof CONNECTION_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceSecret?: string;
}

export class UpdateBiometricDeviceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsIn(CONNECTION_MODES)
  connectionMode?: (typeof CONNECTION_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceSecret?: string;
}

export class AssignBiometricIdDto {
  @IsString()
  @MaxLength(64)
  biometricId!: string;
}

export class IngestDevicePunchesDto {
  @IsString()
  rawAttlog!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-12)
  @Max(14)
  tzOffsetHours?: number;
}

export class RecordAttendanceMovementDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  attendanceRecordId!: number;

  @IsIn(MOVEMENT_TYPES)
  movementType!: (typeof MOVEMENT_TYPES)[number];

  @IsDateString()
  movementTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DecideAttendanceMovementDto {
  @IsIn(MOVEMENT_DECISIONS)
  decision!: (typeof MOVEMENT_DECISIONS)[number];
}

export class MarkAbsenceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @IsDateString()
  date!: string;

  @IsIn(ABSENCE_CLASSIFICATIONS)
  classification!: (typeof ABSENCE_CLASSIFICATIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ClassifyAbsenceDto {
  @IsIn(ABSENCE_CLASSIFICATIONS)
  classification!: (typeof ABSENCE_CLASSIFICATIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateHolidayDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsBoolean()
  isAnnual?: boolean;
}
