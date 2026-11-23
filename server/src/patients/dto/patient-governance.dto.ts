import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestPatientMergeDto {
  @IsInt()
  @IsPositive()
  sourcePatientId!: number;

  @IsInt()
  @IsPositive()
  targetPatientId!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class ReviewPatientMergeDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class UnmergePatientDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class RecordPatientDeathDto {
  @IsDateString()
  dateOfDeath!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  causeOfDeath!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deathCertificateNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deathLocation?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  encounterId?: number;
}

export class RequestDeathReversalDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class ReviewDeathReversalDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
