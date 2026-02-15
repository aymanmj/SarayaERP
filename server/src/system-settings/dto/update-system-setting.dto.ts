import { PartialType } from '@nestjs/mapped-types';
import { CreateSystemSettingDto } from './create-system-setting.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateSystemSettingDto extends PartialType(CreateSystemSettingDto) {
  @IsNotEmpty()
  @IsString()
  value: string;
}
