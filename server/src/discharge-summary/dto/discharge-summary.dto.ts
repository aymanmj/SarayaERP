import { IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested, IsDateString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDischargeSummaryDto {
  @IsNumber()
  @IsNotEmpty()
  admissionId: number;

  @IsNumber()
  @IsNotEmpty()
  encounterId: number;

  @IsNumber()
  @IsNotEmpty()
  hospitalId: number;

  @IsString()
  @IsNotEmpty()
  admissionDiagnosis: string;

  @IsString()
  @IsNotEmpty()
  dischargeDiagnosis: string;

  @IsString()
  @IsNotEmpty()
  hospitalCourse: string;

  @IsOptional()
  proceduresPerformed?: any;

  @IsOptional()
  consultations?: any;

  @IsString()
  @IsOptional()
  significantFindings?: string;

  @IsOptional()
  dischargeMedications?: any;

  @IsString()
  @IsOptional()
  followUpInstructions?: string;

  @IsDateString()
  @IsOptional()
  followUpDate?: string;

  @IsString()
  @IsOptional()
  followUpDoctor?: string;

  @IsString()
  @IsOptional()
  activityRestrictions?: string;

  @IsString()
  @IsOptional()
  dietInstructions?: string;

  @IsString()
  @IsOptional()
  patientEducation?: string;

  @IsString()
  @IsOptional()
  warningSignsToWatch?: string;
}

export class UpdateDischargeSummaryDto extends CreateDischargeSummaryDto {}
