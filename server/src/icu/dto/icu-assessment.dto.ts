import {
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  Max,
  Min,
} from 'class-validator';

export class DailyAssessmentDto {
  @IsNumber()
  encounterId: number;

  @IsString()
  assessmentDate: string; // ISO date string YYYY-MM-DD

  // Clinical Scores
  @IsNumber()
  @IsOptional()
  gcsEye?: number;

  @IsNumber()
  @IsOptional()
  gcsVerbal?: number;

  @IsNumber()
  @IsOptional()
  gcsMotor?: number;

  @IsNumber()
  @Min(3)
  @Max(15)
  @IsOptional()
  gcsTotal?: number;

  @IsNumber()
  @IsOptional()
  apacheIIScore?: number;

  @IsNumber()
  @IsOptional()
  sofaScore?: number;

  @IsNumber()
  @IsOptional()
  rassScore?: number;

  @IsNumber()
  @IsOptional()
  painScore?: number;

  // Sedation & Neuro
  @IsString()
  @IsOptional()
  pupilLeft?: string;

  @IsString()
  @IsOptional()
  pupilRight?: string;

  @IsString()
  @IsOptional()
  sedationTarget?: string;

  // Respiratory
  @IsString()
  @IsOptional()
  oxygenDevice?: string;

  @IsNumber()
  @Min(21)
  @Max(100)
  @IsOptional()
  fio2?: number;

  // Lines & Drains
  @IsString()
  @IsOptional()
  centralLine?: string;

  @IsString()
  @IsOptional()
  arterialLine?: string;

  @IsBoolean()
  @IsOptional()
  foleyPresent?: boolean;

  @IsArray()
  @IsOptional()
  drains?: any[];

  // Skin & Wounds
  @IsString()
  @IsOptional()
  skinIntegrity?: string;

  @IsString()
  @IsOptional()
  pressureUlcer?: string;

  @IsString()
  @IsOptional()
  woundNotes?: string;

  // Plan
  @IsString()
  @IsOptional()
  dailyGoals?: string;

  @IsString()
  @IsOptional()
  nutritionPlan?: string;

  @IsString()
  @IsOptional()
  mobilityPlan?: string;
}
