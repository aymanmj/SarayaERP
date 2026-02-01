import { IsInt, IsOptional, IsString, IsEnum, Length } from 'class-validator';
import { AccountType } from '@prisma/client';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(3, 20)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(3, 100)
  name?: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsInt()
  parentId?: number;
}
