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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post()
  @Roles('ADMIN', 'DOCTOR')
  async create(@Req() req: any, @Body() body: any) {
    return this.referralService.create(req.user.hospitalId, req.user.sub, body);
  }

  @Get('sent')
  @Roles('ADMIN', 'DOCTOR')
  async findSent(@Req() req: any) {
    return this.referralService.findSent(req.user.hospitalId, req.user.sub);
  }

  @Get('received')
  @Roles('ADMIN', 'DOCTOR')
  async findReceived(@Req() req: any) {
    return this.referralService.findReceived(req.user.hospitalId, req.user.sub);
  }

  @Get()
  @Roles('ADMIN')
  async findAll(@Req() req: any) {
    return this.referralService.findAll(req.user.hospitalId);
  }

  @Patch(':id/accept')
  @Roles('ADMIN', 'DOCTOR')
  async accept(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.referralService.accept(req.user.hospitalId, id, req.user.sub);
  }

  @Patch(':id/complete')
  @Roles('ADMIN', 'DOCTOR')
  async complete(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { notes?: string },
  ) {
    return this.referralService.complete(req.user.hospitalId, id, req.user.sub, body.notes);
  }

  @Patch(':id/reject')
  @Roles('ADMIN', 'DOCTOR')
  async reject(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { notes?: string },
  ) {
    return this.referralService.reject(req.user.hospitalId, id, req.user.sub, body.notes);
  }

  @Patch(':id/cancel')
  @Roles('ADMIN', 'DOCTOR')
  async cancel(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.referralService.cancel(req.user.hospitalId, id, req.user.sub);
  }
}
