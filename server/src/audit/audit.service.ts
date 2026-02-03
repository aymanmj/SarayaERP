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

    // Enhanced filtering
    if (query.actionType) {
      if (query.actionType === 'VIEW') {
        where.action = { contains: 'VIEW', mode: 'insensitive' };
      } else if (query.actionType === 'CREATE') {
        where.action = { contains: 'CREATE', mode: 'insensitive' };
      } else if (query.actionType === 'UPDATE') {
        where.action = { contains: 'UPDATE', mode: 'insensitive' };
      } else if (query.actionType === 'DELETE') {
        where.action = { contains: 'DELETE', mode: 'insensitive' };
      } else if (query.actionType === 'WRITE') {
        where.action = { not: { contains: 'VIEW', mode: 'insensitive' } };
      }
    }

    if (query.entity) {
      where.entity = { contains: query.entity, mode: 'insensitive' };
    }
    
    if (query.userId) {
      where.userId = Number(query.userId);
    }

    // Date range filtering
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    // Search in multiple fields
    if (query.q) {
      where.OR = [
        { action: { contains: query.q, mode: 'insensitive' } },
        { entity: { contains: query.q, mode: 'insensitive' } },
        { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
        { user: { username: { contains: query.q, mode: 'insensitive' } } },
        { ipAddress: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    // Pagination
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await this.prisma.auditLog.count({ where });

    // Get logs with pagination
    const logs = await this.prisma.auditLog.findMany({
      where,
      include: { 
        user: { 
          select: { 
            fullName: true, 
            username: true 
          } 
        } 
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // Return paginated response
    return {
      logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
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
