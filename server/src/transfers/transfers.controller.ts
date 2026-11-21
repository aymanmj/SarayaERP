import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Patch,
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
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';

@Controller('transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Permissions('transfers:manage')
  @Post('request')
  async requestTransfer(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RequestTransferDto,
  ) {
    const hospitalId = user.hospitalId; // Adjust based on your Auth pattern
    const userId = user.sub;
    return this.transfersService.requestTransfer(hospitalId, userId, dto);
  }

  @Permissions('transfers:view')
  @Get('pending')
  async getPendingTransfers(@CurrentUser() user: JwtPayload) {
    const hospitalId = user.hospitalId;
    return this.transfersService.getPendingTransfers(hospitalId);
  }

  @Permissions('transfers:manage')
  @Patch(':id/allocate')
  async allocateBed(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AllocateBedDto,
  ) {
    const hospitalId = user.hospitalId;
    const userId = user.sub;
    return this.transfersService.allocateBed(hospitalId, id, userId, dto);
  }

  @Permissions('transfers:manage')
  @Post(':id/handover')
  async saveHandover(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HandoverNoteDto,
  ) {
    const hospitalId = user.hospitalId;
    const userId = user.sub;
    return this.transfersService.saveHandoverNote(hospitalId, id, userId, dto);
  }

  @Permissions('transfers:manage')
  @Patch(':id/arrive')
  async confirmArrival(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const hospitalId = user.hospitalId;
    const userId = user.sub;
    return this.transfersService.confirmArrival(hospitalId, id, userId);
  }

  @Permissions('transfers:manage')
  @Patch(':id/cancel')
  cancelTransfer(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.transfersService.cancelTransfer(user.hospitalId, id);
  }
}
