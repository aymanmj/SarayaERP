// src/encounters/encounters.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SoftDeleteService } from '../common/soft-delete.service';
import {
  Prisma,
  EncounterStatus,
  EncounterType,
  BedStatus,
} from '@prisma/client';

@Injectable()
export class EncountersService {
  constructor(
    private prisma: PrismaService,
    private softDeleteService: SoftDeleteService,
  ) {}

  // ... (دوال createEncounter, getEncounterById, listForPatient ... تبقى كما هي)
  async createEncounter(
    hospitalId: number,
    data: {
      patientId: number;
      type: EncounterType;
      departmentId?: number;
      doctorId?: number;
      chiefComplaint?: string;
    },
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: data.patientId, hospitalId, isActive: true },
    });

    if (!patient) {
      throw new NotFoundException('المريض غير موجود في هذه المنشأة');
    }

    // منع فتح حالة تنويم جديدة إذا كان المريض منوماً بالفعل
    if (data.type === EncounterType.IPD) {
      const activeIpd = await this.prisma.encounter.findFirst({
        where: {
          hospitalId,
          patientId: data.patientId,
          type: EncounterType.IPD,
          status: EncounterStatus.OPEN,
        },
      });

      if (activeIpd) {
        throw new BadRequestException(
          `المريض منوم بالفعل حالياً (ملف رقم #${activeIpd.id}). يجب إغلاق ملف التنويم الحالي قبل فتح ملف جديد.`,
        );
      }
    }

    return this.prisma.encounter.create({
      data: {
        hospitalId,
        patientId: data.patientId,
        type: data.type,
        status: EncounterStatus.OPEN,
        departmentId: data.departmentId ?? null,
        doctorId: data.doctorId ?? null,
        chiefComplaint: data.chiefComplaint ?? null,
      },
    });
  }

  async getEncounterById(hospitalId: number, id: number) {
    const enc = await this.prisma.encounter.findFirst({
      where: { id, hospitalId },
      include: {
        patient: true,
        department: true,
        doctor: true,
        visits: true,
        // ✅ [إضافة] جلب بيانات السرير الحالي
        bedAssignments: {
          where: { to: null }, // السرير النشط فقط
          include: {
            bed: {
              include: {
                ward: true, // نحتاج اسم العنبر
              },
            },
          },
        },
      },
    });
    if (!enc) throw new NotFoundException('الملف الطبي (Encounter) غير موجود');
    return enc;
  }

  async listForPatient(hospitalId: number, patientId: number) {
    return this.prisma.encounter.findMany({
      where: { hospitalId, patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async closeEncounter(hospitalId: number, id: number) {
    // هذه الدالة القديمة البسيطة (يمكن إبقاؤها للعيادات الخارجية)
    // لكن للخروج من التنويم سنستخدم الدالة الجديدة بالأسفل
    return this.dischargePatient(hospitalId, id);
  }

  // ✅ [NEW] دالة الخروج الآمن (Discharge & Clearance)
  async dischargePatient(hospitalId: number, encounterId: number) {
    return this.prisma.$transaction(async (tx) => {
      // 1. جلب الحالة مع الفواتير والسرير
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
        include: {
          invoices: true,
          bedAssignments: {
            where: { to: null }, // السرير الحالي
            include: { bed: true },
          },
          // يمكن التحقق من طلبات المختبر المعلقة هنا أيضاً
        },
      });

      if (!encounter || encounter.hospitalId !== hospitalId) {
        throw new NotFoundException('الحالة غير موجودة.');
      }

      if (encounter.status !== EncounterStatus.OPEN) {
        throw new BadRequestException('الحالة مغلقة بالفعل.');
      }

      // 2. التحقق المالي (Financial Clearance)
      // يجب أن يكون المريض قد دفع حصته بالكامل في كل الفواتير الصادرة
      let totalPatientDebt = 0;

      for (const inv of encounter.invoices) {
        if (inv.status === 'CANCELLED') continue;

        // المبلغ المطلوب من المريض = حصته - ما دفعه
        // (إذا كانت الفاتورة نقدي، patientShare سيكون يساوي totalAmount كما ضبطنا سابقاً)
        const patientShare = Number(inv.patientShare);
        const paid = Number(inv.paidAmount);

        const remaining = patientShare - paid;
        if (remaining > 0.01) {
          // سماحية بسيطة للكسور
          totalPatientDebt += remaining;
        }
      }

      if (totalPatientDebt > 0.01) {
        throw new BadRequestException(
          `لا يمكن إجراء الخروج. يوجد مستحقات مالية على المريض بقيمة ${totalPatientDebt.toFixed(3)} دينار. يرجى السداد أولاً.`,
        );
      }

      // يمكن هنا التحقق من وجود بنود غير مفوترة (EncounterCharge with invoiceId=null)
      const uninvoicedCharges = await tx.encounterCharge.count({
        where: { encounterId, invoiceId: null },
      });

      if (uninvoicedCharges > 0) {
        throw new BadRequestException(
          `يوجد ${uninvoicedCharges} بنود (خدمات/أدوية) لم يتم إصدار فواتير لها. يرجى إصدار الفواتير أولاً.`,
        );
      }

      // 3. تحرير السرير (Bed Release)
      // نحول حالة السرير إلى CLEANING لكي لا يتم تسكين مريض آخر فوراً قبل التنظيف
      if (encounter.bedAssignments.length > 0) {
        const assignment = encounter.bedAssignments[0];

        await tx.bedAssignment.update({
          where: { id: assignment.id },
          data: { to: new Date() }, // إنهاء الحجز
        });

        await tx.bed.update({
          where: { id: assignment.bed.id },
          data: { status: BedStatus.CLEANING },
        });
      }

      // 4. إغلاق الحالة
      const updatedEncounter = await tx.encounter.update({
        where: { id: encounterId },
        data: {
          status: EncounterStatus.CLOSED,
          dischargeDate: new Date(),
        },
      });

      return updatedEncounter;
    });
  }

  async listActiveInpatients(hospitalId: number) {
    return this.prisma.encounter.findMany({
      where: {
        hospitalId,
        type: EncounterType.IPD, // تنويم فقط
        status: EncounterStatus.OPEN, // الحالات المفتوحة فقط
      },
      include: {
        patient: {
          select: { id: true, fullName: true, mrn: true },
        },
        doctor: {
          select: { fullName: true },
        },
        bedAssignments: {
          where: { to: null },
          include: {
            bed: {
              include: {
                ward: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: {
        admissionDate: 'desc',
      },
    });
  }

  async softDelete(hospitalId: number, id: number, userId: number) {
    return this.softDeleteService.softDelete(
      this.prisma.encounter,
      {
        notFoundMessage: 'الزيارة (Encounter) غير موجودة أو تم حذفها مسبقاً',
        where: {
          id,
          hospitalId,
          isDeleted: false,
        },
        extraUpdateData: {},
      },
      userId,
    );
  }

  // تعيين طبيب لحالة موجودة
  async assignDoctor(
    hospitalId: number,
    encounterId: number,
    doctorId: number,
  ) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
    });

    if (!encounter || encounter.hospitalId !== hospitalId) {
      throw new NotFoundException('الحالة غير موجودة');
    }

    return this.prisma.encounter.update({
      where: { id: encounterId },
      data: { doctorId },
    });
  }

  // تحويل حالة من طوارئ إلى تنويم
  async admitPatientFromER(
    hospitalId: number,
    encounterId: number,
    departmentId?: number,
  ) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId, hospitalId },
    });

    if (!encounter) throw new NotFoundException('الحالة غير موجودة');

    if (encounter.type !== 'ER') {
      throw new BadRequestException(
        'يمكن تنويم حالات الطوارئ فقط من هذا الإجراء.',
      );
    }

    if (encounter.status !== 'OPEN') {
      throw new BadRequestException('الحالة مغلقة بالفعل.');
    }

    return this.prisma.encounter.update({
      where: { id: encounterId },
      data: {
        type: 'IPD', // تحويل النوع إلى إيواء
        departmentId: departmentId ?? encounter.departmentId,
        admissionDate: new Date(), // تاريخ الدخول الفعلي
        // يبقى الـ status = OPEN حتى يتم الخروج لاحقاً
      },
    });
  }

  // 🛡️ حذف بند طبي (خدمة/تحليل/أشعة) بشكل آمن
  async deleteEncounterCharge(hospitalId: number, chargeId: number) {
    return this.prisma.$transaction(async (tx) => {
      // 1. جلب البند والتأكد من تبعيته للمستشفى
      const charge = await tx.encounterCharge.findFirst({
        where: { id: chargeId, hospitalId },
      });

      if (!charge) {
        throw new NotFoundException('البند الطبي غير موجود.');
      }

      // 2. 🛡️ الحماية المالية: منع الحذف إذا كان البند مرتبطاً بفاتورة
      if (charge.invoiceId) {
        throw new BadRequestException(
          'لا يمكن حذف هذا البند لأنه مدرج بالفعل في فاتورة صادرة. يجب إلغاء الفاتورة أولاً لإعادة البند للحالة القابلة للتعديل.',
        );
      }

      // 3. تنفيذ الحذف
      await tx.encounterCharge.delete({
        where: { id: chargeId },
      });

      return { success: true };
    });
  }

  async findAll(params: {
    hospitalId: number;
    patientId?: number;
    type?: EncounterType;
    status?: EncounterStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      hospitalId,
      patientId,
      type,
      status,
      search,
      page = 1,
      limit = 15,
    } = params;
    const skip = (page - 1) * limit;

    // 1. بناء شروط الفلترة
    const where: Prisma.EncounterWhereInput = {
      hospitalId,
      isDeleted: false,
      patientId: patientId ? Number(patientId) : undefined,
      type: type || undefined,
      status: status || undefined,
      ...(search
        ? {
            OR: [
              {
                patient: {
                  fullName: { contains: search, mode: 'insensitive' },
                },
              },
              { patient: { mrn: { contains: search, mode: 'insensitive' } } },
              { id: isNaN(Number(search)) ? undefined : Number(search) },
            ],
          }
        : {}),
    };

    // 2. الاستعلام مع جلب العلاقات (Include) 👈 هذا هو الجزء الناقص
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.encounter.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          // ✅ جلب بيانات المريض
          patient: {
            select: {
              id: true,
              fullName: true,
              mrn: true,
            },
          },
          // ✅ جلب بيانات الطبيب
          doctor: {
            select: {
              id: true,
              fullName: true,
            },
          },
          // جلب بيانات القسم
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.encounter.count({ where }),
    ]);

    return {
      items,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

}
