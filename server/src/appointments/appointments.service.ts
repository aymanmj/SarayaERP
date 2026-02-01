// src/appointments/appointments.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppointmentStatus,
  AppointmentType,
  EncounterType,
  EncounterStatus,
  ChargeSource,
} from '@prisma/client';
import { PriceListsService } from '../price-lists/price-lists.service';
import { AccountingService } from '../accounting/accounting.service';
import { randomUUID } from 'crypto';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private priceService: PriceListsService,
    private accounting: AccountingService,
  ) {}

  // ============================================
  // ✅ نظام الترقيم المتقدم (Queue Numbers)
  // ============================================

  /**
   * الحصول على رقم التسلسل التالي المتاح
   * @param hospitalId معرف المستشفى
   * @param doctorId معرف الطبيب
   * @param date تاريخ الموعد
   * @param isEmergency هل الموعد طوارئ/خاص
   * @returns رقم التسلسل المتاح
   */
  async getNextQueueNumber(
    hospitalId: number,
    doctorId: number,
    date: Date,
    isEmergency: boolean = false,
  ): Promise<number> {
    // 1. جلب إعدادات الطبيب
    const schedule = await this.prisma.doctorSchedule.findUnique({
      where: { doctorId },
    });

    // 2. استخراج الأرقام المحجوزة
    const reservedNumbersStr = schedule?.reservedNumbers || '1,3,5,7,9';
    const reservedNumbers = reservedNumbersStr
      .split(',')
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !isNaN(n));

    // 3. جلب جميع المواعيد لهذا الطبيب في هذا اليوم
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const todayAppointments = await this.prisma.appointment.findMany({
      where: {
        hospitalId,
        doctorId,
        scheduledStart: { gte: dayStart, lte: dayEnd },
        status: {
          notIn: [AppointmentStatus.CANCELLED],
        },
      },
      select: { queueNumber: true },
    });

    // 4. استخراج الأرقام المستخدمة
    const usedNumbers = todayAppointments
      .map((a) => a.queueNumber)
      .filter((n): n is number => n !== null);

    // 5. حساب الرقم التالي
    if (isEmergency) {
      // مواعيد الطوارئ: نستخدم أول رقم محجوز متاح
      for (const reservedNum of reservedNumbers) {
        if (!usedNumbers.includes(reservedNum)) {
          return reservedNum;
        }
      }
      // إذا انتهت الأرقام المحجوزة، نبدأ من أعلى رقم محجوز + عدد فردي
      const maxReserved = Math.max(...reservedNumbers);
      let next = maxReserved + 2; // التالي الفردي
      while (usedNumbers.includes(next)) {
        next += 2;
      }
      return next;
    } else {
      // مواعيد عادية: نتجنب الأرقام المحجوزة
      let candidate = 2; // نبدأ من 2 (أول رقم زوجي)
      while (
        usedNumbers.includes(candidate) ||
        reservedNumbers.includes(candidate)
      ) {
        candidate++;
      }
      return candidate;
    }
  }

  /**
   * فحص الحد اليومي للمواعيد
   */
  async checkDailyLimit(
    hospitalId: number,
    doctorId: number,
    date: Date,
    isEmergency: boolean = false,
  ): Promise<{ allowed: boolean; current: number; max: number; message?: string }> {
    const schedule = await this.prisma.doctorSchedule.findUnique({
      where: { doctorId },
    });

    if (!schedule || !schedule.maxPerDay || schedule.maxPerDay <= 0) {
      return { allowed: true, current: 0, max: 0 };
    }

    // 1. حساب الأرقام المحجوزة
    const reservedNumbersStr = schedule.reservedNumbers || '1,3,5,7,9';
    const reservedCount = reservedNumbersStr.split(',').length;

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // 2. حساب إجمالي الحجوزات (طوارئ + عادي)
    const totalBookedCount = await this.prisma.appointment.count({
      where: {
        hospitalId,
        doctorId,
        scheduledStart: { gte: dayStart, lte: dayEnd },
        status: {
          in: [
            AppointmentStatus.REQUESTED,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.CHECKED_IN,
            AppointmentStatus.COMPLETED,
          ],
        },
      },
    });

    // 3. التحقق من الحد الكلي
    if (totalBookedCount >= schedule.maxPerDay && !schedule.allowOverbook) {
      return {
        allowed: false,
        current: totalBookedCount,
        max: schedule.maxPerDay,
        message: `تم بلوغ الحد الأقصى الكلي (${schedule.maxPerDay}) للمواعيد لهذا الطبيب اليوم.`,
      };
    }

    // 4. التحقق النوعي (اختياري، لضمان عدم استهلاك العادي للأرقام المحجوزة)
    if (!isEmergency) {
      // الحالات العادية يجب ألا تتجاوز (الحد الكلي - عدد الأرقام المحجوزة)
      // إلا إذا كانت الأرقام المحجوزة مستخدمة بالفعل، لكننا نريد حجزها *للطوارئ*
      const maxNormal = schedule.maxPerDay - reservedCount;
      const normalBookedCount = await this.prisma.appointment.count({
        where: {
          hospitalId,
          doctorId,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          isEmergency: false,
          status: { notIn: [AppointmentStatus.CANCELLED] },
        },
      });

      if (normalBookedCount >= maxNormal && !schedule.allowOverbook) {
        return {
          allowed: false,
          current: normalBookedCount,
          max: maxNormal,
          message: `تم نفاد الأرقام المتاحة للحالات العادية. المتبقي محجوز للطوارئ.`,
        };
      }
    } else {
      // حالات الطوارئ: يمكنها الحجز طالما لم نصل للحد الكلي
      // وأيضاً يمكن وضع حد خاص للطوارئ إذا أردنا (maxEmergency)
      if (schedule.maxEmergency && schedule.maxEmergency > 0) {
         const emergencyBookedCount = await this.prisma.appointment.count({
          where: {
            hospitalId,
            doctorId,
            scheduledStart: { gte: dayStart, lte: dayEnd },
            isEmergency: true,
            status: { notIn: [AppointmentStatus.CANCELLED] },
          },
        });
        
        if (emergencyBookedCount >= schedule.maxEmergency && !schedule.allowOverbook) {
           return {
            allowed: false,
            current: emergencyBookedCount,
            max: schedule.maxEmergency,
            message: `تم بلوغ الحد الأقصى لمواعيد الطوارئ (${schedule.maxEmergency}).`,
          };
        }
      }
    }

    return { allowed: true, current: totalBookedCount, max: schedule.maxPerDay };
  }

  /**
   * الحصول على حالة قائمة الانتظار
   */
  async getQueueStatus(
    hospitalId: number,
    doctorId: number,
    date: Date,
  ): Promise<{
    totalBooked: number;
    normalBooked: number;
    emergencyBooked: number;
    maxPerDay: number;
    maxEmergency: number;
    nextNormalNumber: number;
    nextEmergencyNumber: number;
    reservedNumbers: number[];
    usedNumbers: number[];
    availableNormalNumbers: number[];
  }> {
    const schedule = await this.prisma.doctorSchedule.findUnique({
      where: { doctorId },
    });

    const reservedNumbersStr = schedule?.reservedNumbers || '1,3,5,7,9';
    const reservedNumbers = reservedNumbersStr
      .split(',')
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !isNaN(n));

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const todayAppointments = await this.prisma.appointment.findMany({
      where: {
        hospitalId,
        doctorId,
        scheduledStart: { gte: dayStart, lte: dayEnd },
        status: { notIn: [AppointmentStatus.CANCELLED] },
      },
      select: {
        queueNumber: true,
        isEmergency: true,
      },
    });

    const usedNumbers = todayAppointments
      .map((a) => a.queueNumber)
      .filter((n): n is number => n !== null);

    const normalBooked = todayAppointments.filter((a) => !a.isEmergency).length;
    const emergencyBooked = todayAppointments.filter((a) => a.isEmergency).length;

    // حساب الأرقام العادية المتاحة (أول 10)
    const availableNormalNumbers: number[] = [];
    let candidate = 2;
    while (availableNormalNumbers.length < 10 && candidate <= 100) {
      if (!usedNumbers.includes(candidate) && !reservedNumbers.includes(candidate)) {
        availableNormalNumbers.push(candidate);
      }
      candidate++;
    }

    const nextNormalNumber = await this.getNextQueueNumber(hospitalId, doctorId, date, false);
    const nextEmergencyNumber = await this.getNextQueueNumber(hospitalId, doctorId, date, true);

    return {
      totalBooked: todayAppointments.length,
      normalBooked,
      emergencyBooked,
      maxPerDay: schedule?.maxPerDay || 0,
      maxEmergency: schedule?.maxEmergency || 10,
      nextNormalNumber,
      nextEmergencyNumber,
      reservedNumbers,
      usedNumbers,
      availableNormalNumbers,
    };
  }

  // ============================================
  // إنشاء موعد جديد (مُحدّث)
  // ============================================

  async createAppointment(params: {
    hospitalId: number;
    patientId: number;
    doctorId?: number;
    departmentId?: number;
    scheduledStart: Date;
    scheduledEnd: Date;
    reason?: string;
    notes?: string;
    createdByUserId: number;
    type?: AppointmentType;
    isEmergency?: boolean; // ✅ جديد
    isSpecial?: boolean;   // ✅ جديد
    queueNumber?: number;  // ✅ جديد (اختياري للتخصيص اليدوي)
  }) {
    const {
      hospitalId,
      patientId,
      doctorId,
      departmentId,
      scheduledStart,
      scheduledEnd,
      reason,
      notes,
      type = AppointmentType.IN_PERSON,
      isEmergency = false,
      isSpecial = false,
      queueNumber: manualQueueNumber,
    } = params;

    // التحقق من المريض
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId, isDeleted: false },
    });
    if (!patient) {
      throw new BadRequestException('المريض غير موجود في هذا المشفى.');
    }

    let finalQueueNumber: number | null = null;

    if (doctorId) {
      // التحقق من الطبيب
      const doctor = await this.prisma.user.findFirst({
        where: { id: doctorId, hospitalId, isDoctor: true },
      });

      if (!doctor) {
        throw new BadRequestException(
          'المستخدم المختار ليس طبيباً. لا يمكن حجز موعد إلا للأطباء.',
        );
      }

      // 1. التحقق من أيام العمل (Doctor Work Days)
      const scheduleVal = await this.prisma.doctorSchedule.findUnique({
        where: { doctorId },
      });
      
      if (scheduleVal && scheduleVal.workDays) {
        const appointmentDate = new Date(scheduledStart);
        const dayOfWeek = appointmentDate.getDay(); 
        const allowedDays = scheduleVal.workDays.split(',').map(d => parseInt(d.trim()));
        
        if (!allowedDays.includes(dayOfWeek)) {
            const daysMap = ["الأحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس", "الجمعة", "السبت"];
            const allowedDaysNames = allowedDays.map(d => daysMap[d]).join("، ");
            throw new BadRequestException(`الطبيب غير متواجد في هذا اليوم. أيام العمل هي: ${allowedDaysNames}`);
        }
      }

      // فحص الحد اليومي
      const limitCheck = await this.checkDailyLimit(
        hospitalId,
        doctorId,
        scheduledStart,
        isEmergency,
      );

      if (!limitCheck.allowed) {
        throw new BadRequestException(limitCheck.message);
      }

      // حساب رقم التسلسل
      if (manualQueueNumber) {
        // إذا تم تحديد رقم يدوياً، نتحقق من توفره
        const dayStart = new Date(scheduledStart);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(scheduledStart);
        dayEnd.setHours(23, 59, 59, 999);

        const existingWithNumber = await this.prisma.appointment.findFirst({
          where: {
            hospitalId,
            doctorId,
            scheduledStart: { gte: dayStart, lte: dayEnd },
            queueNumber: manualQueueNumber,
            status: { notIn: [AppointmentStatus.CANCELLED] },
          },
        });

        if (existingWithNumber) {
          throw new BadRequestException(
            `الرقم ${manualQueueNumber} محجوز مسبقاً. يرجى اختيار رقم آخر.`,
          );
        }
        finalQueueNumber = manualQueueNumber;
      } else {
        // حساب الرقم تلقائياً
        finalQueueNumber = await this.getNextQueueNumber(
          hospitalId,
          doctorId,
          scheduledStart,
          isEmergency,
        );
      }
    }

    // إنشاء رابط الاجتماع للعيادة الافتراضية
    let meetingLink: string | null = null;
    if (type === AppointmentType.ONLINE) {
      const roomId = randomUUID();
      meetingLink = `https://meet.jit.si/Saraya-${roomId}`;
    }

    // ✅ استخدام Transaction لإنشاء الموعد مع الفوترة
    return this.prisma.$transaction(async (tx) => {
      // 1. إنشاء الموعد
      const appointment = await tx.appointment.create({
        data: {
          hospitalId,
          patientId,
          doctorId,
          departmentId,
          scheduledStart,
          scheduledEnd,
          reason,
          notes,
          status: AppointmentStatus.CONFIRMED,
          type,
          meetingLink,
          queueNumber: finalQueueNumber,
          isEmergency,
          isSpecial,
        },
      });

      // ✅ 2. إنشاء Encounter + Charge + Invoice للموعد المؤكد
      if (doctorId) {
        // جلب رتبة الطبيب
        const doctor = await tx.user.findUnique({
          where: { id: doctorId },
          select: { jobRank: true },
        });

        // تحديد كود الخدمة بناءً على الرتبة
        let serviceCode = 'CONSULT-OPD';
        if (doctor?.jobRank) {
          switch (doctor.jobRank) {
            case 'CONSULTANT': serviceCode = 'CONSULT-CONS'; break;
            case 'SPECIALIST': serviceCode = 'CONSULT-SPEC'; break;
            case 'GENERAL_PRACTITIONER': serviceCode = 'CONSULT-GEN'; break;
            case 'RESIDENT': serviceCode = 'CONSULT-OPD'; break;
          }
        }

        // جلب خدمة الكشف
        const consultService = await tx.serviceItem.findFirst({
          where: { hospitalId, code: serviceCode, isActive: true },
        });

        if (consultService) {
          // إنشاء Encounter
          const encounter = await tx.encounter.create({
            data: {
              hospitalId,
              patientId,
              departmentId: departmentId ?? null,
              doctorId: doctorId ?? null,
              type: EncounterType.OPD,
              status: EncounterStatus.OPEN,
              chiefComplaint: reason ?? null,
            },
          });

          // ربط الموعد بالـ Encounter
          await tx.appointment.update({
            where: { id: appointment.id },
            data: { encounterId: encounter.id },
          });

          // جلب بيانات التأمين
          const patientWithInsurance = await tx.patient.findUnique({
            where: { id: patientId },
            include: { insurancePolicy: true },
          });

          // حساب السعر
          const policyId = patientWithInsurance?.insurancePolicy?.isActive
            ? patientWithInsurance.insurancePolicy.id
            : null;

          const price = await this.priceService.getServicePrice(
            hospitalId,
            consultService.id,
            policyId,
          );

          // إنشاء Charge
          const charge = await tx.encounterCharge.create({
            data: {
              hospitalId,
              encounterId: encounter.id,
              serviceItemId: consultService.id,
              sourceType: ChargeSource.MANUAL,
              sourceId: appointment.id,
              quantity: 1,
              unitPrice: price,
              totalAmount: price,
              performerId: doctorId ?? null,
            },
          });

          // حساب حصص الدفع
          let patientShare = price;
          let insuranceShare = 0;
          let insuranceProviderId: number | null = null;

          if (patientWithInsurance?.insurancePolicy?.isActive) {
            const copayRate = Number(patientWithInsurance.insurancePolicy.patientCopayRate || 0) / 100;
            patientShare = Math.round(price * copayRate * 100) / 100;
            insuranceShare = Math.round((price - patientShare) * 100) / 100;
            insuranceProviderId = patientWithInsurance.insurancePolicy.insuranceProviderId;
          }

          // جلب الفترة المالية
          const { financialYear, period } = await this.accounting.validateDateInOpenPeriod(
            hospitalId,
            new Date(),
          );

          // إنشاء الفاتورة
          const invoice = await tx.invoice.create({
            data: {
              hospitalId,
              patientId,
              encounterId: encounter.id,
              status: 'ISSUED',
              totalAmount: price,
              discountAmount: 0,
              paidAmount: 0,
              currency: 'LYD',
              patientShare,
              insuranceShare,
              insuranceProviderId,
              financialYearId: financialYear.id,
              financialPeriodId: period.id,
            },
          });

          // ربط الـ Charge بالفاتورة
          await tx.encounterCharge.update({
            where: { id: charge.id },
            data: { invoiceId: invoice.id },
          });
        }
      }

      // إرجاع الموعد مع العلاقات
      return tx.appointment.findUnique({
        where: { id: appointment.id },
        include: {
          patient: true,
          doctor: true,
          department: true,
          encounter: true,
        },
      });
    });
  }

  // ============================================
  // قائمة المواعيد اليومية (مُحدّث)
  // ============================================

  async listAppointmentsForDay(
    hospitalId: number,
    date: Date,
    filters?: {
      doctorId?: number;
      departmentId?: number;
      status?: AppointmentStatus;
      isEmergency?: boolean;
    },
  ) {
    const dayStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0,
    );
    const dayEnd = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
    );

    return this.prisma.appointment.findMany({
      where: {
        hospitalId,
        scheduledStart: { gte: dayStart, lte: dayEnd },
        ...(filters?.doctorId ? { doctorId: filters.doctorId } : {}),
        ...(filters?.departmentId
          ? { departmentId: filters.departmentId }
          : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.isEmergency !== undefined
          ? { isEmergency: filters.isEmergency }
          : {}),
      },
      orderBy: [
        { queueNumber: 'asc' },  // ✅ ترتيب برقم التسلسل
        { scheduledStart: 'asc' },
      ],
      include: {
        patient: true,
        doctor: true,
        department: true,
      },
    });
  }

  async getOne(hospitalId: number, id: number) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, hospitalId },
      include: {
        patient: true,
        doctor: true,
        department: true,
        encounter: true,
      },
    });

    if (!appt) {
      throw new NotFoundException('الموعد غير موجود');
    }
    return appt;
  }

  async updateStatus(
    hospitalId: number,
    id: number,
    newStatus: AppointmentStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // ✅ جلب بيانات التأمين للمريض مع الموعد
      const appt = await tx.appointment.findFirst({
        where: { id, hospitalId },
        include: {
          patient: {
            include: { insurancePolicy: true }, // 👈 مهم جداً لمعرفة البوليصة
          },
        },
      });

      if (!appt) {
        throw new NotFoundException('الموعد غير موجود');
      }

      if (
        appt.status === AppointmentStatus.CANCELLED ||
        appt.status === AppointmentStatus.NO_SHOW
      ) {
        throw new BadRequestException(
          'لا يمكن تغيير حالة موعد ملغي أو لم يحضر المريض',
        );
      }

      // 🟢 عند CONFIRMED: إنشاء Encounter + Charge + Invoice (الدفع قبل الكشف)
      if (newStatus === AppointmentStatus.CONFIRMED && !appt.encounterId) {
        // 1. جلب بيانات الطبيب للحصول على الرتبة
        const doctor = appt.doctorId
          ? await tx.user.findUnique({
              where: { id: appt.doctorId },
              select: { jobRank: true },
            })
          : null;

        // 2. تحديد كود الخدمة بناءً على رتبة الطبيب
        let serviceCode = 'CONSULT-OPD'; // افتراضي
        if (doctor?.jobRank) {
          switch (doctor.jobRank) {
            case 'CONSULTANT':
              serviceCode = 'CONSULT-CONS';
              break;
            case 'SPECIALIST':
              serviceCode = 'CONSULT-SPEC';
              break;
            case 'GENERAL_PRACTITIONER':
              serviceCode = 'CONSULT-GEN';
              break;
            case 'RESIDENT':
              serviceCode = 'CONSULT-OPD';
              break;
          }
        }

        // 3. جلب خدمة الكشف من ServiceItem
        const consultService = await tx.serviceItem.findFirst({
          where: {
            hospitalId,
            code: serviceCode,
            isActive: true,
          },
        });

        if (!consultService) {
          throw new BadRequestException(
            `لم يتم تهيئة خدمة ${serviceCode} في قائمة الخدمات. يرجى إضافتها أولاً.`,
          );
        }

        // 4. إنشاء Encounter
        const encounter = await tx.encounter.create({
          data: {
            hospitalId,
            patientId: appt.patientId,
            departmentId: appt.departmentId ?? null,
            doctorId: appt.doctorId ?? null,
            type: EncounterType.OPD,
            status: EncounterStatus.OPEN,
            chiefComplaint: appt.reason ?? null,
          },
        });

        // 5. حساب السعر بناءً على قائمة الأسعار (تأمين أو كاش)
        const policyId =
          appt.patient.insurancePolicy && appt.patient.insurancePolicy.isActive
            ? appt.patient.insurancePolicy.id
            : null;

        const price = await this.priceService.getServicePrice(
          hospitalId,
          consultService.id,
          policyId,
        );

        // 6. إنشاء Charge للكشف
        const charge = await tx.encounterCharge.create({
          data: {
            hospitalId,
            encounterId: encounter.id,
            serviceItemId: consultService.id,
            sourceType: ChargeSource.MANUAL, // نوع المصدر
            sourceId: appt.id,
            quantity: 1,
            unitPrice: price,
            totalAmount: price,
            performerId: appt.doctorId ?? null,
          },
        });

        // 7. ✅ إنشاء فاتورة تلقائياً لتظهر في الخزينة
        // جلب بيانات التأمين للمريض
        const patientData = await tx.patient.findUnique({
          where: { id: appt.patientId },
          include: { insurancePolicy: true },
        });

        // حساب حصة المريض وحصة التأمين
        let patientShare = price;
        let insuranceShare = 0;
        let insuranceProviderId: number | null = null;

        if (patientData?.insurancePolicy?.isActive) {
          // نسبة الخصم على المريض (copay) - كلما زادت قل ما يدفعه التأمين
          const copayRate = Number(patientData.insurancePolicy.patientCopayRate || 0) / 100;
          patientShare = Math.round(price * copayRate * 100) / 100;
          insuranceShare = Math.round((price - patientShare) * 100) / 100;
          insuranceProviderId = patientData.insurancePolicy.insuranceProviderId;
        }

        // ✅ جلب الفترة المالية المفتوحة (مطلوب لإنشاء الفاتورة)
        const { financialYear, period } = await this.accounting.validateDateInOpenPeriod(
          hospitalId,
          new Date(),
        );

        // إنشاء الفاتورة
        const invoice = await tx.invoice.create({
          data: {
            hospitalId,
            patientId: appt.patientId,
            encounterId: encounter.id,
            status: 'ISSUED',
            totalAmount: price,
            discountAmount: 0,
            paidAmount: 0,
            currency: 'LYD',
            patientShare,
            insuranceShare,
            insuranceProviderId,
            financialYearId: financialYear.id,
            financialPeriodId: period.id,
          },
        });

        // ربط الـ Charge بالفاتورة
        await tx.encounterCharge.update({
          where: { id: charge.id },
          data: { invoiceId: invoice.id },
        });

        // تحديث الموعد
        return tx.appointment.update({
          where: { id },
          data: {
            status: newStatus,
            encounterId: encounter.id,
          },
          include: {
            patient: true,
            doctor: true,
            department: true,
            encounter: true,
          },
        });
      }

      // 🟡 عند CHECKED_IN: فقط تحديث الحالة (الفوترة تمت عند CONFIRMED)
      if (newStatus === AppointmentStatus.CHECKED_IN) {
        return tx.appointment.update({
          where: { id },
          data: { status: newStatus },
          include: {
            patient: true,
            doctor: true,
            department: true,
            encounter: true,
          },
        });
      }

      // 🟡 عند COMPLETED: إغلاق الـ Encounter
      if (newStatus === AppointmentStatus.COMPLETED && appt.encounterId) {
        await tx.encounter.update({
          where: { id: appt.encounterId },
          data: { status: EncounterStatus.CLOSED },
        });
      }

      // باقي الحالات
      return tx.appointment.update({
        where: { id },
        data: { status: newStatus },
        include: {
          patient: true,
          doctor: true,
          department: true,
          encounter: true,
        },
      });
    });
  }

  // ============================================
  // إدارة جدول الطبيب
  // ============================================

  async getDoctorSchedule(hospitalId: number, doctorId: number) {
    return this.prisma.doctorSchedule.findUnique({
      where: { doctorId },
      include: {
        doctor: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  async upsertDoctorSchedule(
    hospitalId: number,
    doctorId: number,
    data: {
      maxPerDay?: number;
      maxEmergency?: number;
      allowOverbook?: boolean;
      reservedNumbers?: string;
      startTime?: string;
      endTime?: string;
      slotDuration?: number;
      workDays?: string;
      specialty?: string;
      consultationPrice?: number | null; // ✅ جديد
    },
  ) {
    return this.prisma.doctorSchedule.upsert({
      where: { doctorId },
      create: {
        hospitalId,
        doctorId,
        ...data,
      },
      update: data,
    });
  }

  async listDoctorSchedules(hospitalId: number) {
    // 1. جلب جداول الأطباء
    const schedules = await this.prisma.doctorSchedule.findMany({
      where: { hospitalId },
      include: {
        doctor: {
          select: {
            id: true,
            fullName: true,
            email: true,
            jobRank: true,
          },
        },
      },
      orderBy: { doctor: { fullName: 'asc' } },
    });

    // 2. جلب أسعار الكشف من ServiceItem
    const priceItems = await this.prisma.serviceItem.findMany({
      where: {
        hospitalId,
        code: { in: ['CONSULT-CONS', 'CONSULT-SPEC', 'CONSULT-GEN', 'CONSULT-OPD'] },
      },
      select: { code: true, defaultPrice: true },
    });

    const priceMap: Record<string, number> = {};
    for (const item of priceItems) {
      if (item.code) priceMap[item.code] = Number(item.defaultPrice);
    }

    // 3. حساب السعر الفعلي لكل طبيب
    return schedules.map((s) => {
      let calculatedPrice = 0;

      // الأولوية 1: السعر المخصص
      if (s.consultationPrice && Number(s.consultationPrice) > 0) {
        calculatedPrice = Number(s.consultationPrice);
      } else if (s.doctor?.jobRank) {
        // الأولوية 2: السعر حسب الرتبة
        switch (s.doctor.jobRank) {
          case 'CONSULTANT':
            calculatedPrice = priceMap['CONSULT-CONS'] || 0;
            break;
          case 'SPECIALIST':
            calculatedPrice = priceMap['CONSULT-SPEC'] || 0;
            break;
          case 'GENERAL_PRACTITIONER':
            calculatedPrice = priceMap['CONSULT-GEN'] || 0;
            break;
          case 'RESIDENT':
            calculatedPrice = priceMap['CONSULT-OPD'] || 0;
            break;
          default:
            calculatedPrice = priceMap['CONSULT-OPD'] || 0;
        }
      }

      return {
        ...s,
        calculatedPrice, // ✅ السعر الفعلي المحسوب
      };
    });
  }

  // ============================================
  // الطباعة (جديد)
  // ============================================
  async getBookingReceiptData(hospitalId: number, appointmentId: number) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, hospitalId },
      include: {
        patient: { select: { fullName: true, mrn: true } },
        doctor: {
          select: {
            fullName: true,
            jobRank: true, // ✅ الرتبة
            doctorSchedule: { select: { consultationPrice: true } }, // ✅ السعر المخصص
          },
        },
        department: { select: { name: true } },
      },
    });

    if (!appt) {
      throw new NotFoundException('الموعد غير موجود');
    }

    // ⚡ حساب السعر (الأولوية: 1. السعر المحدد 2. الرتبة)
    let price = 0;
    if (appt.doctor) {
      const specificPrice = Number(
        appt.doctor.doctorSchedule?.consultationPrice || 0,
      );
      if (specificPrice > 0) {
        price = specificPrice;
      } else if (appt.doctor.jobRank) {
        let serviceCode = 'CONSULT-OPD';
        switch (appt.doctor.jobRank) {
          case 'CONSULTANT':
            serviceCode = 'CONSULT-CONS';
            break;
          case 'SPECIALIST':
            serviceCode = 'CONSULT-SPEC';
            break;
          case 'GENERAL_PRACTITIONER':
            serviceCode = 'CONSULT-GEN';
            break;
          case 'RESIDENT':
             serviceCode = 'CONSULT-OPD';
             break;
          default:
            serviceCode = 'CONSULT-OPD';
        }

        const serviceItem = await this.prisma.serviceItem.findFirst({
          where: { hospitalId, code: serviceCode },
          select: { defaultPrice: true },
        });

        if (serviceItem) {
          price = Number(serviceItem.defaultPrice);
        }
      }
    }

    return {
      appointmentId: appt.id,
      patientName: appt.patient.fullName,
      mrn: appt.patient.mrn,
      doctorName: appt.doctor?.fullName || 'غير محدد',
      departmentName: appt.department?.name || 'العيادات الخارجية',
      date: appt.scheduledStart,
      time: appt.scheduledStart.toLocaleTimeString('ar-LY', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      queueNumber: appt.queueNumber || '-',
      hospitalName: 'مستشفى السرايا الدولي',
      address: 'طرابلس، ليبيا',
      printDate: new Date().toLocaleString('ar-LY'),
      price: price > 0 ? `${price.toFixed(3)}` : 'يحدد عند الوصول', // ✅ إضافة السعر
    };
  }
}


// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   AppointmentStatus,
//   EncounterType,
//   EncounterStatus,
//   ChargeSource,
// } from '@prisma/client';

// @Injectable()
// export class AppointmentsService {
//   constructor(private prisma: PrismaService) {}

//   async createAppointment(params: {
//     hospitalId: number;
//     patientId: number;
//     doctorId?: number;
//     departmentId?: number;
//     scheduledStart: Date;
//     scheduledEnd: Date;
//     reason?: string;
//     notes?: string;
//     createdByUserId: number;
//   }) {
//     const {
//       hospitalId,
//       patientId,
//       doctorId,
//       departmentId,
//       scheduledStart,
//       scheduledEnd,
//       reason,
//       notes,
//       createdByUserId,
//     } = params;

//     // ✅ تحقق من أن المريض يتبع نفس المستشفى (لو عندك منطق جاهز هنا أبقه كما هو)
//     const patient = await this.prisma.patient.findFirst({
//       where: { id: patientId, hospitalId, isDeleted: false },
//     });
//     if (!patient) {
//       throw new BadRequestException('المريض غير موجود في هذه المنشأة.');
//     }

//     // ✅ منطق الحد الأقصى للمواعيد اليومية للطبيب
//     if (doctorId) {
//       // نجيب إعدادات الطبيب
//       const schedule = await this.prisma.doctorSchedule.findUnique({
//         where: {
//           doctorId,
//         },
//       });

