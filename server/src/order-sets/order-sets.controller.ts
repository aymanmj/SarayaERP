import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderSetsService } from './order-sets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('order-sets')
export class OrderSetsController {
  constructor(private readonly service: OrderSetsService) {}

  @Post()
  @Permissions('order-sets:manage')
  create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.service.create(user.hospitalId, user.sub, body);
  }

  @Get()
  @Permissions('order-sets:view')
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: string,
    @Query('specialty') specialty?: string,
    @Query('search') search?: string,
    @Query('scope') scope?: 'published' | 'all',
    @Query('status') status?: any,
    @Query('contentKey') contentKey?: string,
  ) {
    return this.service.findAll(user.hospitalId, {
      category,
      specialty,
      search,
      scope,
      status,
      contentKey,
    });
  }

  @Get('categories')
  @Permissions('order-sets:view')
  getCategories(@CurrentUser() user: JwtPayload) {
    return this.service.getCategories(user.hospitalId);
  }

  @Get('specialties')
  @Permissions('order-sets:view')
  getSpecialties(@CurrentUser() user: JwtPayload) {
    return this.service.getSpecialties(user.hospitalId);
  }

  @Get(':id/history')
  @Permissions('order-sets:view')
  history(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findHistory(user.hospitalId, +id);
  }

  @Get(':id')
  @Permissions('order-sets:view')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(user.hospitalId, +id);
  }

  @Put(':id')
  @Permissions('order-sets:manage')
  update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(user.hospitalId, +id, user.sub, body);
  }

  @Delete(':id')
  @Permissions('order-sets:manage')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(user.hospitalId, +id, user.sub);
  }

  @Post(':id/submit-review')
  @Permissions('order-sets:manage')
  submitForReview(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.submitForReview(
      user.hospitalId,
      +id,
      user.sub,
      body?.notes,
    );
  }

  @Post(':id/approve')
  @Permissions('order-sets:manage')
  approve(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.approve(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/reject')
  @Permissions('order-sets:manage')
  reject(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reject(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/publish')
  @Permissions('order-sets:manage')
  publish(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.publish(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/retire')
  @Permissions('order-sets:manage')
  retire(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.retire(user.hospitalId, +id, user.sub, body?.notes);
  }

  @Post(':id/execute')
  @Permissions('order-sets:manage')
  execute(
    @Param('id') id: string,
    @Body() body: { encounterId: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.execute(
      user.hospitalId,
      user.sub,
      +id,
      body.encounterId,
    );
  }
}
