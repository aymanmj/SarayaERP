// src/appointments/appointments.controller.ts

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AppointmentStatus, AppointmentType } from '@prisma/client';
import { PdfService } from '../pdf/pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Response } from 'express';

// ============================================
// DTOs
// ============================================

class CreateAppointmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  patientId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  doctorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsDateString()
  scheduledStart: string;

  @IsDateString()
  scheduledEnd: string;

  @IsOptional()
  @IsEnum(AppointmentType)
  type?: AppointmentType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isEmergency?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isSpecial?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  queueNumber?: number;
}

class ListAppointmentsQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  doctorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isEmergency?: boolean;
}

class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus)
  status: AppointmentStatus;
}

class UpsertDoctorScheduleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxEmergency?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  allowOverbook?: boolean;

  @IsOptional()
  @IsString()
  reservedNumbers?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  slotDuration?: number;

  @IsOptional()
  @IsString()
  workDays?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  consultationPrice?: number;
}

// ============================================
// Controller
// ============================================

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly pdfService: PdfService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR')
  async create(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const start = new Date(dto.scheduledStart);
    const end = new Date(dto.scheduledEnd);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('تاريخ/وقت غير صالح');
    }

    return this.appointmentsService.createAppointment({
      hospitalId: user.hospitalId,
      patientId: dto.patientId,
      doctorId: dto.doctorId,
      departmentId: dto.departmentId,
      scheduledStart: start,
      scheduledEnd: end,
      reason: dto.reason,
      notes: dto.notes,
      createdByUserId: user.sub,
      type: dto.type,
      isEmergency: dto.isEmergency,
      isSpecial: dto.isSpecial,
      queueNumber: dto.queueNumber,
    });
  }

  @Get()
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR', 'CASHIER')
  async list(
    @Query() query: ListAppointmentsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const date = query.date ? new Date(query.date) : new Date();

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('تنسيق التاريخ غير صحيح');
    }

    let targetDoctorId = query.doctorId;
    const isAdminOrReception =
      user.roles.includes('ADMIN') || user.roles.includes('RECEPTION');
    const isDoctor = user.roles.includes('DOCTOR');

    if (isDoctor && !isAdminOrReception) {
      targetDoctorId = user.sub;
    }

    return this.appointmentsService.listAppointmentsForDay(
      user.hospitalId,
      date,
      {
        doctorId: targetDoctorId,
        departmentId: query.departmentId,
        status: query.status,
        isEmergency: query.isEmergency,
      },
    );
  }

  @Get('queue-status/:doctorId')
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR')
  async getQueueStatus(
    @Param('doctorId') doctorId: string,
    @Query('date') dateStr: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const docId = Number(doctorId);
    if (!docId || Number.isNaN(docId)) {
      throw new BadRequestException('رقم الطبيب غير صحيح');
    }

    const date = dateStr ? new Date(dateStr) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('تنسيق التاريخ غير صحيح');
    }

    return this.appointmentsService.getQueueStatus(user.hospitalId, docId, date);
  }

  @Get(':id')
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR')
  async getOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const apptId = Number(id);
    if (!apptId || Number.isNaN(apptId)) {
      throw new BadRequestException('رقم الموعد غير صحيح');
    }

    return this.appointmentsService.getOne(user.hospitalId, apptId);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const apptId = Number(id);
    if (!apptId) throw new BadRequestException('رقم الموعد غير صحيح');

    const isDoctor = user.roles.includes('DOCTOR');
    const isAdmin = user.roles.includes('ADMIN');

    if (isDoctor && !isAdmin) {
      const appt = await this.appointmentsService.getOne(
        user.hospitalId,
        apptId,
      );
      if (appt.doctorId && appt.doctorId !== user.sub) {
        throw new BadRequestException(
          'لا يمكنك تعديل حالة موعد يخص طبيباً آخر.',
        );
      }
    }

    return this.appointmentsService.updateStatus(
      user.hospitalId,
      apptId,
      dto.status,
    );
  }

  @Get('schedules/list')
  @Roles('ADMIN', 'RECEPTION')
  async listDoctorSchedules(@CurrentUser() user: JwtPayload) {
    return this.appointmentsService.listDoctorSchedules(user.hospitalId);
  }

  @Get('schedules/:doctorId')
  @Roles('ADMIN', 'RECEPTION', 'DOCTOR')
  async getDoctorSchedule(
    @Param('doctorId') doctorId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const docId = Number(doctorId);
    if (!docId || Number.isNaN(docId)) {
      throw new BadRequestException('رقم الطبيب غير صحيح');
    }

    return this.appointmentsService.getDoctorSchedule(user.hospitalId, docId);
  }

  @Put('schedules/:doctorId')
  @Roles('ADMIN')
  async upsertDoctorSchedule(
    @Param('doctorId') doctorId: string,
    @Body() dto: UpsertDoctorScheduleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const docId = Number(doctorId);
    if (!docId || Number.isNaN(docId)) {
      throw new BadRequestException('رقم الطبيب غير صحيح');
    }

    return this.appointmentsService.upsertDoctorSchedule(
      user.hospitalId,
      docId,
      dto,
    );
  }

  @Get(':id/print')
  @Roles('ADMIN', 'RECEPTION')
  async downloadReceipt(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const apptId = Number(id);
    if (!apptId) throw new BadRequestException('رقم الموعد غير صحيح');

    const data = await this.appointmentsService.getBookingReceiptData(
      user.hospitalId,
      apptId,
    );

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: user.hospitalId },
    });

    const finalData = {
      ...data,
      hospitalName: hospital?.displayName || hospital?.name || 'Saraya Hospital',
      address: [hospital?.addressLine1, hospital?.addressLine2, hospital?.city].filter(Boolean).join(' - '),
      printHeaderFooter: hospital?.printHeaderFooter ?? true, // ✅
    };

    const buffer = await this.pdfService.generatePdf('booking-receipt', finalData);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=booking-${apptId}.pdf`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }
}
