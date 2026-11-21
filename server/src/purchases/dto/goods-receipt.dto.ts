import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class GoodsReceiptItemDto {
  @IsInt() @Min(1) @Max(2147483647) purchaseOrderItemId!: number;
  @IsInt() @Min(1) @Max(2147483647) productId!: number;
  @IsInt() @Min(1) @Max(2147483647) uomId!: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) quantity!: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  batchNumber!: string;
  @IsDateString() expiryDate!: string;
}
export class CreateGoodsReceiptDto {
  @IsUUID('4') requestId!: string;
  @IsInt() @Min(1) @Max(2147483647) poId!: number;
  @IsInt() @Min(1) @Max(2147483647) warehouseId!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items!: GoodsReceiptItemDto[];
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}
