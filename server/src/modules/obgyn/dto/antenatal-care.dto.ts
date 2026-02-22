import { IsInt, IsOptional, IsDateString, IsString, IsEnum, IsNumber, IsBoolean, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum PregnancyRisk {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export class CreateAntenatalCareDto {
  @IsInt()
  patientId: number;

  @IsInt()
  @IsOptional()
  doctorId?: number;

  @IsDateString()
  lmpDate: string; // Last Menstrual Period

  @IsInt()
  @IsOptional()
  gravida?: number;

  @IsInt()
  @IsOptional()
  para?: number;

  @IsString()
  @IsOptional()
  bloodGroup?: string;

  @IsString()
  @IsOptional()
  rhFactor?: string;

  @IsEnum(PregnancyRisk)
  @IsOptional()
  riskLevel?: PregnancyRisk;

  @IsString()
  @IsOptional()
  riskFactors?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateAntenatalVisitDto {
  @IsInt()
  antenatalCareId: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(45)
  gestationalWeek?: number;

  @IsNumber()
  @IsOptional()
  weight?: number;

  @IsInt()
  @IsOptional()
  bloodPressureSys?: number;

  @IsInt()
  @IsOptional()
  bloodPressureDia?: number;

  @IsNumber()
  @IsOptional()
  fundalHeight?: number;

  @IsInt()
  @IsOptional()
  fetalHeartRate?: number;

  @IsBoolean()
  @IsOptional()
  fetalMovement?: boolean;

  @IsString()
  @IsOptional()
  presentation?: string;

  @IsBoolean()
  @IsOptional()
  edema?: boolean;

  @IsString()
  @IsOptional()
  urineProtein?: string;

  @IsString()
  @IsOptional()
  urineGlucose?: string;

  @IsNumber()
  @IsOptional()
  hemoglobin?: number;

  @IsString()
  @IsOptional()
  complaints?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  nextVisitDate?: string;
}
