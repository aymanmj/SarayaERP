import {
  IsInt, IsOptional, IsString, IsEnum, IsDateString, IsNumber, IsBoolean,
} from 'class-validator';

// ==========================================
// Enums
// ==========================================

export enum InfertilityType {
  MALE_FACTOR = 'MALE_FACTOR',
  FEMALE_FACTOR = 'FEMALE_FACTOR',
  COMBINED = 'COMBINED',
  UNEXPLAINED = 'UNEXPLAINED',
}

export enum CycleType {
  ICSI = 'ICSI',
  IVF = 'IVF',
  IUI = 'IUI',
  FET = 'FET',
  EGG_FREEZING = 'EGG_FREEZING',
}

export enum SpermSource {
  EJACULATE = 'EJACULATE',
  TESE = 'TESE',
  PESA = 'PESA',
  FROZEN_SPERM = 'FROZEN_SPERM',
}

export enum FertilizationMethod {
  CONVENTIONAL_IVF = 'CONVENTIONAL_IVF',
  ICSI = 'ICSI',
  IMSI = 'IMSI',
  PICSI = 'PICSI',
}

// ==========================================
// Fertility Case (Couple-Centric)
// ==========================================

export class CreateFertilityCaseDto {
  @IsInt()
  femalePatientId: number;

  @IsInt()
  @IsOptional()
  malePatientId?: number;

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

  @IsString()
  @IsOptional()
  notes?: string;
}

// ==========================================
// IVF Cycle
// ==========================================

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
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateIVFCycleDto {
  // Egg Retrieval
  @IsDateString()
  @IsOptional()
  eggRetrievalDate?: string;

  @IsInt()
  @IsOptional()
  eggsRetrieved?: number;

  @IsInt()
  @IsOptional()
  eggsMatureMII?: number;

  @IsInt()
  @IsOptional()
  eggsMI?: number;

  @IsInt()
  @IsOptional()
  eggsGV?: number;

  // Sperm & Fertilization
  @IsEnum(SpermSource)
  @IsOptional()
  spermSource?: SpermSource;

  @IsEnum(FertilizationMethod)
  @IsOptional()
  fertilizationMethod?: FertilizationMethod;

  @IsInt()
  @IsOptional()
  eggsInjected?: number;

  @IsInt()
  @IsOptional()
  eggsFertilized2PN?: number;

  // Embryo Development
  @IsInt()
  @IsOptional()
  embryosDay3?: number;

  @IsInt()
  @IsOptional()
  embryosDay5?: number;

  // Transfer
  @IsDateString()
  @IsOptional()
  transferDate?: string;

  @IsInt()
  @IsOptional()
  embryosTransferred?: number;

  @IsNumber()
  @IsOptional()
  endometrialThickness?: number;

  @IsInt()
  @IsOptional()
  embryosFrozen?: number;

  // Pregnancy Test
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

// ==========================================
// Embryo Record
// ==========================================

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

// ==========================================
// Fertility Medication
// ==========================================

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

// ==========================================
// Semen Analysis (WHO 6th Edition)
// ==========================================

export class CreateSemenAnalysisDto {
  @IsInt()
  patientId: number;

  @IsInt()
  @IsOptional()
  fertilityCaseId?: number;

  @IsDateString()
  @IsOptional()
  sampleDate?: string;

  @IsInt()
  @IsOptional()
  abstinenceDays?: number;

  @IsNumber()
  @IsOptional()
  volumeMl?: number;

  @IsNumber()
  @IsOptional()
  ph?: number;

  @IsString()
  @IsOptional()
  viscosity?: string;

  @IsString()
  @IsOptional()
  liquefaction?: string;

  @IsNumber()
  @IsOptional()
  countMilPerMl?: number;

  @IsNumber()
  @IsOptional()
  totalCountMil?: number;

  @IsNumber()
  @IsOptional()
  progressivePR?: number;

  @IsNumber()
  @IsOptional()
  nonProgressiveNP?: number;

  @IsNumber()
  @IsOptional()
  immotileIM?: number;

  @IsNumber()
  @IsOptional()
  normalForms?: number;

  @IsNumber()
  @IsOptional()
  vitality?: number;

  @IsNumber()
  @IsOptional()
  wbcCount?: number;

  @IsString()
  @IsOptional()
  agglutination?: string;

  @IsString()
  @IsOptional()
  conclusion?: string;

  @IsString()
  @IsOptional()
  doctorNotes?: string;
}

// ==========================================
// Andrology Visit
// ==========================================

export class CreateAndrologyVisitDto {
  @IsInt()
  patientId: number;

  @IsInt()
  @IsOptional()
  encounterId?: number;

  @IsInt()
  @IsOptional()
  fertilityCaseId?: number;

  @IsBoolean()
  @IsOptional()
  erectileDisfunc?: boolean;

  @IsString()
  @IsOptional()
  smokingHabit?: string;

  @IsString()
  @IsOptional()
  varicoceleGrade?: string;

  @IsString()
  @IsOptional()
  testicularVol?: string;

  @IsNumber()
  @IsOptional()
  fshLevel?: number;

  @IsNumber()
  @IsOptional()
  lhLevel?: number;

  @IsNumber()
  @IsOptional()
  testosterone?: number;

  @IsNumber()
  @IsOptional()
  prolactin?: number;

  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsString()
  @IsOptional()
  treatmentPlan?: string;
}

// ==========================================
// Cryopreservation
// ==========================================

export class CreateCryoTankDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  location?: string;
}

export class CreateCryoCanisterDto {
  @IsInt()
  tankId: number;

  @IsString()
  code: string;
}

export class CreateCryoItemDto {
  @IsInt()
  canisterId: number;

  @IsInt()
  patientId: number;

  @IsString()
  itemType: string;

  @IsDateString()
  @IsOptional()
  freezeDate?: string;

  @IsString()
  @IsOptional()
  caneCode?: string;

  @IsString()
  @IsOptional()
  gobletColor?: string;

  @IsString()
  @IsOptional()
  visotubeColor?: string;

  @IsInt()
  @IsOptional()
  strawCount?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  ivfCycleId?: number;
}

export class ThawCryoItemDto {
  @IsDateString()
  @IsOptional()
  thawDate?: string;
}
