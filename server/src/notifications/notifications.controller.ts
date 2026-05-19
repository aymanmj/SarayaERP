import {
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
  Query,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Permissions('notifications:view')
  @Get()
  async getMyNotifications(@Req() req: any, @Query('unread') unread?: string) {
    return this.service.getUserNotifications(
      req.user.hospitalId,
      req.user.sub,
      unread === 'true',
    );
  }

  @Permissions('notifications:manage')
  @Post('devices')
  async registerDevice(
    @Req() req: any,
    @Body() body: { token: string; platform?: string },
  ) {
    if (!body.token) {
      throw new BadRequestException('Token is required');
    }
    return this.service.registerDevice(req.user.sub, body.token, body.platform);
  }

  // ✅ TEST ENDPOINT
  @Permissions('notifications:manage')
  @Post('test-push')
  async testPush(@Req() req: any) {
    return this.service.create(
      req.user.hospitalId,
      req.user.sub,
      'Test Notification',
      'This is a test push notification from the backend!',
    );
  }

  @Permissions('notifications:manage')
  @Patch(':id/read')
  async markRead(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.markAsRead(req.user.hospitalId, req.user.sub, id);
  }

  @Permissions('notifications:manage')
  @Patch('read-all')
  async markAllRead(@Req() req: any) {
    return this.service.markAllRead(req.user.hospitalId, req.user.sub);
  }
}
