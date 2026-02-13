// src/patients/patients.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { SoftDeleteService } from '../common/soft-delete.service';
import { createHash } from 'crypto';

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private softDeleteService: SoftDeleteService,
  ) {}

  // توليد رقم ملف تلقائي مع التحقق من التكرار
  private async generateNextMrn(hospitalId: number): Promise<string> {
    // 1. Get the last created patient to guess the next number
    const last = await this.prisma.patient.findFirst({
      where: { hospitalId },
      orderBy: { id: 'desc' },
      select: { mrn: true },
    });

    let nextNumber = 1;
    if (last?.mrn) {
      const match = last.mrn.match(/(\d+)$/);
      if (match) nextNumber = parseInt(match[1], 10) + 1;
    }

    // 2. Loop to find a truly available MRN (Collision Check)
    let mrn = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      mrn = `MRN-${nextNumber.toString().padStart(4, '0')}`;
      const existing = await this.prisma.patient.findFirst({
        where: { mrn },
      });

      if (!existing) {
        isUnique = true;
      } else {
        // If taken, increment and try again
        nextNumber++;
        attempts++;
      }
    }

    if (!isUnique) {
      // Fallback: Use timestamp to guarantee uniqueness if loop fails
      return `MRN-${Date.now().toString().slice(-6)}`;
    }

    return mrn;
  }

  async create(
    hospitalId: number,
    data: Omit<
      Prisma.PatientCreateInput,
      | 'mrn'
      | 'hospital'
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'isDeleted'
      | 'deletedAt'
      | 'deletedById'
    >,
  ) {
    const mrn = await this.generateNextMrn(hospitalId);

    return this.prisma.extended.patient.create({
      data: {
        ...data,
        mrn,
        hospital: { connect: { id: hospitalId } },
      },
    });
  }

  private generateSearchHash(value: string): string | null {
    if (!value) return null;
    return createHash('sha256')
      .update(value.trim().toLowerCase()) // توحيد النص (lowercase) ضروري جداً
      .digest('hex');
  }

  async findAll(params: {
    hospitalId: number;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { hospitalId, page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    // 1. تنظيف وتجهيز مدخل البحث
    const cleanSearch = search?.trim();

    // 2. توليد الـ Hash للبحث (Blind Index)
    // نستخدم نفس الخوارزمية المستخدمة في Prisma Extension (SHA-256)
    const sHash = cleanSearch
      ? createHash('sha256').update(cleanSearch.toLowerCase()).digest('hex')
      : null;

    // 3. بناء شرط البحث المطور
    const where: Prisma.PatientWhereInput = {
      hospitalId,
      isDeleted: false,
      isActive: true,
    };

    if (cleanSearch) {
      where.OR = [
        // أ) الاسم: يبقى بحث نصي جزئي (لأنه غير مشفر لسهولة التعرف)
        { fullName: { contains: cleanSearch, mode: 'insensitive' } },

        // ب) الحقول المشفرة: نستخدم الـ Hash للمطابقة الدقيقة (Exact Match)
        // هذا يضمن أمان البيانات وسرعة الاستعلام (Index performance)
        { mrnHash: sHash },
        { phoneHash: sHash },
        { emailHash: sHash },
        { nationalIdHash: sHash },
        { identityNumberHash: sHash },

        // ج) الرقم الوطني: إذا قمت بإضافة nationalIdHash للسكيما، فقم بتفعيله هنا
        // { nationalIdHash: sHash },
      ];
    }

    // 4. جلب البيانات والعدد الإجمالي في وقت واحد (Transaction)
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.extended.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          insurancePolicy: {
            include: {
              provider: true,
              plan: true,
            },
          },
        },
      }),
      this.prisma.patient.count({ where }),
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

  async findOne(hospitalId: number, id: number) {
    const patient = await this.prisma.extended.patient.findFirst({
      where: {
        id,
        hospitalId,
        isDeleted: false,
      },
      include: {
        insurancePolicy: {
          include: { provider: true, plan: true },
        },
        allergies: true,
      },
    });

    if (!patient) {
      throw new NotFoundException('المريض غير موجود');
    }

    return patient;
  }

  // ✅ [FIXED] تم إصلاح منطق التحديث لتجنب خطأ TypeScript
  async update(hospitalId: number, id: number, data: any) {
    // التأكد من وجود المريض
    await this.findOne(hospitalId, id);

    // فصل حقل insurancePolicyId عن باقي البيانات
    const { insurancePolicyId, ...restData } = data;

    // تجهيز كائن التحديث (Prisma Input)
    const updateInput: Prisma.PatientUpdateInput = {
      ...restData,
    };

    // معالجة منطق ربط/فك ربط التأمين
    if (insurancePolicyId !== undefined) {
      if (insurancePolicyId) {
        // ربط ببوليصة جديدة
        updateInput.insurancePolicy = { connect: { id: insurancePolicyId } };
      } else {
        // إلغاء الربط (تحويله لنقدي)
        updateInput.insurancePolicy = { disconnect: true };
      }
    }

    return this.prisma.extended.patient.update({
      where: { id },
      data: updateInput,
    });
  }

  async softDelete(hospitalId: number, id: number, userId: number) {
    return this.softDeleteService.softDelete(
      this.prisma.patient,
      {
        notFoundMessage: 'المريض غير موجود أو تم حذفه مسبقاً',
        where: { id, hospitalId, isDeleted: false },
        extraUpdateData: { isActive: false },
      },
      userId,
    );
  }

  // 1. إضافة حساسية
  async addAllergy(
    hospitalId: number,
    userId: number,
    data: {
      patientId: number;
      allergen: string;
      severity: string; // MILD, MODERATE, SEVERE
      reaction?: string;
    },
  ) {
    const patient = await this.prisma.extended.patient.findFirst({
      where: { id: data.patientId, hospitalId },
    });

    if (!patient) {
      throw new NotFoundException('المريض غير موجود.');
    }

    return this.prisma.patientAllergy.create({
      data: {
        patientId: data.patientId,
        allergen: data.allergen,
        severity: data.severity,
        reaction: data.reaction,
        // createdById: userId, // لو أضفت هذا الحقل في السكيما
      },
    });
  }

  // 2. جلب الحساسيات
  async getAllergies(hospitalId: number, patientId: number) {
    // التأكد من أن المريض يتبع المستشفى
    const patient = await this.prisma.extended.patient.findFirst({
      where: { id: patientId, hospitalId },
    });
    if (!patient) throw new NotFoundException('المريض غير موجود');

    return this.prisma.patientAllergy.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 3. حذف حساسية
  async removeAllergy(hospitalId: number, id: number) {
    const allergy = await this.prisma.patientAllergy.findUnique({
      where: { id },
      include: { patient: true },
    });

    if (!allergy || allergy.patient.hospitalId !== hospitalId) {
      throw new NotFoundException(
        'سجل الحساسية غير موجود أو لا تملك صلاحية حذفه.',
      );
    }

    return this.prisma.patientAllergy.delete({ where: { id } });
  }
}
