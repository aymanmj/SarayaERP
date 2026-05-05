import { IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(2, { message: 'اسم المستخدم قصير جداً' })
  @MaxLength(100, { message: 'اسم المستخدم طويل جداً' })
  username: string;

  @IsString()
  @MinLength(6, { message: 'كلمة المرور قصيرة جداً' })
  @MaxLength(128, { message: 'كلمة المرور طويلة جداً' }) // bcrypt truncates at 72 bytes
  password: string;
}
