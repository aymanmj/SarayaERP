/**
 * Patient Portal — DTOs with class-validator
 * 
 * All portal inputs are validated strictly to prevent injection and abuse.
 */
import { IsString, IsNotEmpty, Length, IsOptional, IsInt, IsDateString, Min, Max, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ===========================================
// AUTH DTOs
// ===========================================

export class RequestOtpDto {
  @ApiProperty({ example: 'MRN-0001', description: 'رقم الملف الطبي' })
  @IsString()
  @IsNotEmpty()
  mrn: string;

  @ApiProperty({ example: '0912345678', description: 'رقم هاتف المريض المسجل' })
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'MRN-0001' })
  @IsString()
  @IsNotEmpty()
  mrn: string;

  @ApiProperty({ example: '483921', description: 'رمز التحقق (6 أرقام)' })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain only digits' })
  code: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: '1.a3f8b2c1d4e5...' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

// ===========================================
// APPOINTMENT DTOs
// ===========================================

export class BookAppointmentDto {
  @ApiProperty({ example: 5, description: 'ID الطبيب' })
  @IsInt()
  doctorId: number;

  @ApiPropertyOptional({ example: 3, description: 'ID القسم' })
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiProperty({ example: '2026-04-20T09:00:00Z', description: 'وقت الموعد' })
  @IsDateString()
  scheduledStart: string;

  @ApiPropertyOptional({ example: 'متابعة حالة السكري' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// ===========================================
// PAGINATION DTOs
// ===========================================

export class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// ===========================================
// MESSAGING DTOs
// ===========================================

export class SendMessageDto {
  @ApiProperty({ example: 5, description: 'ID الطبيب المستلم' })
  @IsInt()
  doctorId: number;

  @ApiPropertyOptional({ example: 'استفسار عن نتائج التحاليل' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ example: 'أريد الاستفسار عن نتائج تحاليل الدم الأخيرة', description: 'نص الرسالة' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ example: 'abc-123-def', description: 'ID المحادثة للرد على محادثة قائمة' })
  @IsOptional()
  @IsString()
  threadId?: string;
}

// ===========================================
// REFILL DTOs
// ===========================================

export class RequestRefillDto {
  @ApiProperty({ example: 12, description: 'ID الوصفة الطبية' })
  @IsInt()
  prescriptionId: number;

  @ApiPropertyOptional({ example: 'أحتاج تجديد دواء الضغط' })
  @IsOptional()
  @IsString()
  notes?: string;
}

