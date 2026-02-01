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
  Req,
} from '@nestjs/common';
import { DiagnosisService } from './diagnosis.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DiagnosisType } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('diagnosis')
export class DiagnosisController {
  constructor(private readonly diagnosisService: DiagnosisService) {}

  @Get('search')
  async search(@Query('q') q: string) {
    return this.diagnosisService.searchCodes(q);
  }

  @Get('encounter/:id')
  async listForEncounter(@Param('id', ParseIntPipe) id: number) {
    return this.diagnosisService.getEncounterDiagnoses(id);
  }

  @Post('encounter/:id')
  async addDiagnosis(
    @Param('id', ParseIntPipe) encounterId: number,
    @Req() req: any,
    @Body() body: { codeId: number; type: DiagnosisType; note?: string },
  ) {
    return this.diagnosisService.addDiagnosisToEncounter({
      encounterId,
      userId: req.user.sub,
      codeId: body.codeId,
      type: body.type,
      note: body.note,
    });
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.diagnosisService.removeEncounterDiagnosis(id);
  }
}
