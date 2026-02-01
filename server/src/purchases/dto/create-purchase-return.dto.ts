import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PurchaseReturnItemDto {
  @IsInt()
  @IsNotEmpty()
  productId: number;

  @IsNumber()
  @Min(0.001)
  @IsNotEmpty()
  quantity: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreatePurchaseReturnDto {
  @IsInt()
  @IsNotEmpty()
  purchaseInvoiceId: number;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnItemDto)
  items: PurchaseReturnItemDto[];
}
