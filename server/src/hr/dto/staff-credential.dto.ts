import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const STAFF_CATEGORIES = [
  'MEDICAL',
  'ALLIED_HEALTH',
  'ADMINISTRATIVE_SUPPORT',
] as const;

export const CREDENTIAL_TYPES = [
  'PRACTICE_LICENSE',
  'HEALTH_CERTIFICATE',
  'MEDICAL_COUNCIL_CERT',
  'SPECIALTY_BOARD_CERT',
  'BLS_ACLS_CERT',
  'RADIATION_SAFETY_PERMIT',
  'OTHER',
] as const;

export class CreateStaffCredentialDto {
  @IsInt()
  @IsPositive()
  userId!: number;

  @IsIn(STAFF_CATEGORIES)
  staffCategory!: (typeof STAFF_CATEGORIES)[number];

  @IsIn(CREDENTIAL_TYPES)
  credentialType!: (typeof CREDENTIAL_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  licenseNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  issuingAuthority!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  specialty?: string;

  @IsDateString()
  issueDate!: string;

  @IsDateString()
  expiryDate!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  alertDaysBefore?: number;

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class SuspendStaffCredentialDto {
  @IsIn(['SUSPEND', 'REVOKE'])
  action!: 'SUSPEND' | 'REVOKE';

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
