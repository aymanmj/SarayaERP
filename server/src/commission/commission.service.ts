// src/commission/commission.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ServiceType } from '@prisma/client';
import { Money } from '../common/utils/money.util';

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
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    if (
      typeof data.doctorRate !== 'number' ||
      !Number.isFinite(data.doctorRate) ||
      data.doctorRate < 0 ||
      data.doctorRate > 100
    ) {
      throw new BadRequestException(
        'نسبة عمولة الطبيب يجب أن تكون بين 0 و 100',
      );
    }

    const doctorRate = Money.to2dp(data.doctorRate);
    const hospitalRate = Money.to2dp(Money.sub(100, doctorRate));
    const doctorId = data.doctorId ?? null;

    if (doctorId !== null) {
      const doctor = await client.user.findFirst({
        where: { id: doctorId, hospitalId, isActive: true, isDeleted: false },
      });
      if (!doctor) {
        throw new NotFoundException(
          'الطبيب غير موجود أو غير نشط في هذه المنشأة.',
        );
      }
    }

    const existing = await client.commissionRule.findFirst({
      where: { hospitalId, serviceType: data.serviceType, doctorId },
    });

    if (existing) {
      return client.commissionRule.update({
        where: { id: existing.id },
        data: { doctorRate, hospitalRate },
      });
    }

    return client.commissionRule.create({
      data: {
        hospitalId,
        serviceType: data.serviceType,
        doctorId,
        doctorRate,
        hospitalRate,
      },
    });
  }

  /**
   * تحديث مجموعة قواعد دفعة واحدة (Bulk upsert) داخل معاملة ذرية
   */
  async bulkUpsert(
    hospitalId: number,
    rules: Array<{
      serviceType: ServiceType;
      doctorId?: number | null;
      doctorRate: number;
    }>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const results: Awaited<ReturnType<CommissionService['upsert']>>[] = [];
      for (const rule of rules) {
        const result = await this.upsert(hospitalId, rule, tx);
        results.push(result);
      }
      return results;
    });
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
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    // 1. البحث عن نسبة مخصصة لهذا الطبيب
    const doctorRule = await client.commissionRule.findFirst({
      where: { hospitalId, serviceType, doctorId, isActive: true },
    });
    if (doctorRule) return Money.fromPrisma(doctorRule.doctorRate);

    // 2. البحث عن نسبة افتراضية لنوع الخدمة (doctorId = null)
    const defaultRule = await client.commissionRule.findFirst({
      where: { hospitalId, serviceType, doctorId: null, isActive: true },
    });
    if (defaultRule) return Money.fromPrisma(defaultRule.doctorRate);

    // 3. لا توجد قاعدة
    return 0;
  }
}
