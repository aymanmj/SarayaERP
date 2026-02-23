import {
  IsInt, IsOptional, IsString, IsEnum, IsDateString, IsNumber,
} from 'class-validator';

export enum InfertilityType {
  MALE_FACTOR = 'MALE_FACTOR',
  FEMALE_FACTOR = 'FEMALE_FACTOR',
  BOTH = 'BOTH',
  UNEXPLAINED = 'UNEXPLAINED',
}

export enum CycleType {
  IVF = 'IVF',
  ICSI = 'ICSI',
  IUI = 'IUI',
  FET = 'FET',
  EGG_FREEZING = 'EGG_FREEZING',
  NATURAL = 'NATURAL',
}

export class CreateFertilityCaseDto {
  @IsInt()
  patientId: number;

  @IsString()
  @IsOptional()
  partnerName?: string;

  @IsInt()
  @IsOptional()
  partnerAge?: number;

  @IsEnum(InfertilityType)
  @IsOptional()
  infertilityType?: InfertilityType;

  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsInt()
  @IsOptional()
  durationYears?: number;

  @IsString()
  @IsOptional()
  previousTreatments?: string;

  @IsNumber()
  @IsOptional()
  amhLevel?: number;

  @IsNumber()
  @IsOptional()
  fshLevel?: number;

  @IsNumber()
  @IsOptional()
  lhLevel?: number;

  @IsNumber()
  @IsOptional()
  spermCount?: number;

  @IsNumber()
  @IsOptional()
  spermMotility?: number;

  @IsNumber()
  @IsOptional()
  spermMorphology?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateIVFCycleDto {
  @IsInt()
  fertilityCaseId: number;

  @IsEnum(CycleType)
  @IsOptional()
  cycleType?: CycleType;

  @IsString()
  @IsOptional()
  protocol?: string;

  @IsDateString()
  startDate: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateIVFCycleDto {
  @IsInt()
  @IsOptional()
  stimulationDays?: number;

  @IsDateString()
  @IsOptional()
  eggRetrievalDate?: string;

  @IsInt()
  @IsOptional()
  eggsRetrieved?: number;

  @IsInt()
  @IsOptional()
  eggsMature?: number;

  @IsInt()
  @IsOptional()
  eggsFertilized?: number;

  @IsInt()
  @IsOptional()
  embryosDay3?: number;

  @IsInt()
  @IsOptional()
  embryosDay5?: number;

  @IsDateString()
  @IsOptional()
  transferDate?: string;

  @IsInt()
  @IsOptional()
  embryosTransferred?: number;

  @IsInt()
  @IsOptional()
  embryosFrozen?: number;

  @IsNumber()
  @IsOptional()
  endometrialThickness?: number;

  @IsDateString()
  @IsOptional()
  betaHCGDate?: string;

  @IsNumber()
  @IsOptional()
  betaHCGResult?: number;

  @IsString()
  @IsOptional()
  pregnancyResult?: string;

  @IsString()
  @IsOptional()
  cancelReason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateEmbryoDto {
  @IsInt()
  ivfCycleId: number;

  @IsInt()
  embryoNumber: number;

  @IsInt()
  day: number;

  @IsString()
  @IsOptional()
  grade?: string;

  @IsInt()
  @IsOptional()
  cellCount?: number;

  @IsString()
  @IsOptional()
  fragmentation?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateFertilityMedicationDto {
  @IsInt()
  ivfCycleId: number;

  @IsString()
  medicationName: string;

  @IsString()
  dose: string;

  @IsString()
  @IsOptional()
  route?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsInt()
  @IsOptional()
  durationDays?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
