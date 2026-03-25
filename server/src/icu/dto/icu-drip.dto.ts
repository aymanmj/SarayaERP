import { IsNumber, IsOptional, IsString, IsDecimal, IsBoolean, IsArray } from 'class-validator';

export class CreateMedicationDripDto {
  @IsNumber()
  encounterId: number;

  @IsString()
  medicationName: string;

  @IsString()
  @IsOptional()
  concentration?: string;

  @IsNumber()
  @IsOptional()
  currentRate?: number;

  @IsString()
  @IsOptional()
  doseUnit?: string;
}

export class TitrateDripDto {
  @IsNumber()
  newRate: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
