// src/attendance/dto/attendance.dto.ts

import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsArray, ValidateNested } from 'class-validator';

// تمثل بصمة واحدة قادمة من الجهاز
export class CreatePunchDto {
  @IsInt()
  userId!: number; // رقم الموظف في النظام

  @IsDateString()
  timestamp!: string; // وقت البصمة ISO 8601 e.g., "2025-01-01T08:05:00Z"
}

// لاستقبال مجموعة بصمات دفعة واحدة (Bulk)
export class BulkPunchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePunchDto)
  punches!: CreatePunchDto[];
}
