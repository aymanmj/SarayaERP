import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { CreateSystemSettingDto } from './dto/create-system-setting.dto';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('system-settings')
@UseGuards(JwtAuthGuard)
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  // @Post()
  // create(@Body() createSystemSettingDto: CreateSystemSettingDto) {
  //   return this.systemSettingsService.create(createSystemSettingDto);
  // }

  @Get()
  findAll(@Request() req) {
    return this.systemSettingsService.findAll(req.user.hospitalId);
  }

  @Get(':key')
  findOne(@Request() req, @Param('key') key: string) {
    return this.systemSettingsService.findOne(req.user.hospitalId, key);
  }

  @Patch(':key')
  update(@Request() req, @Param('key') key: string, @Body() updateSystemSettingDto: UpdateSystemSettingDto) {
    return this.systemSettingsService.update(req.user.hospitalId, key, updateSystemSettingDto);
  }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.systemSettingsService.remove(+id);
  // }
}
