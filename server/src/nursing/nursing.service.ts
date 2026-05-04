import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EncounterStatus,
  EncounterType,
  BedStatus,
  AdministrationStatus,
  CareTaskStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class NursingService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2
  ) {}

  // 1. جلب قائمة المرضى في عنبر معين (أو كل العنابر) - Ward Dashboard
  async getInpatients(hospitalId: number, wardId?: number) {
    // نبحث عن الحالات المفتوحة (تنويم) والتي لها سرير
    const encounters = await this.prisma.encounter.findMany({
      where: {
        hospitalId,
        type: EncounterType.IPD,
        status: EncounterStatus.OPEN,
        // إذا حددنا عنبر، نفلتر الأسرة المرتبطة به
        bedAssignments: {
          some: {
            to: null, // الحجز ما زال سارياً
            bed: wardId ? { wardId: wardId } : {},
          },
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            mrn: true,
            gender: true,
            dateOfBirth: true,
          },
        },
        doctor: {
          select: { fullName: true },
        },
        bedAssignments: {
          where: { to: null },
          include: {
            bed: {
              include: {
                ward: { select: { id: true, name: true } },
                room: { select: { roomNumber: true } },
              },
            },
          },
        },
      },
      orderBy: {
        admissionDate: 'desc',
      },
    });

    // تنسيق البيانات للواجهة
    return encounters.map((enc) => {
      const assignment = enc.bedAssignments[0];
      return {
        encounterId: enc.id,
        patient: enc.patient,
        doctor: enc.doctor,
        admissionDate: enc.admissionDate,
        bed: assignment
          ? {
              id: assignment.bed.id,
              number: assignment.bed.bedNumber,
              room: assignment.bed.room.roomNumber,
              ward: assignment.bed.ward.name,
              wardId: assignment.bed.ward.id,
            }
          : null,
      };
    });
  }

  // 2. جلب خطة الأدوية للمريض (Medication Administration Record - MAR)
  async getPatientMAR(hospitalId: number, encounterId: number) {
    // جلب الوصفات الفعالة
    const prescriptions = await this.prisma.prescription.findMany({
      where: {
        hospitalId,
        encounterId,
        status: { in: ['ACTIVE', 'PARTIALLY_COMPLETED', 'COMPLETED'] }, // نجلب حتى المكتملة لأن المريض قد يأخذ دواء منها لعدة أيام
      },
      include: {
        items: {
          include: { product: true },
        },
        doctor: { select: { fullName: true } },
      },
    });

    // جلب سجلات الإعطاء السابقة
    const administrations = await this.prisma.medicationAdministration.findMany(
      {
        where: {
          hospitalId,
          encounterId,
        },
        orderBy: { administeredAt: 'desc' },
        include: {
          performer: { select: { fullName: true } },
        },
      },
    );

    return {
      prescriptions,
      administrations,
    };
  }

  // 3. تسجيل إعطاء دواء (eMAR Action)
  async administerMedication(params: {
    hospitalId: number;
    userId: number;
    encounterId: number;
    prescriptionItemId: number;
    status: AdministrationStatus;
    notes?: string;
  }) {
    const {
      hospitalId,
      userId,
      encounterId,
      prescriptionItemId,
      status,
      notes,
    } = params;

    const item = await this.prisma.prescriptionItem.findUnique({
      where: { id: prescriptionItemId },
      include: { prescription: true },
    });

    if (!item) throw new NotFoundException('البند الدوائي غير موجود.');
    if (item.prescription.hospitalId !== hospitalId)
      throw new BadRequestException('خطأ في البيانات.');

    return this.prisma.medicationAdministration.create({
      data: {
        hospitalId,
        encounterId,
        prescriptionItemId,
        performerId: userId,
        status,
        notes,
        administeredAt: new Date(),
      },
    });
  }

  // -----------------------------------------------------------------------
  // 🟢 CLMA (Closed-Loop Medication Administration) - HIMSS Stage 6
  // -----------------------------------------------------------------------

  async verifyFiveRights(
    hospitalId: number,
    encounterId: number,
    prescriptionItemId: number,
    patientBarcode: string,
    drugBarcode: string,
  ) {
    const item = await this.prisma.prescriptionItem.findUnique({
      where: { id: prescriptionItemId },
      include: {
        product: true,
        prescription: {
          include: { patient: true },
        },
      },
    });

    if (!item) throw new NotFoundException('البند الدوائي غير موجود.');
    if (
      item.prescription.hospitalId !== hospitalId ||
      item.prescription.encounterId !== encounterId
    ) {
      throw new BadRequestException('بيانات المطابقة غير صحيحة.');
    }

    // 1. Right Patient Check (Using MRN as barcode)
    const patientStr = item.prescription.patient.mrn;
    const isPatientMatch = patientStr === patientBarcode;

    // 2. Right Drug Check
    const isDrugMatch = item.product?.barcode === drugBarcode;

    return {
      isPatientMatch,
      isDrugMatch,
      isVerified5Rights: isPatientMatch && isDrugMatch,
      expectedPatientBarcode: patientStr,
      expectedDrugBarcode: item.product?.barcode,
    };
  }

  async administerWithBarcode(params: {
    hospitalId: number;
    userId: number;
    encounterId: number;
    prescriptionItemId: number;
    patientBarcode: string;
    drugBarcode: string;
    isEmergencyOverride: boolean;
    varianceReason?: string;
    notes?: string;
  }) {
    const {
      hospitalId,
      userId,
      encounterId,
      prescriptionItemId,
      patientBarcode,
      drugBarcode,
      isEmergencyOverride,
      varianceReason,
      notes,
    } = params;

    // إجراء المطابقة (Barcode Scanning)
    const verification = await this.verifyFiveRights(
      hospitalId,
      encounterId,
      prescriptionItemId,
      patientBarcode,
      drugBarcode,
    );

    // المنع الصارم ما لم يكن هناك تجاوز طارئ (Soft Blocking with Emergency Override)
    if (!verification.isVerified5Rights && !isEmergencyOverride) {
      throw new BadRequestException(
        'خطأ طبي: فشل المطابقة الخماسية للباركود (5 Rights). لا يمكن إعطاء الدواء. التجاوز مسموح في الحالات الحرجة فقط.',
      );
    }

    if (!verification.isVerified5Rights && isEmergencyOverride && !varianceReason) {
      throw new BadRequestException(
        'في حالات تجاوز المطابقة (Emergency Override)، يجب إدخال سبب التجاوز (Variance Reason) إجبارياً للتدقيق.',
      );
    }

    // بناءً على قواعد HIMSS، يجب توثيق كل عملية إعطاء.
    const record = await this.prisma.medicationAdministration.create({
      data: {
        hospitalId,
        encounterId,
        prescriptionItemId,
        performerId: userId,
        status: AdministrationStatus.GIVEN,
        notes,
        // CLMA Auditing fields
        scannedPatientBarcode: patientBarcode,
        scannedDrugBarcode: drugBarcode,
        isVerified5Rights: verification.isVerified5Rights,
        isEmergencyOverride: !verification.isVerified5Rights && isEmergencyOverride,
        varianceReason: varianceReason || null,
        administeredAt: new Date(),
      },
    });

    if (!verification.isVerified5Rights && isEmergencyOverride) {
      this.eventEmitter.emit('clinical.variance.clma', {
        hospitalId,
        encounterId,
        performerId: userId,
        varianceReason,
        prescribedBarcode: verification.expectedDrugBarcode,
        scannedBarcode: drugBarcode,
        administrationId: record.id,
      });
    }

    return record;
  }

  // 4. إضافة ملاحظة تمريض
  async addNursingNote(params: {
    hospitalId: number;
    userId: number;
    encounterId: number;
    note: string;
    isShiftHandover: boolean;
  }) {
    return this.prisma.nursingNote.create({
      data: {
        hospitalId: params.hospitalId,
        encounterId: params.encounterId,
        createdById: params.userId,
        note: params.note,
        isShiftHandover: params.isShiftHandover,
      },
    });
  }

  // 5. جلب ملاحظات التمريض
  async getNursingNotes(hospitalId: number, encounterId: number) {
    return this.prisma.nursingNote.findMany({
      where: { hospitalId, encounterId },
      include: {
        createdBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 6. المهام السريرية (Care Tasks)
  async getCareTasks(encounterId: number) {
    return this.prisma.careTask.findMany({
      where: { enrollment: { encounterId } },
      include: {
        step: { select: { title: true, dayNumber: true } },
        assignedTo: { select: { fullName: true } },
        completedBy: { select: { fullName: true } },
      },
      orderBy: [
        { step: { dayNumber: 'desc' } },
        { createdAt: 'desc' },
      ],
    });
  }

  async updateCareTaskStatus(userId: number, taskId: number, status: CareTaskStatus, notes?: string) {
    const data: any = { status, notes };
    if (status === 'COMPLETED' || status === 'SKIPPED') {
      data.completedById = userId;
      data.completedAt = new Date();
    } else {
      data.completedById = null;
      data.completedAt = null;
    }
    return this.prisma.careTask.update({
      where: { id: taskId },
      data,
      include: {
        step: { select: { title: true, dayNumber: true } },
        completedBy: { select: { fullName: true } }
      },
    });
  }

  // -----------------------------------------------------------------------
  // 🟢 MAR Schedule & Overdue Alerts - HIMSS Stage 6/7 Target (Sprint 2C)
  // -----------------------------------------------------------------------

  /**
   * توليد جدول مواعيد إعطاء الأدوية (MAR) ليوم محدد
   */
  async generateMARSchedule(hospitalId: number, encounterId: number, targetDate: Date = new Date()) {
    // 1. Get active prescription items
    const prescriptions = await this.prisma.prescription.findMany({
      where: {
        hospitalId,
        encounterId,
        status: { in: ['ACTIVE', 'PARTIALLY_COMPLETED'] },
      },
      include: {
        items: { include: { product: true } },
      },
    });

    const schedule: any[] = [];
    
    // Normalize targetDate to start of day
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    // 2. Get today's administrations to map to slots
    const todayAdmins = await this.prisma.medicationAdministration.findMany({
      where: {
        hospitalId,
        encounterId,
        administeredAt: {
          gte: startOfDay,
          lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    });

    // 3. Generate slots based on frequency
    for (const rx of prescriptions) {
      for (const item of rx.items) {
        const slots: Date[] = [];
        
        switch (item.frequency) {
          case 'DAILY':
            slots.push(new Date(startOfDay.getTime() + 8 * 60 * 60 * 1000)); // 08:00
            break;
          case 'BID':
            slots.push(new Date(startOfDay.getTime() + 8 * 60 * 60 * 1000)); // 08:00
            slots.push(new Date(startOfDay.getTime() + 20 * 60 * 60 * 1000)); // 20:00
            break;
          case 'TID':
            slots.push(new Date(startOfDay.getTime() + 8 * 60 * 60 * 1000)); // 08:00
            slots.push(new Date(startOfDay.getTime() + 14 * 60 * 60 * 1000)); // 14:00
            slots.push(new Date(startOfDay.getTime() + 20 * 60 * 60 * 1000)); // 20:00
            break;
          case 'QID':
            slots.push(new Date(startOfDay.getTime() + 6 * 60 * 60 * 1000)); // 06:00
            slots.push(new Date(startOfDay.getTime() + 12 * 60 * 60 * 1000)); // 12:00
            slots.push(new Date(startOfDay.getTime() + 18 * 60 * 60 * 1000)); // 18:00
            slots.push(new Date(startOfDay.getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000)); // 23:59 (stay within today)
            break;
          case 'QHS':
            slots.push(new Date(startOfDay.getTime() + 22 * 60 * 60 * 1000)); // 22:00
            break;
          // PRN, ONCE, OTHER can be handled dynamically or omitted from rigid scheduling
        }

        // 4. Map slots to administration records
        for (const slotTime of slots) {
          // Find if there's an administration record within +/- 2 hours of this slot
          const slotStart = new Date(slotTime.getTime() - 2 * 60 * 60 * 1000);
          const slotEnd = new Date(slotTime.getTime() + 2 * 60 * 60 * 1000);
          
          const adminRecord = todayAdmins.find(
            a => a.prescriptionItemId === item.id && 
                 a.administeredAt >= slotStart && 
                 a.administeredAt <= slotEnd
          );

          let status = 'PENDING';
          let isOverdue = false;
          
          if (adminRecord) {
            status = adminRecord.status; // GIVEN, REFUSED, etc.
          } else {
            // Check if overdue (more than 1 hour past the slot time)
            if (new Date().getTime() > slotTime.getTime() + 60 * 60 * 1000) {
              status = 'OVERDUE';
              isOverdue = true;
            }
          }

          schedule.push({
            prescriptionItemId: item.id,
            drugName: item.product.name,
            dose: item.dose,
            route: item.route,
            scheduledTime: slotTime,
            status,
            isOverdue,
            administrationRecord: adminRecord || null,
          });
        }
      }
    }

    // Sort by scheduled time
    return schedule.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  }

  /**
   * الكشف عن الأدوية المتأخرة وإطلاق تنبيهات
   */
  async getOverdueMedications(hospitalId: number, encounterId?: number) {
    const activeEncounters = encounterId 
      ? [{ id: encounterId }] 
      : await this.prisma.encounter.findMany({
          where: { hospitalId, type: 'IPD', status: 'OPEN' },
          select: { id: true }
        });

    const allOverdue: any[] = [];
    
    for (const enc of activeEncounters) {
      const schedule = await this.generateMARSchedule(hospitalId, enc.id, new Date());
      const overdueItems = schedule.filter(s => s.isOverdue);
      
      if (overdueItems.length > 0) {
        allOverdue.push({
          encounterId: enc.id,
          overdueItems,
        });
        
        // Emit event for alerting system
        this.eventEmitter.emit('nursing.medication.overdue', {
          hospitalId,
          encounterId: enc.id,
          overdueCount: overdueItems.length,
          items: overdueItems.map(i => ({ drug: i.drugName, scheduled: i.scheduledTime }))
        });
      }
    }

    return allOverdue;
  }
}