//       if (schedule && schedule.maxPerDay && schedule.maxPerDay > 0) {
//         // بداية ونهاية اليوم حسب موعد الحجز
//         const dayStart = new Date(scheduledStart);
//         dayStart.setHours(0, 0, 0, 0);
//         const dayEnd = new Date(scheduledStart);
//         dayEnd.setHours(23, 59, 59, 999);

//         // نحسب عدد المواعيد الحالية لليوم نفسه لهذا الطبيب
//         const bookedCount = await this.prisma.appointment.count({
//           where: {
//             hospitalId,
//             doctorId,
//             scheduledStart: {
//               gte: dayStart,
//               lte: dayEnd,
//             },
//             status: {
//               in: [
//                 AppointmentStatus.REQUESTED,
//                 AppointmentStatus.CONFIRMED,
//                 AppointmentStatus.CHECKED_IN,
//                 AppointmentStatus.COMPLETED,
//               ],
//             },
//           },
//         });

//         if (bookedCount >= schedule.maxPerDay && !schedule.allowOverbook) {
//           throw new BadRequestException(
//             `تم بلوغ الحد الأقصى (${schedule.maxPerDay}) من المواعيد لهذا الطبيب في هذا اليوم.`,
//           );
//         }
//       }
//     }

//     // 👇 إنشاء الموعد بعد التحقق من الـ quota
//     return this.prisma.appointment.create({
//       data: {
//         hospitalId,
//         patientId,
//         doctorId,
//         departmentId,
//         scheduledStart,
//         scheduledEnd,
//         reason,
//         notes,
//         status: AppointmentStatus.CONFIRMED, // أو المنطق اللي عندك
//         // createdByUserId يمكن تخزينه في AuditLog فقط أو تضيف حقل لو حاب
//       },
//     });
//   }

