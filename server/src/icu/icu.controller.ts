import { Controller, Post, Body, Param, Get, Query, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { IcuService } from './icu.service';
import { RecordVitalsDto } from './dto/icu.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; 

@Controller('icu')
@UseGuards(JwtAuthGuard)
export class IcuController {
  constructor(private readonly icuService: IcuService) {}

  @Post('flowsheet')
  async recordEntry(@Req() req: any, @Body() dto: RecordVitalsDto) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.recordFlowsheetEntry(hospitalId, userId, dto);
  }

  @Get('flowsheet/:encounterId')
  async getFlowsheet(
    @Req() req: any, 
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Query('date') date: string
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getFlowsheet(hospitalId, encounterId, date || new Date().toISOString());
  }

  @Get('io-balance/:encounterId')
  async getIOBalance(
    @Req() req: any,
    @Param('encounterId', ParseIntPipe) encounterId: number,
    @Query('date') date: string
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    return this.icuService.getCumulativeIO(hospitalId, encounterId, date || new Date().toISOString());
  }

  @Post('nicu/separate/:motherId')
  async separateNewborn(
    @Req() req: any,
    @Param('motherId', ParseIntPipe) motherId: number,
    @Body() details: any
  ) {
    const hospitalId = req.user?.hospitalId || 1;
    const userId = req.user?.sub;
    return this.icuService.separateNewbornPatient(hospitalId, userId, motherId, details);
  }
}
