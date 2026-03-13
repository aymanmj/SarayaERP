import { IsNumber, IsOptional, IsString, IsEnum } from 'class-validator';

export class RequestTransferDto {
  @IsNumber()
  encounterId: number;

  @IsNumber()
  @IsOptional()
  fromBedId?: number;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AllocateBedDto {
  @IsNumber()
  toBedId: number;
}

export class HandoverNoteDto {
  @IsString()
  situation: string;

  @IsString()
  background: string;

  @IsString()
  assessment: string;

  @IsString()
  recommendation: string;

  @IsOptional()
  isSigned?: boolean;
}
