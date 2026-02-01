// src/integration/integration.controller.ts

import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Delete,
  Patch,
  UseGuards,
  Req,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IntegrationDirection, IntegrationProtocol } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'IT_ADMIN') // صلاحية للأدمن أو مسؤول الـ IT
@Controller('integration')
export class IntegrationController {
  constructor(private prisma: PrismaService) {}

  // 1. إدارة الأجهزة (Devices)
  @Get('devices')
  async listDevices(@Req() req: any) {
    return this.prisma.medicalDevice.findMany({
      where: { hospitalId: req.user.hospitalId },
      include: {
        _count: { select: { mappings: true } }, // عدد التحاليل المربوطة
      },
    });
  }

  @Post('devices')
  async createDevice(@Req() req: any, @Body() body: any) {
    return this.prisma.medicalDevice.create({
      data: {
        hospitalId: req.user.hospitalId,
        name: body.name,
        type: body.type, // LAB or RADIOLOGY
        protocol: body.protocol || IntegrationProtocol.HL7_V2,
        ipAddress: body.ipAddress,
        port: Number(body.port),
        isActive: true,
      },
    });
  }

  @Patch('devices/:id')
  async updateDevice(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.prisma.medicalDevice.update({
      where: { id },
      data: {
        name: body.name,
        ipAddress: body.ipAddress,
        port: Number(body.port),
        isActive: body.isActive,
      },
    });
  }

  @Delete('devices/:id')
  async deleteDevice(@Param('id', ParseIntPipe) id: number) {
    // حذف المابينج والسجلات أولاً إذا أردت، أو الاعتماد على Cascade في الداتابيس
    return this.prisma.medicalDevice.delete({ where: { id } });
  }

  // 2. إدارة الـ Mapping (ربط الأكواد)
  @Get('devices/:id/mappings')
  async getMappings(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.testMapping.findMany({
      where: { deviceId: id },
      include: {
        labTest: true,
      },
    });
  }

  @Post('devices/:id/mappings')
  async createMapping(
    @Param('id', ParseIntPipe) deviceId: number,
    @Body() body: any,
  ) {
    // body: { labTestId: 1, deviceCode: 'GLU' }
    return this.prisma.testMapping.create({
      data: {
        deviceId,
        labTestId: Number(body.labTestId),
        deviceTestCode: body.deviceCode,
      },
    });
  }

  //   @Delete('mappings/:id')
  //   async deleteMapping(@Param('id', ParseIntPipe) id: number) {
  //     return this.prisma.testMapping.delete({ where: { id } });
  //   }

  @Delete('mappings/:id')
  async deleteMapping(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.testMapping.delete({
      where: { id }, // تأكد أن الجدول هو TestMapping
    });
  }

  // 3. سجلات التكامل (Logs) - للمراقبة
  @Get('logs')
  async getLogs(
    @Req() req: any,
    @Query('deviceId') deviceId?: string,
    @Query('status') status?: string,
  ) {
    const where: any = {};
    if (deviceId) where.deviceId = Number(deviceId);
    if (status) where.status = status;

    // التأكد أن الجهاز يتبع المستشفى
    where.device = { hospitalId: req.user.hospitalId };

    return this.prisma.integrationLog.findMany({
      where,
      include: { device: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100, // آخر 100 سجل
    });
  }
}
