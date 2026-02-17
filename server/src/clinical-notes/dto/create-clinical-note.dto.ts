
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
  @IsNotEmpty()
  content: string;

  @IsNumber()
  @IsOptional()
  shiftId?: number;
}
