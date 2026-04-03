
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsEnum } from 'class-validator';
import { NoteType } from '@prisma/client';

export class CreateClinicalNoteDto {
  @IsNumber()
  @IsNotEmpty()
  encounterId: number;

  @IsEnum(NoteType)
  @IsOptional()
  type?: NoteType;

  @IsString()
  @IsOptional()
  content?: string;

  // Structured SOAP Fields
  @IsString()
  @IsOptional()
  subjective?: string;

  @IsString()
  @IsOptional()
  objective?: string;

  @IsString()
  @IsOptional()
  assessment?: string;

  @IsString()
  @IsOptional()
  plan?: string;

  // Metadata
  @IsOptional()
  isAddendum?: boolean;

  @IsNumber()
  @IsOptional()
  parentNoteId?: number;

  @IsNumber()
  @IsOptional()
  shiftId?: number;
}
