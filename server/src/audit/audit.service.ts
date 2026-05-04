import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { siemLogger } from './siem.logger';
import * as crypto from 'crypto';

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
      // 1- SIEM Logger (Stream to Console for Promtail)
      siemLogger.info({
        message: 'AUDIT_TRAIL',
        ...options
      });

      // 2- DB Storage with ISO 27001 Hash Chain
      await this.createSecureLog(options);
    } catch (err) {
      // مهم جدًا: لا نسمح للـ audit أنه يكسر الـ API للعمليات غير الحرجة
      // لذلك نبلع الخطأ هنا
      // console.error('Audit log error', err);
    }
  }

  /**
   * تسجيل مسار التدقيق للعمليات السريرية والمالية الحرجة.
   * لا يتجاهل الأخطاء أبدًا. إذا فشل التسجيل، يجب أن تفشل العملية لحماية حوكمة النظام.
   */
  async logCritical(options: AuditLogOptions): Promise<void> {
    try {
      // 1- SIEM Logger (Stream to Console for Promtail)
      siemLogger.warn({
        message: 'CRITICAL_AUDIT_TRAIL',
        ...options
      });

      // 2- DB Storage with ISO 27001 Hash Chain
      await this.createSecureLog(options);
    } catch (err) {
      console.error('CRITICAL AUDIT LOG FAILURE', err);
      // Fail explicitly for clinical governance
      throw new Error(`Critical Audit Failure: Cannot proceed with action [${options.action}] without recording audit trail.`);
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

  /**
   * Secure insertion with ISO 27001 Hash Chaining.
   * Uses PostgreSQL advisory locks to prevent race conditions during high-concurrency logging,
   * which causes broken chains due to simultaneous hash calculations.
   */
  private async createSecureLog(options: AuditLogOptions) {
    return this.prisma.$transaction(async (tx) => {
      // Acquire a transaction-level advisory lock specifically for the audit log chain.
      // The lock ID 27001 is used as a symbolic reference to ISO 27001.
      // This forces concurrent audit logs to execute sequentially, preventing chain forks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27001)`;

      // Get the most recent log to continue the chain
      const lastLog = await tx.auditLog.findFirst({
        orderBy: { id: 'desc' },
        select: { hash: true }
      });
      
      const previousHash = lastLog?.hash || 'GENESIS';
      const timestamp = new Date();
      
      // Compute hash: SHA256(previousHash + action + entity + entityId + userId + timestamp)
      const dataToHash = `${previousHash}|${options.action}|${options.entity || ''}|${options.entityId || ''}|${options.userId || ''}|${timestamp.toISOString()}`;
      const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      return tx.auditLog.create({
        data: {
          hospitalId: options.hospitalId ?? null,
          userId: options.userId ?? null,
          action: options.action,
          entity: options.entity ?? null,
          entityId: options.entityId ?? null,
          ipAddress: options.ipAddress ?? null,
          clientName: options.clientName ?? null,
          details: options.details ?? null,
          createdAt: timestamp,
          previousHash,
          hash
        },
      });
    });
  }

  /**
   * Verify the integrity of the audit log chain.
   */
  async verifyChain(): Promise<{ valid: boolean; brokenAtId?: number; message: string }> {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, action: true, entity: true, entityId: true, userId: true, createdAt: true, previousHash: true, hash: true }
    });

    if (logs.length === 0) return { valid: true, message: 'No logs to verify' };

    let expectedPrevious = 'GENESIS';

    for (const log of logs) {
      if (log.previousHash !== expectedPrevious) {
        return { valid: false, brokenAtId: log.id, message: `Chain broken at ID ${log.id}: previousHash mismatch` };
      }

      const dataToHash = `${log.previousHash}|${log.action}|${log.entity || ''}|${log.entityId || ''}|${log.userId || ''}|${log.createdAt.toISOString()}`;
      const computedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      if (log.hash !== computedHash) {
        return { valid: false, brokenAtId: log.id, message: `Chain broken at ID ${log.id}: hash mismatch (data altered)` };
      }

      expectedPrevious = log.hash;
    }

    return { valid: true, message: `Successfully verified ${logs.length} records in the audit chain` };
  }
}
