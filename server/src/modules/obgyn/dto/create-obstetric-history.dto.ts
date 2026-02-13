import { IsOptional } from 'class-validator';

export class CreateObstetricHistoryDto {
  @IsOptional()
  patientId: any;

  @IsOptional()
  gravida: any;

  @IsOptional()
  para: any;

  @IsOptional()
  abortion: any;

  @IsOptional()
  prevCSCount: any;

  @IsOptional()
  lastDeliveryDate?: any;

  @IsOptional()
  bloodGroup?: any;

  @IsOptional()
  riskFactors?: any;

  @IsOptional()
  notes?: any;
}
