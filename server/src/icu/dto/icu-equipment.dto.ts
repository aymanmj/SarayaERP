import { IsNumber, IsOptional, IsString, IsDecimal } from 'class-validator';

export class CreateEquipmentUsageDto {
  @IsNumber()
  encounterId: number;

  @IsString()
  equipmentType: string;

  @IsString()
  @IsOptional()
  equipmentName?: string;

  @IsNumber()
  @IsOptional()
  dailyRate?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
