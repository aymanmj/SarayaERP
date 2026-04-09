import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DischargeSummaryService } from './discharge-summary.service';
import { CreateDischargeSummaryDto } from './dto/discharge-summary.dto';

@Controller('discharge-summary')
@UseGuards(JwtAuthGuard)
export class DischargeSummaryController {
  constructor(private readonly dischargeSummaryService: DischargeSummaryService) {}

  @Get('admission/:admissionId')
  getOrCreateDraft(
    @Param('admissionId', ParseIntPipe) admissionId: number,
    @CurrentUser() user: any
  ) {
    return this.dischargeSummaryService.getOrCreateDraft(admissionId, user.hospitalId);
  }

  @Post()
  saveSummary(
    @Body() dto: CreateDischargeSummaryDto,
    @CurrentUser() user: any
  ) {
    if (dto.hospitalId !== user.hospitalId) {
        throw new Error('Hospital ID mismatch');
    }
    return this.dischargeSummaryService.saveSummary(user.sub, dto);
  }

  @Post(':id/sign')
  signOff(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    return this.dischargeSummaryService.signOff(id, user.hospitalId);
  }
}
