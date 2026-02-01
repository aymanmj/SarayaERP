import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { VisitsService } from './visits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

class CreateVisitDto {
  @IsInt()
  @Min(1)
  encounterId: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  diagnosisText?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  // الطبيب (أو الأدمن) يضيف Visit
  @Post()
  @Roles('ADMIN', 'DOCTOR')
  create(
    @Body() dto: CreateVisitDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.visitsService.createVisit({
      encounterId: dto.encounterId,
      doctorId: user.sub, // id من الـ token
      notes: dto.notes,
      diagnosisText: dto.diagnosisText,
    });
  }

  // جلب زيارات Encounter معين
  @Get('by-encounter/:id')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  listForEncounter(@Param('id') id: string) {
    const encId = Number(id);
    if (!encId || Number.isNaN(encId)) {
      throw new BadRequestException('رقم Encounter غير صحيح');
    }

    return this.visitsService.listForEncounter(encId);
  }
}
