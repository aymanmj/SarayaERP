import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RecordVitalsDto {
  @IsNumber()
  encounterId: number;

  @IsString()
  shiftName: string; // MORNING, EVENING, NIGHT

  @IsNumber()
  @IsOptional()
  heartRate?: number;

  @IsNumber()
  @IsOptional()
  respRate?: number;

  @IsNumber()
  @IsOptional()
  bpSystolic?: number;

  @IsNumber()
  @IsOptional()
  bpDiastolic?: number;

  @IsNumber()
  @IsOptional()
  meanArterialBp?: number;

  @IsNumber()
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  o2Sat?: number;

  @IsString()
  @IsOptional()
  intakeType?: string;

  @IsNumber()
  @IsOptional()
  intakeAmount?: number;

  @IsString()
  @IsOptional()
  outputType?: string;

  @IsNumber()
  @IsOptional()
  outputAmount?: number;

  @IsNumber()
  @Min(3)
  @Max(15)
  @IsOptional()
  gcsScore?: number;

  @IsNumber()
  @IsOptional()
  apgarScore?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  // Ventilator
  @IsString()
  @IsOptional()
  ventMode?: string;

  @IsNumber()
  @Min(21)
  @Max(100)
  @IsOptional()
  ventFio2?: number;

  @IsNumber()
  @Min(0)
  @Max(30)
  @IsOptional()
  ventPeep?: number;
}
