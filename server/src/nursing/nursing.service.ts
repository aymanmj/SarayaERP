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
} from '@prisma/client';

@Injectable()
export class NursingService {
  constructor(private prisma: PrismaService) {}

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
}
