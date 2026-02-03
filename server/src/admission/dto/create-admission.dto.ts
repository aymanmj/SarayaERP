import {
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  IsBoolean,
  IsArray,
  IsObject,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// Enums (temporary until Prisma client is regenerated)
export enum AdmissionType {
  EMERGENCY = 'EMERGENCY',
  URGENT = 'URGENT',
  ELECTIVE = 'ELECTIVE',
  TRANSFER = 'TRANSFER',
  OBSERVATION = 'OBSERVATION',
}

export enum AdmissionStatus {
  SCHEDULED = 'SCHEDULED',
  ADMITTED = 'ADMITTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DISCHARGE_PENDING = 'DISCHARGE_PENDING',
  DISCHARGED = 'DISCHARGED',
  CANCELLED = 'CANCELLED',
}

export enum AdmissionPriority {
  CRITICAL = 'CRITICAL',
  URGENT = 'URGENT',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum IsolationType {
  NONE = 'NONE',
  STANDARD = 'STANDARD',
  DROPLET = 'DROPLET',
  AIRBORNE = 'AIRBORNE',
  CONTACT = 'CONTACT',
  PROTECTIVE = 'PROTECTIVE',
}

export class CreateAdmissionDto {
  @IsInt()
  @Min(1)
  patientId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  encounterId?: number;

  @IsEnum(AdmissionType)
  admissionType: AdmissionType;

  @IsEnum(AdmissionPriority)
  priority: AdmissionPriority;

  @IsOptional()
  @IsDateString()
  scheduledAdmissionDate?: string;

  @IsOptional()
  @IsDateString()
  expectedDischargeDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  bedId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  roomId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  wardId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number;

  @IsInt()
  @Min(1)
  admittingDoctorId: number;

  @IsInt()
  @Min(1)
  primaryPhysicianId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  referringDoctorId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  attendingNurseId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  insuranceProviderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  insurancePolicyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  preAuthNumber?: string;

  @IsString()
  @MaxLength(1000)
  admissionReason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  primaryDiagnosis?: string;

  @IsOptional()
  @IsArray()
  secondaryDiagnoses?: any[];

  @IsOptional()
  @IsArray()
  procedures?: any[];

  @IsOptional()
  @IsArray()
  medications?: any[];

  @IsOptional()
  @IsArray()
  allergies?: any[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  specialInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fallRisk?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pressureUlcerRisk?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nutritionRisk?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  infectionRisk?: string;

  @IsOptional()
  @IsBoolean()
  isolationRequired?: boolean = false;

  @IsOptional()
  @IsEnum(IsolationType)
  isolationType?: IsolationType = IsolationType.NONE;

  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean = false;

  @IsOptional()
  @IsObject()
  emergencyContact?: any;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  emergencyNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  readmissionReason?: string;

  @IsOptional()
  @Type(() => Number)
  estimatedCost?: number;
}
