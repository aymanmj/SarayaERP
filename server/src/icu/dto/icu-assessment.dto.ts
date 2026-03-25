import { IsNumber, IsOptional, IsString, IsDecimal, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
