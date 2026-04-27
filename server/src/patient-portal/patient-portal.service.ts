/**
 * Patient Portal — Core Service Layer
 * 
 * Enterprise business logic for all patient-facing operations.
 * Every method enforces patient-scoped data isolation.
 * 
 * Architecture:
 * Controller → Service → PrismaService
 *              ↕ 
 *         PatientOtpService (Auth)
 *         FhirService (FHIR Export)
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PatientOtpService } from './auth/patient-otp.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { PatientJwtPayload } from './interfaces/patient-context.interface';
import { VaultService } from '../common/vault/vault.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class PatientPortalService {
  private readonly logger = new Logger(PatientPortalService.name);

  // Token Configuration
  private readonly ACCESS_TOKEN_TTL = '15m';
  private readonly REFRESH_TOKEN_DAYS = 30;
  // Portal Policy: minimum hours before appointment to allow cancellation
  private readonly MIN_CANCEL_HOURS = 2;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private otpService: PatientOtpService,
    private appointmentsService: AppointmentsService,
    private vaultService: VaultService,
  ) {}

  // ===========================================
  //  AUTH: OTP + Token Management
  // ===========================================

  async requestOtp(mrn: string, phone: string) {
    return this.otpService.requestOtp(mrn, phone);
  }

  async verifyOtpAndLogin(mrn: string, code: string) {
    const patient = await this.otpService.verifyOtp(mrn, code);

    const accessToken = await this.generateAccessToken(patient);
    const refreshToken = await this.generateRefreshToken(patient.id);

    return {
      accessToken,
      refreshToken,
      patient: {
        id: patient.id,
        fullName: patient.fullName,
        mrn: patient.mrn,
      },
    };
  }

  async refreshTokens(incomingRt: string) {
    if (!incomingRt) throw new ForbiddenException('Refresh token مطلوب');

    const [idStr, token] = incomingRt.split('.');
    const id = Number(idStr);
    if (isNaN(id) || !token) throw new ForbiddenException('صيغة غير صحيحة');

    const rtRecord = await this.prisma.patientRefreshToken.findUnique({
      where: { id },
      include: {
        patient: {
          select: { id: true, fullName: true, mrn: true, hospitalId: true, isActive: true },
        },
      },
    });

    if (!rtRecord) throw new ForbiddenException('Token غير موجود');

    // Reuse detection
    if (rtRecord.revoked) {
      // Potential theft — revoke ALL patient tokens
      await this.prisma.patientRefreshToken.updateMany({
        where: { patientId: rtRecord.patientId },
        data: { revoked: true },
      });
      this.logger.warn(`🚨 Refresh token reuse detected for Patient/${rtRecord.patientId}`);
      throw new ForbiddenException('تم اكتشاف إعادة استخدام — تم تسجيل الخروج من جميع الأجهزة');
    }

    // Verify hash
    const isMatch = await bcrypt.compare(token, rtRecord.hashedToken);
    if (!isMatch) throw new ForbiddenException('Token غير صالح');

    // Check expiry
    if (new Date() > rtRecord.expiresAt) {
      await this.prisma.patientRefreshToken.update({
        where: { id },
        data: { revoked: true },
      });
      throw new ForbiddenException('Token منتهي الصلاحية');
    }

    // Check patient is still active
    if (!rtRecord.patient.isActive) {
      throw new ForbiddenException('الحساب معطّل');
    }

    // Rotate: revoke old, generate new
    await this.prisma.patientRefreshToken.update({
      where: { id },
      data: { revoked: true, replacedByToken: 'ROTATED' },
    });

    const patient = rtRecord.patient;
    const newAccessToken = await this.generateAccessToken(patient);
    const newRefreshToken = await this.generateRefreshToken(patient.id);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(patientId: number, refreshToken?: string) {
    if (refreshToken) {
      const [idStr] = refreshToken.split('.');
      const id = Number(idStr);
      if (!isNaN(id)) {
        await this.prisma.patientRefreshToken.updateMany({
          where: { id, patientId },
          data: { revoked: true },
        });
      }
    } else {
      // Revoke all sessions
      await this.prisma.patientRefreshToken.updateMany({
        where: { patientId },
        data: { revoked: true },
      });
    }
    return { message: 'تم تسجيل الخروج بنجاح' };
  }

  // ===========================================
  //  PROFILE
  // ===========================================

  /**
   * Get patient profile.
   * @param patientId from JWT sub
   * @param hospitalId from JWT hospitalId — validates multi-tenant ownership
   */
  async getProfile(patientId: number, hospitalId?: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        mrn: true,
        fullName: true,
        dateOfBirth: true,
        gender: true,
        phone: true,
        email: true,
        address: true,
        hospitalId: true,
        isActive: true,
        createdAt: true,
        telegramChatId: true,
        hospital: { select: { id: true, name: true } },
        insurancePolicy: {
          select: {
            id: true,
            provider: { select: { id: true, name: true } },
            plan: { select: { id: true, name: true } },
          },
        },
        allergies: {
          select: { id: true, allergen: true, severity: true, reaction: true },
        },
      },
    });

    if (!patient) throw new NotFoundException('المريض غير موجود');

    // Multi-tenant verification: JWT hospitalId must match patient record
    if (hospitalId && patient.hospitalId !== hospitalId) {
      this.logger.warn(`🚫 Cross-hospital access attempt: JWT hospital=${hospitalId}, patient hospital=${patient.hospitalId}`);
      throw new NotFoundException('المريض غير موجود');
    }

    const { telegramChatId, ...patientData } = patient;

    return {
      ...patientData,
      hasTelegramLinked: !!telegramChatId,
    };
  }

  // ===========================================
  //  MEDICAL RECORDS
  // ===========================================

  async getVitals(patientId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where = { encounter: { patientId } };
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.vitalSign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          encounter: { select: { id: true, type: true, createdAt: true } },
        },
      }),
      this.prisma.vitalSign.count({ where }),
    ]);

    return {
      items,
      meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    };
  }

  async getVitalById(patientId: number, vitalId: number) {
    const vital = await this.prisma.vitalSign.findUnique({
      where: { id: vitalId },
      include: {
        encounter: { select: { id: true, patientId: true, type: true } },
      },
    });

    if (!vital || vital.encounter?.patientId !== patientId) {
      throw new NotFoundException('السجل غير موجود');
    }
    return vital;
  }

  async getLabResults(patientId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where: any = {
      order: { encounter: { patientId } },
      resultStatus: 'COMPLETED',
    };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.labOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        include: {
          test: { select: { id: true, name: true, code: true } },
          results: true,
          order: {
            select: {
              encounter: { select: { id: true, createdAt: true } },
            },
          },
        },
      }),
      this.prisma.labOrder.count({ where }),
    ]);

    return {
      items,
      meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    };
  }

  async getLabResultById(patientId: number, labOrderId: number) {
    const labOrder = await this.prisma.labOrder.findUnique({
      where: { id: labOrderId },
      include: {
        test: true,
        results: true,
        order: {
          select: {
            encounter: { select: { id: true, patientId: true } },
          },
        },
      },
    });

    if (!labOrder || labOrder.order?.encounter?.patientId !== patientId) {
      throw new NotFoundException('النتيجة غير موجودة');
    }
    return labOrder;
  }

  async getMedications(patientId: number) {
    return this.prisma.prescription.findMany({
      where: {
        patientId,
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, genericName: true, strength: true, form: true },
            },
          },
        },
        doctor: { select: { id: true, fullName: true } },
      },
    });
  }

  async getAllergies(patientId: number) {
    return this.prisma.patientAllergy.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDiagnoses(patientId: number) {
    return this.prisma.patientProblem.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getEncounters(patientId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = {
      patientId,
      status: { not: 'CANCELLED' as const }, // Hide cancelled encounters from patient view
    };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.encounter.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          doctor: { select: { id: true, fullName: true } },
          department: { select: { id: true, name: true } },
        },
      }),
      this.prisma.encounter.count({ where }),
    ]);

    return {
      items,
      meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    };
  }

  async getEncounterById(patientId: number, encounterId: number) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        doctor: { select: { id: true, fullName: true } },
        department: { select: { id: true, name: true } },
        vitalSigns: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!encounter || encounter.patientId !== patientId) {
      throw new NotFoundException('الزيارة غير موجودة');
    }
    return encounter;
  }

  // ===========================================
  //  APPOINTMENTS
  // ===========================================

  async getAppointments(patientId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { patientId };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledStart: 'desc' },
        include: {
          doctor: { select: { id: true, fullName: true } },
          department: { select: { id: true, name: true } },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      items,
      meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    };
  }

  async getAppointmentById(patientId: number, appointmentId: number) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: { select: { id: true, fullName: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (!appointment || appointment.patientId !== patientId) {
      throw new NotFoundException('الموعد غير موجود');
    }
    return appointment;
  }

  /**
   * Book appointment — DELEGATES to AppointmentsService.
   * 
   * Inherits ALL business rules:
   * - Doctor work days validation
   * - Daily appointment limits
   * - Queue number allocation
   * - Overbook policy
   * - Auto encounter + invoice creation
   */
  async bookAppointment(patientId: number, hospitalId: number, dto: {
    doctorId: number;
    departmentId?: number;
    scheduledStart: string;
    reason?: string;
  }) {
    const scheduledStart = new Date(dto.scheduledStart);

    // Portal policy: must be at least 1 hour in the future
    const minBookTime = new Date(Date.now() + 60 * 60 * 1000);
    if (scheduledStart <= minBookTime) {
      throw new BadRequestException('يجب حجز الموعد قبل ساعة على الأقل من الوقت المطلوب');
    }

    // Calculate default slot duration (30 minutes)
    const scheduledEnd = new Date(scheduledStart.getTime() + 30 * 60 * 1000);

    // Delegate to AppointmentsService — inherits work days, limits, queue, billing
    const result = await this.appointmentsService.createAppointment({
      hospitalId,
      patientId,
      doctorId: dto.doctorId,
      departmentId: dto.departmentId,
      scheduledStart,
      scheduledEnd,
      reason: dto.reason,
      notes: 'حجز من بوابة المريض',
      createdByUserId: 0, // System/Portal booking
    });

    this.logger.log(`📅 Appointment booked via Portal: Patient/${patientId} → Doctor/${dto.doctorId}`);
    return result;
  }

  /**
   * Cancel appointment — with portal cancellation policy.
   * 
   * Policy:
   * - Can only cancel own appointments
   * - Cannot cancel already cancelled or completed appointments
   * - Must cancel at least 2 hours before the appointment
   * - Cannot cancel if the patient has checked in
   * 
   * Billing cleanup (encounter + invoices) is delegated to AppointmentsService.
   */
  async cancelAppointment(patientId: number, appointmentId: number) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment || appointment.patientId !== patientId) {
      throw new NotFoundException('الموعد غير موجود');
    }

    if (appointment.status === 'CANCELLED') {
      throw new BadRequestException('الموعد ملغى بالفعل');
    }

    if (appointment.status === 'COMPLETED') {
      throw new BadRequestException('لا يمكن إلغاء موعد مكتمل');
    }

    if (appointment.status === 'CHECKED_IN' || appointment.status === 'CALLED') {
      throw new BadRequestException('لا يمكن إلغاء الموعد بعد تسجيل الحضور');
    }

    // Cancellation time policy
    const hoursUntilAppointment =
      (appointment.scheduledStart.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilAppointment < this.MIN_CANCEL_HOURS) {
      throw new BadRequestException(
        `لا يمكن إلغاء الموعد قبل أقل من ${this.MIN_CANCEL_HOURS} ساعة. يرجى التواصل مع الاستقبال.`
      );
    }

    const result = await this.appointmentsService.cancelPatientAppointmentWithBillingCleanup(
      patientId,
      appointmentId,
    );

    this.logger.log(
      `Portal cancellation: Appointment/${appointmentId} patient=${patientId}`,
    );

    return result;
  }

  // ===========================================
  //  DASHBOARD (Phase 4: single-call summary)
  // ===========================================

  /**
   * Patient Dashboard — single endpoint for all summary data.
   * Reduces mobile app round-trips from 5+ calls to 1.
   * @param hospitalId — optional multi-tenant verification
   */
  async getDashboard(patientId: number, hospitalId?: number) {
    const now = new Date();

    const [
      profile,
      nextAppointment,
      recentLabResults,
      outstandingBalance,
      activeAllergies,
      activeMedications,
      unreadMessages,
      pendingRefills,
    ] = await Promise.all([
      // Profile
      this.prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true, mrn: true, fullName: true, dateOfBirth: true, gender: true, hospitalId: true,
          insurancePolicy: {
            select: {
              provider: { select: { name: true } },
              plan: { select: { name: true } },
            },
          },
        },
      }),

      // Next upcoming appointment
      this.prisma.appointment.findFirst({
        where: {
          patientId,
          scheduledStart: { gte: now },
          status: { in: ['REQUESTED', 'CONFIRMED'] },
        },
        orderBy: { scheduledStart: 'asc' },
        include: {
          doctor: { select: { id: true, fullName: true } },
          department: { select: { id: true, name: true } },
        },
      }),

      // Last 3 lab results
      this.prisma.labOrder.findMany({
        where: {
          order: { encounter: { patientId } },
          resultStatus: 'COMPLETED',
        },
        take: 3,
        orderBy: { id: 'desc' },
        include: {
          test: { select: { name: true } },
        },
      }),

      // Outstanding balance
      this.prisma.invoice.findMany({
        where: {
          patientId,
          status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        },
        select: { totalAmount: true, paidAmount: true },
      }),

      // Active allergies
      this.prisma.patientAllergy.findMany({
        where: { patientId },
        select: { allergen: true, severity: true },
      }),

      // Active medications (last 5)
      this.prisma.prescription.findMany({
        where: {
          patientId,
          status: { not: 'CANCELLED' },
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              product: { select: { name: true, genericName: true } },
            },
          },
        },
      }),

      // Unread messages count
      this.prisma.patientMessage.count({
        where: {
          patientId,
          direction: 'DOCTOR_TO_PATIENT',
          isRead: false,
        },
      }),

      // Pending refill requests count
      this.prisma.medicationRefillRequest.count({
        where: {
          patientId,
          status: 'PENDING',
        },
      }),
    ]);

    // Calculate balance
    const totalOutstanding = outstandingBalance.reduce(
      (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)),
      0,
    );

    // Multi-tenant verification
    if (hospitalId && profile && profile.hospitalId !== hospitalId) {
      this.logger.warn(`🚫 Dashboard cross-hospital attempt: JWT=${hospitalId}, patient=${profile.hospitalId}`);
      throw new NotFoundException('المريض غير موجود');
    }

    return {
      profile,
      nextAppointment,
      recentLabResults,
      financial: {
        outstandingBalance: totalOutstanding,
        currency: 'LYD',
        unpaidInvoices: outstandingBalance.length,
      },
      allergies: activeAllergies,
      activeMedications: activeMedications.length,
      messaging: {
        unreadCount: unreadMessages,
      },
      refills: {
        pendingCount: pendingRefills,
      },
      insurance: profile?.insurancePolicy
        ? {
            provider: profile.insurancePolicy.provider?.name,
            plan: profile.insurancePolicy.plan?.name,
          }
        : null,
    };
  }

  // ===========================================
  //  FINANCIAL
  // ===========================================

  async getInvoices(patientId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { patientId };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          currency: true,
          createdAt: true,
          encounter: { select: { id: true, type: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items,
      meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    };
  }

  async getInvoiceById(patientId: number, invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        payments: true,
        charges: {
          include: {
            serviceItem: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!invoice || invoice.patientId !== patientId) {
      throw new NotFoundException('الفاتورة غير موجودة');
    }
    return invoice;
  }

  async getOutstandingBalance(patientId: number) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        patientId,
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      select: {
        id: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
      },
    });

    const totalOutstanding = invoices.reduce(
      (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)),
      0,
    );

    return {
      totalOutstanding,
      currency: 'LYD',
      invoiceCount: invoices.length,
      invoices,
    };
  }

  async getPayments(patientId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { invoice: { patientId } };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paidAt: 'desc' },
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          invoice: { select: { id: true, totalAmount: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      items,
      meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    };
  }

  async getInsuranceInfo(patientId: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        insurancePolicy: {
          include: {
            provider: { select: { id: true, name: true, phone: true, email: true } },
            plan: { select: { id: true, name: true } },
          },
        },
        insuranceMemberId: true,
      },
    });

    if (!patient) throw new NotFoundException('المريض غير موجود');

    return {
      hasInsurance: !!patient.insurancePolicy,
      memberId: patient.insuranceMemberId,
      policy: patient.insurancePolicy,
    };
  }

  // ===========================================
  //  DIRECTORY & SLOTS
  // ===========================================

  async getDepartments(hospitalId: number) {
    return this.prisma.department.findMany({
      where: {
        hospitalId,
        isActive: true,
        name: {
          notIn: ['الموارد البشرية', 'الحسابات', 'الاستقبال العام'],
        },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getDoctors(hospitalId: number, departmentId?: number) {
    const where: any = {
      hospitalId,
      userRoles: { some: { role: { name: 'DOCTOR' } } },
    };
    if (departmentId) {
      where.departmentId = departmentId;
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        specialty: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async getDoctorAvailableSlots(hospitalId: number, doctorId: number, dateStr: string) {
    // Basic mock logic for available slots since appointments service may not have a simple 'getAvailableSlots' exposed yet.
    // In a real enterprise system, this evaluates Doctor Schedules, Leaves, and existing appointments.
    const startOfDay = new Date(`${dateStr}T00:00:00Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59Z`);

    // Verify doctor exists
    const doctor = await this.prisma.user.findFirst({
      where: {
        id: doctorId,
        hospitalId,
        userRoles: { some: { role: { name: 'DOCTOR' } } },
      },
    });
    if (!doctor) throw new NotFoundException('الطبيب غير موجود');

    // Get existing appointments for the date
    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        scheduledStart: { gte: startOfDay, lte: endOfDay },
        status: { in: ['REQUESTED', 'CONFIRMED', 'CHECKED_IN'] },
      },
      select: { scheduledStart: true },
    });

    const bookedTimes = existingAppointments.map(a => a.scheduledStart.getTime());

    // Generate slots every 30 minutes from 09:00 to 17:00
    const slots: { time: string; available: boolean }[] = [];
    const baseDate = new Date(`${dateStr}T00:00:00Z`);
    
    // Convert baseDate to local offset or assume UTC (here we assume simple hours for demo)
    for (let hour = 9; hour < 17; hour++) {
      for (let min of [0, 30]) {
        const slotTime = new Date(baseDate);
        slotTime.setUTCHours(hour, min, 0, 0);
        
        // Skip past slots
        if (slotTime.getTime() <= Date.now()) continue;

        // Skip booked slots (exact match for simplicity)
        if (!bookedTimes.includes(slotTime.getTime())) {
          slots.push({
            time: slotTime.toISOString(),
            available: true,
          });
        }
      }
    }

    return slots;
  }

  // ===========================================
  //  PAYMENTS PROCESSING (SIMULATED)
  // ===========================================

  async processPayment(patientId: number, invoiceId: number, amount: number, paymentMethod: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice || invoice.patientId !== patientId) {
      throw new NotFoundException('الفاتورة غير موجودة');
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestException('الفاتورة مدفوعة بالكامل');
    }

    const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    if (amount > remaining) {
      throw new BadRequestException(`لا يمكن دفع أكثر من المبلغ المتبقي (${remaining})`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Payment Record
      const payment = await tx.payment.create({
        data: {
          hospitalId: invoice.hospitalId,
          invoiceId,
          amount,
          method: paymentMethod as any, // e.g. 'CREDIT_CARD', 'PORTAL_SIMULATED'
          reference: `PRTL-${Date.now()}`,
          paidAt: new Date(),
        },
      });

      // 2. Update Invoice
      const newPaidAmount = Number(invoice.paidAmount) + amount;
      const newStatus = newPaidAmount >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
      });

      return { success: true, payment, newStatus };
    });
  }

  // ===========================================
  //  TOKEN HELPERS (Private)
  // ===========================================

  private async generateAccessToken(patient: { id: number; mrn: string; hospitalId: number }) {
    const payload: PatientJwtPayload = {
      sub: patient.id,
      mrn: patient.mrn,
      hospitalId: patient.hospitalId,
      role: 'PATIENT',
      type: 'access',
      aud: 'patient-portal',
    };

    const kid = this.vaultService.getActiveKeyId();
    const secret = await this.vaultService.getKeyOrSecret(kid);

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn: this.ACCESS_TOKEN_TTL,
      issuer: 'saraya-patient', // Enforce Patient Token Segregation
      header: { kid, alg: 'HS256' },
    });
  }

  private async generateRefreshToken(patientId: number) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(token, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_DAYS);

    const record = await this.prisma.patientRefreshToken.create({
      data: {
        patientId,
        hashedToken: hash,
        expiresAt,
      },
    });

    return `${record.id}.${token}`;
  }
}