//   async listAppointmentsForDay(
//     hospitalId: number,
//     date: Date,
//     filters?: {
//       doctorId?: number;
//       departmentId?: number;
//       status?: AppointmentStatus;
//     },
//   ) {
//     const dayStart = new Date(
//       date.getFullYear(),
//       date.getMonth(),
//       date.getDate(),
//       0,
//       0,
//       0,
//     );
//     const dayEnd = new Date(
//       date.getFullYear(),
//       date.getMonth(),
//       date.getDate(),
//       23,
//       59,
//       59,
//     );

//     return this.prisma.appointment.findMany({
//       where: {
//         hospitalId,
//         scheduledStart: {
//           gte: dayStart,
//           lte: dayEnd,
//         },
//         ...(filters?.doctorId ? { doctorId: filters.doctorId } : {}),
//         ...(filters?.departmentId
//           ? { departmentId: filters.departmentId }
//           : {}),
//         ...(filters?.status ? { status: filters.status } : {}),
//       },
//       orderBy: {
//         scheduledStart: 'asc',
//       },
//       include: {
//         patient: true,
//         doctor: true,
//         department: true,
//       },
//     });
//   }

//   async getOne(hospitalId: number, id: number) {
//     const appt = await this.prisma.appointment.findFirst({
//       where: {
//         id,
//         hospitalId,
//       },
//       include: {
//         patient: true,
//         doctor: true,
//         department: true,
//         encounter: true,
//       },
//     });

