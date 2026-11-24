import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BLOOD_COMPONENTS,
  BLOOD_GROUPS,
  type BloodComponentType,
  type BloodGroup,
} from '../blood-compatibility.util';

export const SCREENING_RESULTS = ['CLEARED', 'REACTIVE_QUARANTINED'] as const;
export type ScreeningResult = (typeof SCREENING_RESULTS)[number];

export const ANTIBODY_SCREENS = ['NEGATIVE', 'POSITIVE'] as const;
export type AntibodyScreen = (typeof ANTIBODY_SCREENS)[number];

export const TRANSFUSION_EVENT_TYPES = [
  'PRE_TRANSFUSION_VITALS',
  'FIFTEEN_MIN_VITALS',
  'HOURLY_VITALS',
  'POST_TRANSFUSION_VITALS',
] as const;

export const REACTION_SEVERITIES = [
  'MINOR',
  'MODERATE',
  'MAJOR',
  'SENTINEL',
] as const;
export type ReactionSeverity = (typeof REACTION_SEVERITIES)[number];

export class CreateBloodUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  unitNumber!: string;

  @IsIn(BLOOD_COMPONENTS)
  componentType!: BloodComponentType;

  @IsIn(BLOOD_GROUPS)
  bloodGroup!: BloodGroup;

  @IsInt()
  @Min(10)
  @Max(2000)
  volumeMl!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  donorReference?: string;

  @IsDateString()
  collectedAt!: string;

  @IsDateString()
  expiresAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  storageLocation?: string;
}

export class ScreenBloodUnitDto {
  @IsIn(SCREENING_RESULTS)
  screeningStatus!: ScreeningResult;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  screeningNotes?: string;
}

export class DiscardBloodUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  discardReason!: string;
}

export class CreateCrossmatchDto {
  @IsInt()
  @Min(1)
  patientId!: number;

  @IsInt()
  @Min(1)
  encounterId!: number;

  @IsInt()
  @Min(1)
  bloodUnitId!: number;

  @IsIn(BLOOD_GROUPS)
  patientBloodGroup!: BloodGroup;

  @IsOptional()
  @IsIn(ANTIBODY_SCREENS)
  antibodyScreen?: AntibodyScreen;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  validHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class BedsideVerifyStepDto {
  @IsBoolean()
  patientBandScanned!: boolean;

  @IsBoolean()
  bagBarcodeScanned!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  scannedUnitNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  scannedPatientMrn!: string;
}

export class CompleteTransfusionDto {
  @IsInt()
  @Min(0)
  @Max(2000)
  volumeTransfusedMl!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RecordTransfusionVitalsDto {
  @IsIn(TRANSFUSION_EVENT_TYPES)
  eventType!: (typeof TRANSFUSION_EVENT_TYPES)[number];

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(45)
  temperatureC?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(260)
  heartRate?: number;

  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(300)
  systolicBp?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(200)
  diastolicBp?: number;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(80)
  respiratoryRate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  spo2?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReportTransfusionReactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  reactionType!: string;

  @IsIn(REACTION_SEVERITIES)
  severity!: ReactionSeverity;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reactionSymptoms!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  actionTaken!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  volumeTransfusedMl?: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(45)
  temperatureC?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(260)
  heartRate?: number;

  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(300)
  systolicBp?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(200)
  diastolicBp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  spo2?: number;
}
