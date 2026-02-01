
import {
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { PatientAuthGuard } from './auth/patient-auth.guard';
import { CurrentPatient } from './auth/current-patient.decorator';
import * as bcrypt from 'bcrypt';

@Controller('patient-portal')
export class PatientPortalController {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  @Post('login')
  async login(@Body() body: { mrn: string; phone: string }) {
    // 1. Verify Patient
    // ملاحظة: للتسهيل سنستخدم رقم الهاتف ككلمة مرور مؤقتة في هذه المرحلة
    // لاحقاً يجب استخدام webPassword مع Hashing
    const patient = await this.prisma.patient.findFirst({
      where: {
        mrn: body.mrn,
        phone: body.phone, // Simple auth for POC
      },
    });

    if (!patient) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Generate Token
    const payload = { sub: patient.id, mrn: patient.mrn, role: 'PATIENT' };
    return {
      access_token: await this.jwtService.signAsync(payload),
      patient: {
        fullName: patient.fullName,
        mrn: patient.mrn,
      },
    };
  }

  @Get('appointments')
  @UseGuards(PatientAuthGuard)
  async getAppointments(@CurrentPatient() patient: any) {
    return this.prisma.appointment.findMany({
      where: { patientId: patient.sub },
      orderBy: { scheduledStart: 'desc' }, // ✅ Fixed: date -> scheduledStart
      include: {
        doctor: { select: { fullName: true } },
        department: { select: { name: true } },
      },
    });
  }

  @Get('results')
  @UseGuards(PatientAuthGuard)
  async getResults(@CurrentPatient() patient: any) {
    // Fetch Lab Results
    const labOrders = await this.prisma.labOrder.findMany({
      where: {
        order: {
          encounter: {
            patientId: patient.sub,
          },
        },
        resultStatus: 'COMPLETED', // ✅ Fixed: status -> resultStatus
      },
      include: {
        results: true,
        test: true,
      },
      take: 10,
      orderBy: {
        order: {
          createdAt: 'desc', // ✅ Fixed: createdAt from Order relation
        },
      },
    });

    return {
      lab: labOrders,
      radiology: [], // To be implemented
    };
  }
}
