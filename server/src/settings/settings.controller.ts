// src/settings/settings.controller.ts

import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private prisma: PrismaService) {}

  @Get('organization')
  async getOrganization(@CurrentUser() user: JwtPayload) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: user.hospitalId },
      select: {
        id: true,
        name: true,
        displayName: true,
        legalName: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        phone: true,
        email: true,
        website: true,
        logoUrl: true,
        printHeaderFooter: true,
      },
    });

    if (!hospital) throw new NotFoundException('المؤسسة غير موجودة.');

    return {
      id: hospital.id,
      displayName: hospital.displayName ?? hospital.name,
      legalName: hospital.legalName ?? hospital.name,
      address: [hospital.addressLine1, hospital.addressLine2, hospital.city]
        .filter(Boolean)
        .join(' - '),
      phone: hospital.phone ?? '',
      email: hospital.email ?? '',
      website: hospital.website ?? '',
      logoUrl: hospital.logoUrl ?? null,
      printHeaderFooter: hospital.printHeaderFooter,
    };
  }

  @Put('organization')
  async updateOrganization(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOrganizationSettingsDto,
  ) {
    // نفكك العنوان الكامل ونخزّنه في addressLine1 مؤقتًا
    const addressLine1 = dto.address?.trim() || null;

    const hospital = await this.prisma.hospital.update({
      where: { id: user.hospitalId },
      data: {
        displayName: dto.displayName?.trim() || null,
        legalName: dto.legalName?.trim() || null,
        addressLine1,
        // ممكن لاحقًا نجزئ العنوان لخطين/مدينة
        addressLine2: null,
        city: null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        website: dto.website?.trim() || null,
        logoUrl: dto.logoUrl?.trim() || null,
        printHeaderFooter: dto.printHeaderFooter,
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        legalName: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        phone: true,
        email: true,
        website: true,
        logoUrl: true,
        printHeaderFooter: true,
      },
    });

    return {
      id: hospital.id,
      displayName: hospital.displayName ?? hospital.name,
      legalName: hospital.legalName ?? hospital.name,
      address: [hospital.addressLine1, hospital.addressLine2, hospital.city]
        .filter(Boolean)
        .join(' - '),
      phone: hospital.phone ?? '',
      email: hospital.email ?? '',
      website: hospital.website ?? '',
      logoUrl: hospital.logoUrl ?? null,
      printHeaderFooter: hospital.printHeaderFooter,
    };
  }
}
