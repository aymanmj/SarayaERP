import {
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
  Query,
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

  @Patch(':id/read')
  async markRead(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.markAsRead(req.user.hospitalId, req.user.sub, id);
  }

  @Patch('read-all')
  async markAllRead(@Req() req: any) {
    return this.service.markAllRead(req.user.hospitalId, req.user.sub);
  }
}
