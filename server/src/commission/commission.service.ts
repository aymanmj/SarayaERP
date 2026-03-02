// src/commission/commission.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceType } from '@prisma/client';

@Injectable()
export class CommissionService {
  constructor(private prisma: PrismaService) {}

  /**
   * جلب جميع قواعد العمولات للمستشفى
   */
  async findAll(hospitalId: number) {
    return this.prisma.commissionRule.findMany({
      where: { hospitalId },
      include: {
        doctor: { select: { id: true, fullName: true } },
      },
      orderBy: [{ serviceType: 'asc' }, { doctorId: 'asc' }],
    });
  }

  /**
   * إنشاء أو تحديث قاعدة عمولة (upsert)
   */
  async upsert(
    hospitalId: number,
    data: {
      serviceType: ServiceType;
      doctorId?: number | null;
      doctorRate: number;
    },
  ) {
    const hospitalRate = Math.round((100 - data.doctorRate) * 100) / 100;
    const doctorId = data.doctorId ?? null;

    // Prisma's upsert doesn't allow null in composite unique where clauses,
    // so we use findFirst + update/create instead.
    const existing = await this.prisma.commissionRule.findFirst({
      where: { hospitalId, serviceType: data.serviceType, doctorId },
    });

    if (existing) {
      return this.prisma.commissionRule.update({
        where: { id: existing.id },
        data: { doctorRate: data.doctorRate, hospitalRate },
      });
    }

    return this.prisma.commissionRule.create({
      data: {
        hospitalId,
        serviceType: data.serviceType,
        doctorId,
        doctorRate: data.doctorRate,
        hospitalRate,
      },
    });
  }

  /**
   * تحديث مجموعة قواعد دفعة واحدة (Bulk upsert)
   */
  async bulkUpsert(
    hospitalId: number,
    rules: Array<{
      serviceType: ServiceType;
      doctorId?: number | null;
      doctorRate: number;
    }>,
  ) {
    const results: Awaited<ReturnType<CommissionService['upsert']>>[] = [];
    for (const rule of rules) {
      const result = await this.upsert(hospitalId, rule);
      results.push(result);
    }
    return results;
  }

  /**
   * حذف قاعدة عمولة
   */
  async remove(hospitalId: number, id: number) {
    const rule = await this.prisma.commissionRule.findFirst({
      where: { id, hospitalId },
    });
    if (!rule) throw new NotFoundException('القاعدة غير موجودة.');
    return this.prisma.commissionRule.delete({ where: { id } });
  }

  /**
   * 🔑 جلب نسبة العمولة لطبيب معين وخدمة معينة
   * الأولوية: نسبة مخصصة للطبيب → نسبة افتراضية حسب الخدمة → 0
   */
  async getDoctorRate(
    hospitalId: number,
    doctorId: number,
    serviceType: ServiceType,
  ): Promise<number> {
    // 1. البحث عن نسبة مخصصة لهذا الطبيب
    const doctorRule = await this.prisma.commissionRule.findFirst({
      where: { hospitalId, serviceType, doctorId, isActive: true },
    });
    if (doctorRule) return Number(doctorRule.doctorRate);

    // 2. البحث عن نسبة افتراضية لنوع الخدمة (doctorId = null)
    const defaultRule = await this.prisma.commissionRule.findFirst({
      where: { hospitalId, serviceType, doctorId: null, isActive: true },
    });
    if (defaultRule) return Number(defaultRule.doctorRate);

    // 3. لا توجد قاعدة
    return 0;
  }
}
