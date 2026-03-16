import { Controller, Post, Body, Param, Get, Patch, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { RequestTransferDto, AllocateBedDto, HandoverNoteDto } from './dto/transfer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('transfers')
@UseGuards(JwtAuthGuard)
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post('request')
  async requestTransfer(@Req() req: any, @Body() dto: RequestTransferDto) {
    const hospitalId = req.user.hospitalId || 1; // Adjust based on your Auth pattern
    const userId = req.user.sub;
    return this.transfersService.requestTransfer(hospitalId, userId, dto);
  }

  @Get('pending')
  async getPendingTransfers(@Req() req: any) {
    const hospitalId = req.user.hospitalId || 1;
    return this.transfersService.getPendingTransfers(hospitalId);
  }

  @Patch(':id/allocate')
  async allocateBed(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AllocateBedDto
  ) {
    const hospitalId = req.user.hospitalId || 1;
    const userId = req.user.sub;
    return this.transfersService.allocateBed(hospitalId, id, userId, dto);
  }

  @Post(':id/handover')
  async saveHandover(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HandoverNoteDto
  ) {
    const hospitalId = req.user.hospitalId || 1;
    const userId = req.user.sub;
    return this.transfersService.saveHandoverNote(hospitalId, id, userId, dto);
  }

  @Patch(':id/arrive')
  async confirmArrival(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number
  ) {
    const hospitalId = req.user.hospitalId || 1;
    const userId = req.user.sub;
    return this.transfersService.confirmArrival(hospitalId, id, userId);
  }
}
