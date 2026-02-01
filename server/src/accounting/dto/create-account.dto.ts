import { IsInt, IsOptional, IsString, IsEnum, Length } from 'class-validator';
import { AccountType } from '@prisma/client';

export class CreateAccountDto {
  @IsString()
  @Length(3, 20)
  code!: string; // مثال: 100100

  @IsString()
  @Length(3, 100)
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsOptional()
  @IsInt()
  parentId?: number;
}
