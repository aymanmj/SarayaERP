// src/cdss/cdss.dto.ts
// =====================================================================
// DTOs لنظام دعم القرار السريري
// =====================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '@prisma/client';

// ======================== Drug Check DTOs ========================

export class DrugCheckInputDto {
  @ApiPropertyOptional({ description: 'معرف المنتج (الدواء)' })
  @IsOptional()
  @IsNumber()
  productId?: number;

  @ApiProperty({ description: 'الاسم العلمي للدواء' })
  @IsString()
  genericName: string;

  @ApiPropertyOptional({ description: 'الجرعة' })
  @IsOptional()
  @IsString()
  dose?: string;

  @ApiPropertyOptional({ description: 'طريقة الإعطاء' })
  @IsOptional()
  @IsString()
  route?: string;
}

export class PrescriptionCheckDto {
  @ApiProperty({ description: 'معرف المريض' })
  @IsNumber()
  patientId: number;

  @ApiPropertyOptional({ description: 'معرف الزيارة' })
  @IsOptional()
  @IsNumber()
  encounterId?: number;

  @ApiProperty({ description: 'قائمة الأدوية للفحص', type: [DrugCheckInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DrugCheckInputDto)
  drugs: DrugCheckInputDto[];
}

// ======================== Lab Result Check DTOs ========================

export class CheckLabResultDto {
  @ApiProperty({ description: 'معرف المريض' })
  @IsNumber()
  patientId: number;

  @ApiPropertyOptional({ description: 'معرف الزيارة' })
  @IsOptional()
  @IsNumber()
  encounterId?: number;

  @ApiProperty({ description: 'رمز الفحص المختبري', example: 'GLUC' })
  @IsString()
  testCode: string;

  @ApiProperty({ description: 'القيمة', example: 450 })
  @IsNumber()
  value: number;

  @ApiProperty({ description: 'الوحدة', example: 'mg/dL' })
  @IsString()
  unit: string;

  @ApiPropertyOptional({ description: 'عمر المريض' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  patientAge?: number;

  @ApiPropertyOptional({ description: 'جنس المريض', enum: Gender })
  @IsOptional()
  @IsEnum(['MALE', 'FEMALE', 'OTHER'])
  gender?: Gender;
}

// ======================== Vitals Check DTOs ========================

export class CheckVitalsDto {
  @ApiProperty({ description: 'معرف المريض' })
  @IsNumber()
  patientId: number;

  @ApiProperty({ description: 'معرف الزيارة' })
  @IsNumber()
  encounterId: number;

  @ApiPropertyOptional({ description: 'درجة الحرارة (سيليزية)' })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ description: 'ضغط الدم الانقباضي' })
  @IsOptional()
  @IsNumber()
  bpSystolic?: number;

  @ApiPropertyOptional({ description: 'ضغط الدم الانبساطي' })
  @IsOptional()
  @IsNumber()
  bpDiastolic?: number;

  @ApiPropertyOptional({ description: 'معدل النبض' })
  @IsOptional()
  @IsNumber()
  pulse?: number;

  @ApiPropertyOptional({ description: 'معدل التنفس' })
  @IsOptional()
  @IsNumber()
  respRate?: number;

  @ApiPropertyOptional({ description: 'تشبع الأكسجين %' })
  @IsOptional()
  @IsNumber()
  o2Sat?: number;
}

// ======================== Drug Interactions Search DTO ========================

export class DrugInteractionsQueryDto {
  @ApiProperty({ description: 'اسم الدواء للبحث' })
  @IsString()
  drug: string;

  @ApiPropertyOptional({ description: 'عدد النتائج', default: 20 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}

// ======================== Alert Override DTO ========================

export class OverrideAlertDto {
  @ApiProperty({ description: 'سبب التجاوز (10 أحرف على الأقل)' })
  @IsString()
  reason: string;
}
