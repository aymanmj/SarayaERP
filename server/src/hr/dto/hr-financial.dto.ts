// server/src/hr/dto/hr-financial.dto.ts
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const DEDUCTION_KINDS = ['DEDUCTION', 'ALLOWANCE'] as const;
export const COMPENSATION_CATEGORIES = [
  'SOCIAL_SECURITY',
  'HEALTH_INSURANCE',
  'INCOME_TAX',
  'SYNDICATE',
  'PENALTY',
  'OTHER_DEDUCTION',
  'NATURE_OF_WORK',
  'ON_CALL',
  'SPECIALTY',
  'PRODUCTION_BONUS',
  'OTHER_ALLOWANCE',
] as const;

export const TERMINATION_TYPES = [
  'RESIGNATION',
  'TERMINATION',
  'END_OF_CONTRACT',
  'RETIREMENT',
  'DISCIPLINARY',
  'PROBATION_FAILURE',
] as const;

export const OVERTIME_DAY_TYPES = ['NORMAL', 'WEEKEND', 'HOLIDAY'] as const;
export const PAY_BASIS_VALUES = ['MONTHLY', 'HOURLY', 'FIXED_SHIFT'] as const;

export class UpdateEmployeeCompensationDto {
  @IsOptional()
  @IsIn(PAY_BASIS_VALUES)
  payBasis?: (typeof PAY_BASIS_VALUES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basicSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedShift6hRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedShift12hRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedShift24hRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(400)
  standardMonthlyHours?: number;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsBoolean()
  isTaxExempt?: boolean;

  @IsOptional()
  @IsBoolean()
  isSocialInsuranceExempt?: boolean;
}

export class CreateTaxBracketDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fromAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  toAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  rate!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateEmployeeAdvanceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  amount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  installments!: number;

  @IsOptional()
  @IsDateString()
  requestDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ApproveEmployeeAdvanceDto {
  @IsOptional()
  @IsBoolean()
  postAccounting?: boolean;

  @IsOptional()
  @IsIn(['CASH', 'BANK'])
  paymentMethod?: 'CASH' | 'BANK';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateEmployeeDeductionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @IsIn(DEDUCTION_KINDS)
  kind!: (typeof DEDUCTION_KINDS)[number];

  @IsIn(COMPENSATION_CATEGORIES)
  category!: (typeof COMPENSATION_CATEGORIES)[number];

  @IsString()
  @MaxLength(160)
  title!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  amount!: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateOvertimeRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @IsDateString()
  date!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.25)
  @Max(24)
  requestedHours!: number;

  @IsOptional()
  @IsIn(OVERTIME_DAY_TYPES)
  dayType?: (typeof OVERTIME_DAY_TYPES)[number];

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ApproveOvertimeRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.25)
  @Max(24)
  approvedHours!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  multiplier?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class PreviewEndOfServiceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @IsDateString()
  effectiveDate!: string;

  @IsIn(TERMINATION_TYPES)
  terminationType!: (typeof TERMINATION_TYPES)[number];

  @IsOptional()
  @IsDateString()
  hireDateOverride?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherAdditions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherDeductions?: number;
}

export class CreateEndOfServiceDto extends PreviewEndOfServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionsNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deductionsNotes?: string;

  @IsOptional()
  @IsBoolean()
  isDepartmentCleared?: boolean;

  @IsOptional()
  @IsBoolean()
  isItCleared?: boolean;

  @IsOptional()
  @IsBoolean()
  isFinanceCleared?: boolean;

  @IsOptional()
  @IsBoolean()
  isHrCleared?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  clearanceNotes?: string;
}

export class UpdateSettlementClearanceDto {
  @IsOptional()
  @IsBoolean()
  isDepartmentCleared?: boolean;

  @IsOptional()
  @IsBoolean()
  isItCleared?: boolean;

  @IsOptional()
  @IsBoolean()
  isFinanceCleared?: boolean;

  @IsOptional()
  @IsBoolean()
  isHrCleared?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  clearanceNotes?: string;
}

export class ApproveSettlementDto {
  @IsOptional()
  @IsBoolean()
  postAccounting?: boolean;
}

export class PaySettlementDto {
  @IsOptional()
  @IsIn(['CASH', 'BANK'])
  paymentMethod?: 'CASH' | 'BANK';

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsBoolean()
  postAccounting?: boolean;
}
