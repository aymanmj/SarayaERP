import { IsEnum, IsInt, IsOptional, IsBoolean, IsNumber, ValidateNested, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum DeliveryMethod {
  NVD = 'NVD',
  ASSISTED_NVD = 'ASSISTED_NVD',
  CS_ELECTIVE = 'CS_ELECTIVE',
  CS_EMERGENCY = 'CS_EMERGENCY',
  VBAC = 'VBAC',
}

export enum InductionMethod {
  NONE = 'NONE',
  OXYTOCIN = 'OXYTOCIN',
  PROSTAGLANDIN = 'PROSTAGLANDIN',
  MECHANICAL = 'MECHANICAL',
}

export enum PlacentaDelivery {
  SPONTANEOUS = 'SPONTANEOUS',
  MANUAL = 'MANUAL',
}

export enum PerinealTear {
  NONE = 'NONE',
  DEGREE_1 = 'DEGREE_1',
  DEGREE_2 = 'DEGREE_2',
  DEGREE_3 = 'DEGREE_3',
  DEGREE_4 = 'DEGREE_4',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export enum BabyStatus {
  ALIVE = 'ALIVE',
  STILLBORN = 'STILLBORN',
  NICU = 'NICU',
}

export class CreateBabyProfileDto {
  @IsEnum(Gender)
  gender: Gender;

  @IsNumber()
  @IsOptional()
  weight?: number; // kg

  @IsNumber()
  @IsOptional()
  length?: number; // cm

  @IsNumber()
  @IsOptional()
  headCircumference?: number; // cm

  @IsDateString()
  birthTime: string; // ISO Date

  @IsInt()
  @IsOptional()
  apgarScore1?: number;

  @IsInt()
  @IsOptional()
  apgarScore5?: number;

  @IsInt()
  @IsOptional()
  apgarScore10?: number;

  @IsEnum(BabyStatus)
  @IsOptional()
  status?: BabyStatus;

  @IsBoolean()
  @IsOptional()
  vitaminKGiven?: boolean;

  @IsBoolean()
  @IsOptional()
  bcgVaccineGiven?: boolean;

  @IsOptional()
  notes?: string;
}

export class CreateDeliveryDto {
  @IsInt()
  encounterId: number;

  @IsEnum(DeliveryMethod)
  deliveryMethod: DeliveryMethod;

  @IsEnum(InductionMethod)
  @IsOptional()
  inductionMethod?: InductionMethod;

  @IsEnum(PlacentaDelivery)
  @IsOptional()
  placentaDelivery?: PlacentaDelivery;

  @IsBoolean()
  @IsOptional()
  episiotomy?: boolean;

  @IsEnum(PerinealTear)
  @IsOptional()
  perinealTear?: PerinealTear;

  @IsInt()
  @IsOptional()
  bloodLoss?: number;

  @IsInt()
  @Min(1)
  babyCount: number;

  @IsOptional()
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => CreateBabyProfileDto)
  babies: CreateBabyProfileDto[];
}
