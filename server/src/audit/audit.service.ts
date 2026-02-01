import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface AuditLogOptions {
  hospitalId?: number | null;
  userId?: number | null;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  ipAddress?: string | null;
  clientName?: string | null;
  details?: any;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(options: AuditLogOptions): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          hospitalId: options.hospitalId ?? null,
          userId: options.userId ?? null,
          action: options.action,
          entity: options.entity ?? null,
          entityId: options.entityId ?? null,
          ipAddress: options.ipAddress ?? null,
          clientName: options.clientName ?? null,
          details: options.details ?? null,
        },
      });
    } catch (err) {
      // مهم جدًا: لا نسمح للـ audit أنه يكسر الـ API
      // لذلك نبلع الخطأ هنا
      // console.error('Audit log error', err);
    }
  }

  async findAll(hospitalId: number, query: any) {
    const where: any = { hospitalId };

    if (query.actionType === 'VIEW') {
      where.action = { contains: 'VIEW' };
    } else if (query.actionType === 'WRITE') {
      where.action = { not: { contains: 'VIEW' } };
    }

    if (query.entity)
      where.entity = { contains: query.entity, mode: 'insensitive' };
    if (query.userId) where.userId = Number(query.userId);

    return this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { fullName: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // async findAll(hospitalId: number, query: any) {
  //   const where: Prisma.AuditLogWhereInput = { hospitalId };

  //   // فلترة حسب نوع العملية
  //   if (query.actionType === 'VIEW') {
  //     where.action = { contains: 'VIEW', mode: 'insensitive' };
  //   } else if (query.actionType === 'WRITE') {
  //     // أي شيء ليس VIEW نعتبره تعديل
  //     where.action = { not: { contains: 'VIEW', mode: 'insensitive' } };
  //   }

  //   // فلترة حسب الكيان (مرضى، فواتير...)
  //   if (query.entity) {
  //     where.entity = { contains: query.entity, mode: 'insensitive' };
  //   }

  //   // فلترة حسب المستخدم
  //   if (query.userId) {
  //     const uId = Number(query.userId);
  //     if (!isNaN(uId)) where.userId = uId;
  //   }

  //   return this.prisma.auditLog.findMany({
  //     where,
  //     include: {
  //       user: { select: { fullName: true, username: true } },
  //     },
  //     orderBy: { createdAt: 'desc' },
  //     take: 100, // آخر 100 سجل
  //   });
  // }
}
