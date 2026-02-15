import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SystemSettingType } from '@prisma/client';

export class CreateSystemSettingDto {
  @IsNotEmpty()
  @IsString()
  key: string;

  @IsNotEmpty()
  @IsString()
  value: string;

  @IsOptional()
  @IsString()
  group?: string;

  @IsOptional()
  @IsEnum(SystemSettingType)
  type?: SystemSettingType;

  @IsOptional()
  @IsString()
  description?: string;
}