//     if (!appt) {
//       throw new NotFoundException('الموعد غير موجود');
//     }

//     return appt;
//   }

//   async updateStatus(
//     hospitalId: number,
//     id: number,
//     newStatus: AppointmentStatus,
//   ) {
//     return this.prisma.$transaction(async (tx) => {
//       const appt = await tx.appointment.findFirst({
//         where: {
//           id,
//           hospitalId,
//         },
//       });

//       if (!appt) {
//         throw new NotFoundException('الموعد غير موجود');
//       }

//       // منع تعديل مواعيد ملغاة أو NO_SHOW (اختياري)
//       if (
//         appt.status === AppointmentStatus.CANCELLED ||
//         appt.status === AppointmentStatus.NO_SHOW
//       ) {
//         throw new BadRequestException(
//           'لا يمكن تغيير حالة موعد ملغي أو لم يحضر المريض (NO_SHOW)',
//         );
//       }

//       // 🟢 عند CHECKED_IN ولم يكن هناك Encounter سابقاً:
//       //    1) ننشئ Encounter
//       //    2) ننشئ EncounterCharge لخدمة CONSULT-OPD
//       if (newStatus === AppointmentStatus.CHECKED_IN && !appt.encounterId) {
//         // نأتي بخدمة كشف العيادة الخارجية
//         const consultService = await tx.serviceItem.findFirst({
//           where: {
//             hospitalId,
//             code: 'CONSULT-OPD',
//             isActive: true,
//             // لو عندك isDeleted في ServiceItem خليه هنا:
//             // isDeleted: false,
//           } as any,
//         });

