import { IsInt, IsOptional, IsString, IsBoolean, Min } from 'class-validator';

export class RequestTransferDto {
  @IsInt()
  @Min(1)
  encounterId: number;

  @IsInt()
  @Min(1)
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
  @IsInt()
  @Min(1)
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
  @IsBoolean()
  isSigned?: boolean;
}
