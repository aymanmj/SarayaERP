import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum VoucherType {
  PAYMENT = 'PAYMENT',
  RECEIPT = 'RECEIPT',
}

export class CreateVoucherDto {
  @IsEnum(VoucherType)
  type: VoucherType;

  @IsDateString()
  date: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  amount: number;

  @IsNumber()
  @Type(() => Number)
  accountId: number;

  @IsNumber()
  @Type(() => Number)
  cashAccountId: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  payeeOrPayer?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class UpdateVoucherDto extends CreateVoucherDto {}
