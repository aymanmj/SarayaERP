import { Controller, Get, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';

@Controller('system-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Permissions('admin:view')
  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.systemSettingsService.findAll(user.hospitalId);
  }

  @Permissions('admin:view')
  @Get(':key')
  findOne(@CurrentUser() user: JwtPayload, @Param('key') key: string) {
    return this.systemSettingsService.findOne(user.hospitalId, key);
  }

  @Permissions('admin:manage')
  @AuditInTransaction()
  @Patch(':key')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
    @Body() updateSystemSettingDto: UpdateSystemSettingDto,
  ) {
    return this.systemSettingsService.update(
      user.hospitalId,
      key,
      updateSystemSettingDto,
      user.sub,
    );
  }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.systemSettingsService.remove(+id);
  // }
}
