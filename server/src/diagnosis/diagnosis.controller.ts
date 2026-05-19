import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DiagnosisService } from './diagnosis.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { DiagnosisType, TerminologySystem } from '@prisma/client';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('diagnosis')
export class DiagnosisController {
  constructor(private readonly diagnosisService: DiagnosisService) {}

  @Permissions('diagnosis:view')
  @Get('search')
  async search(@Query('q') q: string) {
    return this.diagnosisService.searchCodes(q);
  }

  @Permissions('diagnosis:view')
  @Get('encounter/:id')
  async listForEncounter(@Param('id', ParseIntPipe) id: number) {
    return this.diagnosisService.getEncounterDiagnoses(id);
  }

  @Permissions('diagnosis:manage')
  @Post('encounter/:id')
  async addDiagnosis(
    @Param('id', ParseIntPipe) encounterId: number,
    @CurrentUser() user: any,
    @Body()
    body: {
      codeId?: number;
      type: DiagnosisType;
      note?: string;
      terminologySystem?: TerminologySystem;
      terminologyCode?: string;
    },
  ) {
    return this.diagnosisService.addDiagnosisToEncounter({
      encounterId,
      userId: user.sub,
      codeId: body.codeId,
      type: body.type,
      note: body.note,
      terminologySystem: body.terminologySystem,
      terminologyCode: body.terminologyCode,
    });
  }

  @Permissions('diagnosis:manage')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.diagnosisService.removeEncounterDiagnosis(id);
  }
}
