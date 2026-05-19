// src/referral/referral.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post()
  @Permissions('referral:manage')
  async create(@Req() req: any, @Body() body: any) {
    return this.referralService.create(req.user.hospitalId, req.user.sub, body);
  }

  @Get('sent')
  @Permissions('referral:manage')
  async findSent(@Req() req: any) {
    return this.referralService.findSent(req.user.hospitalId, req.user.sub);
  }

  @Get('received')
  @Permissions('referral:manage')
  async findReceived(@Req() req: any) {
    return this.referralService.findReceived(req.user.hospitalId, req.user.sub);
  }

  @Get()
  @Permissions('referral:manage')
  async findAll(@Req() req: any) {
    return this.referralService.findAll(req.user.hospitalId);
  }

  @Patch(':id/accept')
  @Permissions('referral:manage')
  async accept(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.referralService.accept(req.user.hospitalId, id, req.user.sub);
  }

  @Patch(':id/complete')
  @Permissions('referral:manage')
  async complete(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { notes?: string },
  ) {
    return this.referralService.complete(
      req.user.hospitalId,
      id,
      req.user.sub,
      body.notes,
    );
  }

  @Patch(':id/reject')
  @Permissions('referral:manage')
  async reject(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { notes?: string },
  ) {
    return this.referralService.reject(
      req.user.hospitalId,
      id,
      req.user.sub,
      body.notes,
    );
  }

  @Patch(':id/cancel')
  @Permissions('referral:manage')
  async cancel(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.referralService.cancel(req.user.hospitalId, id, req.user.sub);
  }
}
