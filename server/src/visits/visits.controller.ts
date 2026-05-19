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
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
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

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Permissions('visits:manage')
  @Post()
  create(@Body() dto: CreateVisitDto, @CurrentUser() user: any) {
    return this.visitsService.createVisit({
      encounterId: dto.encounterId,
      doctorId: user.sub,
      notes: dto.notes,
      diagnosisText: dto.diagnosisText,
    });
  }

  @Permissions('visits:view')
  @Get('by-encounter/:id')
  listForEncounter(@Param('id') id: string) {
    const encId = Number(id);
    if (!encId || Number.isNaN(encId)) {
      throw new BadRequestException('رقم Encounter غير صحيح');
    }

    return this.visitsService.listForEncounter(encId);
  }
}