//         if (!consultService) {
//           throw new BadRequestException(
//             'لم يتم تهيئة خدمة CONSULT-OPD في قائمة الخدمات. يرجى إضافتها أولاً.',
//           );
//         }

//         // إنشاء Encounter جديد للعيادة الخارجية
//         const encounter = await tx.encounter.create({
//           data: {
//             hospitalId,
//             patientId: appt.patientId,
//             departmentId: appt.departmentId ?? null,
//             doctorId: appt.doctorId ?? null,
//             type: EncounterType.OPD, // لو ما عندك enum: 'OPD' as any
//             status: EncounterStatus.OPEN, // أو 'OPEN' as any
//             chiefComplaint: appt.reason ?? null,
//           },
//         });

//         // اختيار نوع الـ ChargeSource أنسب قيمة متاحة
//         const sourceType =
//           (ChargeSource as any).CONSULTATION ??
//           (ChargeSource as any).SERVICE ??
//           (ChargeSource as any).MANUAL ??
//           (ChargeSource as any).PHARMACY; // آخر حل fallback

//         const unitPrice = Number(consultService.defaultPrice ?? 0);
//         const quantity = 1;
//         const totalAmount = unitPrice * quantity;

//         // إنشاء Charge للكشف
//         await tx.encounterCharge.create({
//           data: {
//             hospitalId,
//             encounterId: encounter.id,
//             serviceItemId: consultService.id,
//             sourceType,
//             sourceId: appt.id,
//             quantity,
//             unitPrice,
//             totalAmount,
//           },
//         });

//         // تحديث الموعد بالحالة الجديدة وربطه بالـ encounter
//         return tx.appointment.update({
//           where: { id },
//           data: {
//             status: newStatus,
//             encounterId: encounter.id,
//           },
//           include: {
//             patient: true,
//             doctor: true,
//             department: true,
//             encounter: true,
//           },
//         });
//       }

//       // 🟡 عند COMPLETED مع وجود Encounter: نقفل الـ Encounter
//       if (newStatus === AppointmentStatus.COMPLETED && appt.encounterId) {
//         await tx.encounter.update({
//           where: { id: appt.encounterId },
//           data: {
//             status: EncounterStatus.CLOSED, // أو 'CLOSED' as any
//           },
//         });
//       }

//       // باقي الحالات: نغيّر الحالة فقط
//       return tx.appointment.update({
//         where: { id },
//         data: {
//           status: newStatus,
//         },
//         include: {
//           patient: true,
//           doctor: true,
//           department: true,
//           encounter: true,
//         },
//       });
//     });
//   }
// }
