import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
export class ClaimPaymentDto {
  @IsUUID('4') requestId!: string;
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) paidAmount!: string;
  @IsOptional()
  @IsString()
  @Matches(/^0(?:\.0{1,3})?$/)
  adjustmentAmount?: string;
  @IsOptional() @IsString() @MaxLength(500) adjustmentReason?: string;
}
