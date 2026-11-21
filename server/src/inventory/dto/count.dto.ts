import { Type, Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { InventoryCountType, InventoryCountStatus } from '@prisma/client';
export class CountScopeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  hospitalId?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  warehouseId?: number;
}
export class CreateInventoryCountDto {
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) hospitalId?: number;
  @IsInt() @Min(1) @Max(2147483647) warehouseId!: number;
  @IsEnum(InventoryCountType) type!: InventoryCountType;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  notes?: string;
}
export class UpdateCountLineDto {
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) physicalQty!: string;
  @IsInt() @Min(0) @Max(2147483646) revision!: number;
}
export class UpdateCountStatusDto {
  @IsEnum(InventoryCountStatus) status!: InventoryCountStatus;
}
