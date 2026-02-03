import {
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
  IsBoolean,
  IsArray,
  IsObject,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum DischargeDisposition {
  HOME = 'HOME',
  TRANSFER_TO_ANOTHER_FACILITY = 'TRANSFER_TO_ANOTHER_FACILITY',
  REHABILITATION = 'REHABILITATION',
  LONG_TERM_CARE = 'LONG_TERM_CARE',
  HOME_HEALTH_CARE = 'HOME_HEALTH_CARE',
  HOSPICE = 'HOSPICE',
  LEFT_AGAINST_MEDICAL_ADVICE = 'LEFT_AGAINST_MEDICAL_ADVICE',
  EXPIRED = 'EXPIRED',
}

export class CreateDischargePlanningDto {
  @IsDateString()
  plannedDischargeDate: string;

  @IsOptional()
  @IsBoolean()
  medicalStability?: boolean = false;

  @IsOptional()
  @IsBoolean()
  vitalsStable?: boolean = false;

  @IsOptional()
  @IsBoolean()
  painControlled?: boolean = false;

  @IsOptional()
  @IsBoolean()
  medicationsReady?: boolean = false;

  @IsOptional()
  @IsBoolean()
  educationCompleted?: boolean = false;

  @IsEnum(DischargeDisposition)
  dischargeDisposition: DischargeDisposition;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destinationFacility?: string;

  @IsOptional()
  @IsBoolean()
  homeHealthRequired?: boolean = false;

  @IsOptional()
  @IsArray()
  equipmentNeeded?: any[];

  @IsOptional()
  @IsArray()
  homeModifications?: any[];

  @IsOptional()
  @IsDateString()
  followUpAppointment?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  followUpDoctorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followUpInstructions?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  caseManagerId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  socialWorkerId?: number;

  @IsOptional()
  @IsBoolean()
  familyNotified?: boolean = false;

  @IsOptional()
  @IsArray()
  familyInstructions?: any[];

  @IsOptional()
  @IsBoolean()
  insuranceApproval?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  estimatedCost?: number;

  @IsOptional()
  @IsArray()
  paymentArrangements?: any[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  status?: string = 'PLANNING';

  @IsOptional()
  @IsArray()
  barriers?: any[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
