// src/triage/triage.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TriageService } from './triage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TriageLevel } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('triage')
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Get('waiting')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  async getWaiting(@Req() req: any) {
    return this.triageService.getWaitingList(req.user.hospitalId);
  }

  @Post('assess')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  async createAssessment(@Req() req: any, @Body() body: any) {
    return this.triageService.createAssessment({
      hospitalId: req.user.hospitalId,
      userId: req.user.sub,
      encounterId: Number(body.encounterId),
      level: body.level as TriageLevel,
      chiefComplaint: body.chiefComplaint,
      vitals: body.vitals,
      notes: body.notes,
    });
  }
  @Post('suggest')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  suggestLevel(@Body() body: any) {
    return {
      suggestedLevel: this.triageService.suggestTriageLevel(body.vitals),
    };
  }
}
