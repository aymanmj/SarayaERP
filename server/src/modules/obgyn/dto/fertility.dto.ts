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

  @IsString()
  @IsOptional()
  collectionMethod?: string;

  @IsDateString()
  @IsOptional()
  collectionTime?: string;

  @IsDateString()
  @IsOptional()
  analysisTime?: string;

  @IsNumber()
  @IsOptional()
  volumeMl?: number;

  @IsNumber()
  @IsOptional()
  ph?: number;

  @IsString()
  @IsOptional()
  appearance?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  viscosity?: string;

  @IsString()
  @IsOptional()
  liquefaction?: string;

  @IsInt()
  @IsOptional()
  liquefactionMinutes?: number;

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
  headDefects?: number;

  @IsNumber()
  @IsOptional()
  midpieceDefects?: number;

  @IsNumber()
  @IsOptional()
  tailDefects?: number;

  @IsNumber()
  @IsOptional()
  vitality?: number;

  @IsNumber()
  @IsOptional()
  wbcCount?: number;

  @IsNumber()
  @IsOptional()
  roundCells?: number;

  @IsString()
  @IsOptional()
  agglutination?: string;

  @IsString()
  @IsOptional()
  marTestIgG?: string;

  @IsString()
  @IsOptional()
  marTestIgA?: string;

  @IsNumber()
  @IsOptional()
  dnaFragmentation?: number;

  @IsString()
  @IsOptional()
  dfiMethod?: string;

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

  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  @IsInt()
  @IsOptional()
  infertilityMonths?: number;

  @IsInt()
  @IsOptional()
  previousPregnancies?: number;

  @IsString()
  @IsOptional()
  coitalFrequency?: string;

  @IsBoolean()
  @IsOptional()
  erectileDisfunc?: boolean;

  @IsBoolean()
  @IsOptional()
  ejaculatoryDisfunc?: boolean;

  @IsBoolean()
  @IsOptional()
  retrogradeEjac?: boolean;

  @IsString()
  @IsOptional()
  libidoLevel?: string;

  @IsBoolean()
  @IsOptional()
  prematureEjac?: boolean;

  @IsString()
  @IsOptional()
  smokingHabit?: string;

  @IsString()
  @IsOptional()
  alcoholUse?: string;

  @IsString()
  @IsOptional()
  occupationalExposure?: string;

  @IsNumber()
  @IsOptional()
  bmi?: number;

  @IsBoolean()
  @IsOptional()
  cryptorchidismHistory?: boolean;

  @IsBoolean()
  @IsOptional()
  orchitisHistory?: boolean;

  @IsBoolean()
  @IsOptional()
  inguinalSurgery?: boolean;

  @IsBoolean()
  @IsOptional()
  chemotherapy?: boolean;

  @IsBoolean()
  @IsOptional()
  radiationExposure?: boolean;

  @IsString()
  @IsOptional()
  currentMedications?: string;

  @IsString()
  @IsOptional()
  surgicalHistory?: string;

  @IsString()
  @IsOptional()
  medicalConditions?: string;

  @IsString()
  @IsOptional()
  varicoceleGrade?: string;

  @IsString()
  @IsOptional()
  varicoceleRight?: string;

  @IsString()
  @IsOptional()
  varicoceleLeft?: string;

  @IsNumber()
  @IsOptional()
  testicularVolR?: number;

  @IsNumber()
  @IsOptional()
  testicularVolL?: number;

  @IsString()
  @IsOptional()
  testisConsistency?: string;

  @IsString()
  @IsOptional()
  epididymalFindings?: string;

  @IsString()
  @IsOptional()
  vasPresence?: string;

  @IsString()
  @IsOptional()
  penileExam?: string;

  @IsBoolean()
  @IsOptional()
  gynecomastia?: boolean;

  @IsString()
  @IsOptional()
  bodyHairPattern?: string;

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

  @IsDateString()
  @IsOptional()
  followUpDate?: string;

  @IsString()
  @IsOptional()
  referralNotes?: string;
}

// ==========================================
// Hormone Test
// ==========================================

export class CreateHormoneTestDto {
  @IsInt()
  patientId: number;

  @IsDateString()
  @IsOptional()
  testDate?: string;

  @IsNumber()
  @IsOptional()
  fsh?: number;

  @IsNumber()
  @IsOptional()
  lh?: number;

  @IsNumber()
  @IsOptional()
  totalTestosterone?: number;

  @IsNumber()
  @IsOptional()
  freeTestosterone?: number;

  @IsNumber()
  @IsOptional()
  estradiol?: number;

  @IsNumber()
  @IsOptional()
  prolactin?: number;

  @IsNumber()
  @IsOptional()
  tsh?: number;

  @IsNumber()
  @IsOptional()
  inhibinB?: number;

  @IsNumber()
  @IsOptional()
  shbg?: number;

  @IsNumber()
  @IsOptional()
  amhMale?: number;

  @IsString()
  @IsOptional()
  notes?: string;
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

// ==========================================
// Andrology Surgery
// ==========================================

export class CreateAndrologySurgeryDto {
  @IsInt()
  patientId: number;

  @IsInt()
  @IsOptional()
  encounterId?: number;

  @IsDateString()
  @IsOptional()
  surgeryDate?: string;

  @IsString()
  procedure: string;

  @IsString()
  @IsOptional()
  technique?: string;

  @IsString()
  @IsOptional()
  surgeonName?: string;

  @IsString()
  @IsOptional()
  findings?: string;

  @IsString()
  @IsOptional()
  outcome?: string;

  @IsString()
  @IsOptional()
  complications?: string;

  @IsBoolean()
  @IsOptional()
  spermRetrieved?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

// ==========================================
// Andrology Medication
// ==========================================

export class CreateAndrologyMedicationDto {
  @IsInt()
  patientId: number;

  @IsString()
  medication: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  dose?: string;

  @IsString()
  @IsOptional()
  frequency?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  response?: string;

  @IsString()
  @IsOptional()
  sideEffects?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
