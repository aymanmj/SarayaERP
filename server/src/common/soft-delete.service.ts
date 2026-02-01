import { Injectable, NotFoundException } from '@nestjs/common';

interface SoftDeleteOptions {
  notFoundMessage: string;
  where: any;            // شروط البحث عن السجل (مثلاً { id, hospitalId, isDeleted: false })
  extraUpdateData?: any; // حقول إضافية نريد تعديلها (مثلاً isActive: false)
}

/**
 * خدمة عامة لإجراء soft delete لأي جدول يدعم:
 * - findFirst({ where })
 * - update({ where: { id }, data })
 */
@Injectable()
export class SoftDeleteService {
  /**
   * delegate هو كائن Prisma مثل prisma.patient أو prisma.encounter أو prisma.serviceItem ...
   */
  async softDelete(
    delegate: { findFirst: Function; update: Function },
    options: SoftDeleteOptions,
    userId: number,
  ) {
    const record = await delegate.findFirst({
      where: options.where,
    });

    if (!record) {
      throw new NotFoundException(options.notFoundMessage);
    }

    const now = new Date();

    await delegate.update({
      where: { id: record.id },
      data: {
        isDeleted: true,
        deletedAt: now,
        deletedById: userId,
        ...(options.extraUpdateData ?? {}),
      },
    });

    return { success: true };
  }
}
