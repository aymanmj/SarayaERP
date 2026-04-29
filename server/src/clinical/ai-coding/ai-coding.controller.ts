import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AiCodingService } from './ai-coding.service';
import type { ApplyCodesDto } from './ai-coding.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';

@Controller('clinical/ai-coding')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiCodingController {
  constructor(private readonly aiCodingService: AiCodingService) {}

  /**
   * تحليل الملاحظات السريرية واقتراح أكواد ICD-10 و CPT
   */
  @Post('suggest')
  @Permissions('clinical:encounters:create')
  async suggestCodes(
    @Body() data: { clinicalNote: string; patientDemographics?: string }
  ) {
    return this.aiCodingService.suggestCodes(data.clinicalNote, data.patientDemographics);
  }

  /**
   * اعتماد الأكواد المختارة من الطبيب وحفظها في:
   * - ICD-10 → جدول التشخيصات (EncounterDiagnosis)
   * - CPT → بنود الفوترة (EncounterCharge)
   */
  @Post('apply')
  @Permissions('clinical:encounters:create')
  async applyCodes(
    @Body() dto: ApplyCodesDto,
    @Req() req: any,
  ) {
    return this.aiCodingService.applySuggestedCodes(
      dto,
      req.user.sub,
      req.user.hospitalId,
    );
  }
}
