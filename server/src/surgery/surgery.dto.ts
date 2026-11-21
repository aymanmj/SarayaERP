import { IsInt, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { PharmacyWarehousePolicyDto } from '../pharmacy/dto/warehouse-policy.dto';
export class SurgeryWarehousePolicyDto extends PharmacyWarehousePolicyDto {}
export class SurgeryConsumableDto {
  @IsInt() @Min(1) @Max(2147483647) productId!: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/) quantity!: string;
  @IsUUID('4') requestId!: string;
}
