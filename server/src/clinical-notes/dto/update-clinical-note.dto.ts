import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NoteType } from '@prisma/client';

export class UpdateClinicalNoteDto {
  @IsEnum(NoteType)
  @IsOptional()
  type?: NoteType;

  @IsString()
  @IsOptional()
  content?: string;

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

  @IsString()
  @IsOptional()
  @MaxLength(255)
  addendumReason?: string;

  @IsNumber()
  @IsOptional()
  shiftId?: number;
}
