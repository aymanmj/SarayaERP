/**
 * Patient Portal — Messaging Controller
 * 
 * Secure messaging between patients and their doctors.
 * All endpoints enforce patient-scoped data isolation.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatientAuthGuard } from '../auth/patient-auth.guard';
import { CurrentPatient } from '../auth/current-patient.decorator';
import { PortalMessagingService } from '../messaging/portal-messaging.service';
import { SendMessageDto } from '../dto/portal.dto';

@ApiTags('Patient Portal — Messages')
@ApiBearerAuth()
@UseGuards(PatientAuthGuard)
@Controller('patient-portal/v1/messages')
export class PortalMessagingController {
  constructor(private readonly messagingService: PortalMessagingService) {}

  @Post()
  @ApiOperation({ summary: 'إرسال رسالة للطبيب' })
  async sendMessage(
    @CurrentPatient() patient: any,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(patient.sub, patient.hospitalId, dto);
  }

  @Get('threads')
  @ApiOperation({ summary: 'قائمة المحادثات' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getThreads(
    @CurrentPatient() patient: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.messagingService.getThreads(patient.sub, Number(page) || 1, Number(limit) || 20);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'عدد الرسائل غير المقروءة' })
  async getUnreadCount(@CurrentPatient() patient: any) {
    return this.messagingService.getUnreadCount(patient.sub);
  }

  @Get(':threadId')
  @ApiOperation({ summary: 'رسائل محادثة محددة' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getThreadMessages(
    @CurrentPatient() patient: any,
    @Param('threadId') threadId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.messagingService.getThreadMessages(
      patient.sub,
      threadId,
      Number(page) || 1,
      Number(limit) || 50,
    );
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'تعليم رسالة كمقروءة' })
  async markAsRead(
    @CurrentPatient() patient: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.messagingService.markAsRead(patient.sub, id);
  }
}
