import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { siemLogger } from './siem.logger';
import {
  appendChainedAudit,
  auditRecordHash,
  sanitizeAuditData,
} from './audit-chain';

interface AuditLogOptions {
  hospitalId?: number | null;
  userId?: number | null;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  ipAddress?: string | null;
  clientName?: string | null;
  details?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(options: AuditLogOptions): Promise<void> {
    try {
      // 1- SIEM Logger (Stream to Console for Promtail)
      siemLogger.info({
        message: 'AUDIT_TRAIL',
        ...(sanitizeAuditData(options) as Record<string, unknown>),
      });

      // 2- DB Storage with ISO 27001 Hash Chain
      await this.createSecureLog(options);
    } catch {
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
        ...(sanitizeAuditData(options) as Record<string, unknown>),
      });

      // 2- DB Storage with ISO 27001 Hash Chain
      await this.createSecureLog(options);
    } catch (err) {
      console.error('CRITICAL AUDIT LOG FAILURE', err);
      // Fail explicitly for clinical governance
      throw new Error(
        `Critical Audit Failure: Cannot proceed with action [${options.action}] without recording audit trail.`,
      );
    }
  }

  async findAll(
    hospitalId: number,
    query: {
      actionType?: string;
      entity?: string;
      userId?: number | string;
      dateFrom?: string | Date;
      dateTo?: string | Date;
      q?: string;
      page?: number | string;
      limit?: number | string;
    },
  ) {
    const where: Prisma.AuditLogWhereInput = { hospitalId };

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
        where.NOT = { action: { contains: 'VIEW', mode: 'insensitive' } };
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
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
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
            username: true,
          },
        },
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
    return appendChainedAudit(this.prisma, {
      hospitalId: options.hospitalId ?? null,
      userId: options.userId ?? null,
      action: options.action,
      entity: options.entity ?? null,
      entityId: options.entityId ?? null,
      ipAddress: options.ipAddress ?? null,
      clientName: options.clientName ?? null,
      details:
        options.details === undefined || options.details === null
          ? Prisma.JsonNull
          : (options.details as Prisma.InputJsonValue),
    });
  }

  /**
   * Verify the integrity of the audit log chain.
   */
  async verifyChain(): Promise<{
    valid: boolean;
    brokenAtId?: number;
    message: string;
  }> {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        userId: true,
        createdAt: true,
        hospitalId: true,
        details: true,
        oldValues: true,
        newValues: true,
        ipAddress: true,
        clientName: true,
        previousHash: true,
        hash: true,
      },
    });

    if (logs.length === 0) return { valid: true, message: 'No logs to verify' };

    let expectedPrevious = 'GENESIS';
    const perHospital = new Map<number | null, string>();

    for (const log of logs) {
      const version = (log.details as { _chainVersion?: number } | null)
        ?._chainVersion;
      const expected =
        version === 2
          ? perHospital.get(log.hospitalId) || 'GENESIS'
          : expectedPrevious;
      if (!log.hash || log.previousHash !== expected) {
        return {
          valid: false,
          brokenAtId: log.id,
          message: `Chain broken at ID ${log.id}: previousHash mismatch`,
        };
      }

      const computedHash = auditRecordHash({
        previousHash: log.previousHash,
        hospitalId: log.hospitalId,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        userId: log.userId,
        createdAt: log.createdAt,
        details: log.details,
        oldValues: log.oldValues,
        newValues: log.newValues,
        ipAddress: log.ipAddress,
        clientName: log.clientName,
      });

      if (log.hash !== computedHash) {
        return {
          valid: false,
          brokenAtId: log.id,
          message: `Chain broken at ID ${log.id}: hash mismatch (data altered)`,
        };
      }

      expectedPrevious = log.hash;
      perHospital.set(log.hospitalId, log.hash);
    }

    return {
      valid: true,
      message: `Successfully verified ${logs.length} records in the audit chain`,
    };
  }
}
