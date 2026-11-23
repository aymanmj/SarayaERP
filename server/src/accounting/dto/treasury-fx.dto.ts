import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const EXCHANGE_RATE_SOURCES = [
  'CBL_OFFICIAL',
  'MANUAL',
  'COMMERCIAL_BANK',
  'API_FEED',
] as const;

export type ExchangeRateSource = (typeof EXCHANGE_RATE_SOURCES)[number];

export const BANK_STATEMENT_DIRECTIONS = ['CREDIT', 'DEBIT'] as const;
export type BankStatementDirection = (typeof BANK_STATEMENT_DIRECTIONS)[number];

export const BANK_ADJUSTMENT_TYPES = [
  'BANK_CHARGES',
  'FX_GAIN_LOSS',
  'CUSTOM_ACCOUNT',
] as const;
export type BankAdjustmentType = (typeof BANK_ADJUSTMENT_TYPES)[number];

export class CreateCurrencyDto {
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message:
      'رمز العملة يجب أن يكون 3 أحرف لاتينية كبيرة وفق ISO 4217 (مثل LYD، USD، EUR)',
  })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameAr!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameEn!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  symbol!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  decimalPlaces?: number;

  @IsOptional()
  @IsBoolean()
  isBase?: boolean;
}

export class CreateExchangeRateDto {
  @IsInt()
  @Min(1)
  fromCurrencyId!: number;

  @IsInt()
  @Min(1)
  toCurrencyId!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,6})?$/, {
    message:
      'سعر الصرف يجب أن يكون رقمًا موجبًا حتى 6 خانات عشرية (DECIMAL 19,6)',
  })
  rate!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsIn(EXCHANGE_RATE_SOURCES)
  source?: ExchangeRateSource;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  referenceNote?: string;
}

export class ConvertCurrencyDto {
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  fromCode!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  toCode!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^-?\d+(\.\d{1,4})?$/, {
    message: 'المبلغ يجب أن يكون رقمًا عشريًا صالحًا',
  })
  amount!: string;

  @IsOptional()
  @IsDateString()
  asOfDate?: string;
}

export class CreateBankAccountDto {
  @IsInt()
  @Min(1)
  accountId!: number;

  @IsInt()
  @Min(1)
  currencyId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  bankName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  branchName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  accountNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  swiftCode?: string;
}

export class CreateReconciliationSessionDto {
  @IsInt()
  @Min(1)
  bankAccountId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  statementNumber!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsString()
  @Matches(/^-?\d+(\.\d{1,3})?$/, {
    message: 'الرصيد الافتتاحي للبنك يجب أن يكون بدقة 3 خانات عشرية كحد أقصى',
  })
  openingBalanceBank!: string;

  @IsString()
  @Matches(/^-?\d+(\.\d{1,3})?$/, {
    message: 'الرصيد الختامي للبنك يجب أن يكون بدقة 3 خانات عشرية كحد أقصى',
  })
  closingBalanceBank!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ImportStatementItemDto {
  @IsDateString()
  transactionDate!: string;

  @IsOptional()
  @IsDateString()
  valueDate?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  reference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(BANK_STATEMENT_DIRECTIONS)
  direction!: BankStatementDirection;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,3})?$/, {
    message: 'مبلغ الحركة يجب أن يكون موجبًا بدقة 3 خانات عشرية كحد أقصى',
  })
  amount?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  foreignCurrencyId?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,3})?$/, {
    message: 'المبلغ بالعملة الأجنبية يجب أن يكون موجبًا',
  })
  foreignAmount?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,6})?$/, {
    message: 'سعر الصرف المستخدم يجب أن يكون موجبًا بدقة حتى 6 خانات عشرية',
  })
  exchangeRateUsed?: string;
}

export class ImportStatementItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportStatementItemDto)
  items!: ImportStatementItemDto[];
}

export class AutoMatchOptionsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  dateToleranceDays?: number;
}

export class ManualMatchStatementItemDto {
  @IsInt()
  @Min(1)
  entryLineId!: number;
}

export class PostBankAdjustmentDto {
  @IsIn(BANK_ADJUSTMENT_TYPES)
  adjustmentType!: BankAdjustmentType;

  @IsOptional()
  @IsInt()
  @Min(1)
  counterAccountId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}
