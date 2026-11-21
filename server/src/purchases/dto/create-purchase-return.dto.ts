import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
class PurchaseReturnItemDto {
  @IsInt() @Min(1) productId: number;
  @IsOptional() @IsInt() @Min(1) purchaseInvoiceLineId?: number;
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999999999999.999)
  quantity: number;
  @IsString() @IsOptional() @MaxLength(1000) description?: string;
}
export class CreatePurchaseReturnDto {
  @IsInt() @Min(1) purchaseInvoiceId: number;
  @IsString() @MinLength(5) @MaxLength(1000) reason: string;
  @IsUUID() requestId: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnItemDto)
  items: PurchaseReturnItemDto[];
}
