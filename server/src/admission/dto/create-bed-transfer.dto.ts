import {
  IsString,
  IsInt,
  Min,
  MaxLength,
  IsEnum,
} from 'class-validator';

export class CreateBedTransferDto {
  @IsInt()
  @Min(1)
  toBedId: number;

  @IsString()
  @MaxLength(500)
  transferReason: string;

  @IsEnum(['ROUTINE', 'URGENT', 'EMERGENCY'])
  transferType: string = 'ROUTINE';

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority: string = 'MEDIUM';
}
