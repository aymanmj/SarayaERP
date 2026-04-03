import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Req } from '@nestjs/common';
import { DischargeSummaryService } from './discharge-summary.service';
import { CreateDischargeSummaryDto } from './dto/discharge-summary.dto';

@Controller('discharge-summary')
export class DischargeSummaryController {
  constructor(private readonly dischargeSummaryService: DischargeSummaryService) {}

  @Get('admission/:admissionId')
  getOrCreateDraft(
    @Param('admissionId', ParseIntPipe) admissionId: number,
    @Req() req: any
  ) {
    return this.dischargeSummaryService.getOrCreateDraft(admissionId, req.user.hospitalId);
  }

  @Post()
  saveSummary(
    @Body() dto: CreateDischargeSummaryDto,
    @Req() req: any
  ) {
    if (dto.hospitalId !== req.user.hospitalId) {
        throw new Error('Hospital ID mismatch');
    }
    return this.dischargeSummaryService.saveSummary(req.user.id, dto);
  }

  @Post(':id/sign')
  signOff(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any
  ) {
    return this.dischargeSummaryService.signOff(id, req.user.hospitalId);
  }
}
