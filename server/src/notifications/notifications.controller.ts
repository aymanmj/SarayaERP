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

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  async getMyNotifications(@Req() req: any, @Query('unread') unread?: string) {
    return this.service.getUserNotifications(
      req.user.hospitalId,
      req.user.sub,
      unread === 'true',
    );
  }

  @Post('devices')
  async registerDevice(@Req() req: any, @Body() body: { token: string; platform?: string }) {
    if (!body.token) {
      throw new BadRequestException('Token is required');
    }
    return this.service.registerDevice(req.user.sub, body.token, body.platform);
  }

  // ✅ TEST ENDPOINT
  @Post('test-push')
  async testPush(@Req() req: any) {
    return this.service.create(
      req.user.hospitalId,
      req.user.sub,
      'Test Notification',
      'This is a test push notification from the backend!',
    );
  }

  @Patch(':id/read')
  async markRead(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.markAsRead(req.user.hospitalId, req.user.sub, id);
  }

  @Patch('read-all')
  async markAllRead(@Req() req: any) {
    return this.service.markAllRead(req.user.hospitalId, req.user.sub);
  }
}
