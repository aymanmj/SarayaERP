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

  // MPI Network Dashboard: Organization hierarchy + branches + stats
  @Get('organization/network')
  async getOrganizationNetwork(@CurrentUser() user: JwtPayload) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: user.hospitalId },
      include: {
        organization: {
          include: {
            children: { select: { id: true, name: true, type: true } },
            hospitals: {
              select: {
                id: true,
                code: true,
                name: true,
                displayName: true,
                city: true,
                isActive: true,
                _count: { select: { patients: true } },
              },
            },
          },
        },
      },
    });

    if (!hospital) throw new NotFoundException('المؤسسة غير موجودة.');

    // MPI Stats
    const [globalPatientCount, localPatientCount, linkedPatientCount] = await Promise.all([
      this.prisma.globalPatient.count({ where: { isDeleted: false } }),
      this.prisma.patient.count({ where: { hospitalId: user.hospitalId, isDeleted: false } }),
      this.prisma.patient.count({ where: { hospitalId: user.hospitalId, isDeleted: false, globalPatientId: { not: null } } }),
    ]);

    return {
      currentHospital: {
        id: hospital.id,
        code: hospital.code,
        name: hospital.displayName || hospital.name,
      },
      organization: hospital.organization
        ? {
            id: hospital.organization.id,
            code: hospital.organization.code,
            name: hospital.organization.name,
            type: hospital.organization.type,
            country: hospital.organization.country,
            currency: hospital.organization.currency,
          }
        : null,
      branches: hospital.organization?.hospitals.map((h) => ({
        id: h.id,
        code: h.code,
        name: h.displayName || h.name,
        city: h.city,
        isActive: h.isActive,
        patientCount: h._count.patients,
        isCurrent: h.id === user.hospitalId,
      })) || [],
      mpiStats: {
        globalPatientCount,
        localPatientCount,
        linkedPatientCount,
        linkPercentage: localPatientCount > 0
          ? Math.round((linkedPatientCount / localPatientCount) * 100)
          : 0,
      },
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
