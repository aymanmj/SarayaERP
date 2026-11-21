import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
class DepositIdentityDto {
  @IsUUID('4') requestId!: string;
}
export class CreatePatientDepositDto extends DepositIdentityDto {
  @IsInt() @Min(1) @Max(2147483647) patientId!: number;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) encounterId?: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) amount!: string;
  @IsIn(['CASH', 'CARD', 'TRANSFER']) method!: 'CASH' | 'CARD' | 'TRANSFER';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) reference?: string;
}
export class ApplyDepositDto extends DepositIdentityDto {
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) invoiceId!: number;
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/)
  amount?: string;
}
export class RefundDepositDto extends DepositIdentityDto {
  @IsInt() @Min(1) @Max(2147483647) patientId!: number;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) encounterId?: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) amount!: string;
  @IsIn(['CASH', 'CARD', 'TRANSFER']) method!: 'CASH' | 'CARD' | 'TRANSFER';
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
export class CreateInterimInvoiceDto {
  @IsOptional() @IsDateString() cutoffDate?: string;
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  chargeIds?: number[];
  @IsOptional() @IsBoolean() autoApplyDeposit?: boolean;
}
