import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Patch,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { TransfersService } from './transfers.service';
import {
  RequestTransferDto,
  AllocateBedDto,
  HandoverNoteDto,
} from './dto/transfer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';

@Controller('transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Permissions('transfers:manage')
  @Post('request')
  async requestTransfer(@Req() req: any, @Body() dto: RequestTransferDto) {
    const hospitalId = req.user.hospitalId || 1; // Adjust based on your Auth pattern
    const userId = req.user.sub;
    return this.transfersService.requestTransfer(hospitalId, userId, dto);
  }

  @Permissions('transfers:view')
  @Get('pending')
  async getPendingTransfers(@Req() req: any) {
    const hospitalId = req.user.hospitalId || 1;
    return this.transfersService.getPendingTransfers(hospitalId);
  }

  @Permissions('transfers:manage')
  @Patch(':id/allocate')
  async allocateBed(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AllocateBedDto,
  ) {
    const hospitalId = req.user.hospitalId || 1;
    const userId = req.user.sub;
    return this.transfersService.allocateBed(hospitalId, id, userId, dto);
  }

  @Permissions('transfers:manage')
  @Post(':id/handover')
  async saveHandover(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HandoverNoteDto,
  ) {
    const hospitalId = req.user.hospitalId || 1;
    const userId = req.user.sub;
    return this.transfersService.saveHandoverNote(hospitalId, id, userId, dto);
  }

  @Permissions('transfers:manage')
  @Patch(':id/arrive')
  async confirmArrival(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const hospitalId = req.user.hospitalId || 1;
    const userId = req.user.sub;
    return this.transfersService.confirmArrival(hospitalId, id, userId);
  }
}
