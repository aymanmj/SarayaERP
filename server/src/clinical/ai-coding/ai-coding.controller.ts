import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiCodingService } from './ai-coding.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';

@Controller('clinical/ai-coding')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiCodingController {
  constructor(private readonly aiCodingService: AiCodingService) {}

  @Post('suggest')
  @Permissions('clinical:encounters:create')
  async suggestCodes(
    @Body() data: { clinicalNote: string; patientDemographics?: string }
  ) {
    return this.aiCodingService.suggestCodes(data.clinicalNote, data.patientDemographics);
  }
}
