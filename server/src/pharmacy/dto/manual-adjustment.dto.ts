import { Transform } from 'class-transformer';
import {
  IsEmpty,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class PharmacyManualAdjustmentDto {
  @IsInt() @Min(1) @Max(2147483647) drugItemId!: number;
  @IsIn(['ADJUST']) type!: 'ADJUST';
  @IsString() @Matches(/^-?(0|[1-9]\d{0,14})(\.\d{1,3})?$/) quantity!: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  batchNumber!: string;
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500) reason!: string;
  @IsUUID('4') requestId!: string;
  @IsEmpty() unitCost?: never;
  @IsEmpty() expiryDate?: never;
}
