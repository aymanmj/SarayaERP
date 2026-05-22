// src/quality/quality.service.ts
// =====================================================================
// وحدة الجودة والسلامة المريض — Clinical Incident / Near Miss / CAPA
// =====================================================================

import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { IncidentStatus, CapaStatus, IncidentSeverity } from '@prisma/client';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
} from './dto/create-incident.dto';
import {
  CreateCapaDto,
  UpdateCapaDto,
  VerifyCapaDto,
} from './dto/create-capa.dto';

@Injectable()
export class QualityService {
  private readonly logger = new Logger(QualityService.name);
  private redisClient: Redis;

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') || 6379;
    const password = this.configService.get<string>('REDIS_PASSWORD');
    const isMock = this.configService.get<string>('REDIS_MOCK') === 'true' || process.env.REDIS_MOCK === 'true';

    if (isMock) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('REDIS_MOCK is not allowed in production.');
      }
      const { InMemoryRedis } = require('../common/in-memory-redis');
      this.redisClient = new InMemoryRedis() as any;
      return;
    }

    try {
      this.redisClient = new Redis({
        host,
        port,
        password,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redisClient.on('error', (err) => {
        if (process.env.NODE_ENV === 'production') {
          this.logger.error('Redis connection failed in QualityService. Fallback to In-Memory is disabled in production.', err);
          return;
        }
        this.logger.warn('Redis connection failed in QualityService. Switching to In-Memory Redis fallback.');
        const { InMemoryRedis } = require('../common/in-memory-redis');
        this.redisClient = new InMemoryRedis() as any;
      });
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('Failed to initialize Redis in QualityService. Fallback to In-Memory is disabled in production.', err);
        throw err;
      }
      this.logger.error('Failed to initialize Redis in QualityService, using In-Memory fallback:', err);
      const { InMemoryRedis } = require('../common/in-memory-redis');
      this.redisClient = new InMemoryRedis() as any;
    }
  }

  // ======================== Incident Number Generator ========================

  private async generateIncidentNumber(hospitalId: number): Promise<string> {
    const year = new Date().getFullYear();
    const key = `quality:incident_counter:${hospitalId}`;
    let nextSeq: number;

    try {
      const dbCount = await this.prisma.clinicalIncident.count({
        where: { hospitalId },
      });

      const luaScript = `
        local key = KEYS[1]
        local dbCount = tonumber(ARGV[1])
        local exists = redis.call('EXISTS', key)
        if exists == 0 then
          redis.call('SET', key, dbCount)
        end
        return redis.call('INCR', key)
      `;

      const result = await this.redisClient.eval(luaScript, 1, key, dbCount);
      nextSeq = Number(result);
    } catch (err) {
      this.logger.error(
        `Redis incident counter error, falling back to database:`,
        err,
      );
      const count = await this.prisma.clinicalIncident.count({
        where: { hospitalId },
      });
      nextSeq = count + 1;
    }

    const seq = String(nextSeq).padStart(4, '0');
    return `INC-${year}-${seq}`;
  }

  // ======================== 1. Report Incident ========================

  async reportIncident(
    hospitalId: number,
    reportedById: number,
    dto: CreateIncidentDto,
  ) {
    const incidentNumber = await this.generateIncidentNumber(hospitalId);

    // حساب تاريخ المراجعة بناءً على الخطورة
    const reviewDays: Record<IncidentSeverity, number> = {
      NEAR_MISS: 14,
      MINOR: 7,
      MODERATE: 3,
      MAJOR: 1,
      SENTINEL: 0, // فوري
    };
    const reviewDueDate = new Date();
    reviewDueDate.setDate(reviewDueDate.getDate() + reviewDays[dto.severity]);

    const incident = await this.prisma.clinicalIncident.create({
      data: {
        hospitalId,
        incidentNumber,
        reportedById,
        incidentDate: new Date(dto.incidentDate),
        incidentType: dto.incidentType,
        severity: dto.severity,
        description: dto.description,
        descriptionAr: dto.descriptionAr,
        location: dto.location,
        patientId: dto.patientId,
        isAnonymous: dto.isAnonymous ?? false,
        immediateAction: dto.immediateAction,
        reviewDueDate,
        status: IncidentStatus.REPORTED,
      },
      include: {
        reporter: { select: { id: true, fullName: true } },
        patient: { select: { id: true, mrn: true, fullName: true } },
      },
    });

    this.logger.log(
      `Incident reported: ${incidentNumber} | Severity: ${dto.severity} | Hospital: ${hospitalId}`,
    );

    this.eventEmitter.emit('quality.incident_reported', {
      hospitalId,
      incidentId: incident.id,
      incidentNumber: incident.incidentNumber,
      severity: incident.severity,
      reporterName: incident.reporter?.fullName || 'Anonymous',
    });

    return incident;
  }

  // ======================== 2. List Incidents ========================

  async findAll(params: {
    hospitalId: number;
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    page?: number;
    limit?: number;
  }) {
    const { hospitalId, status, severity, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { hospitalId };
    if (status) where.status = status;
    if (severity) where.severity = severity;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.clinicalIncident.findMany({
        where,
        skip,
        take: limit,
        orderBy: { reportedAt: 'desc' },
        include: {
          reporter: { select: { id: true, fullName: true } },
          patient: { select: { id: true, mrn: true, fullName: true } },
          _count: { select: { capaActions: true } },
        },
      }),
      this.prisma.clinicalIncident.count({ where }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ======================== 3. Get Incident Detail ========================

  async findOne(hospitalId: number, id: number) {
    const incident = await this.prisma.clinicalIncident.findFirst({
      where: { id, hospitalId },
      include: {
        reporter: { select: { id: true, fullName: true } },
        investigator: { select: { id: true, fullName: true } },
        patient: { select: { id: true, mrn: true, fullName: true } },
        capaActions: {
          include: {
            assignedTo: { select: { id: true, fullName: true } },
            verifiedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!incident) throw new NotFoundException('الحادثة غير موجودة');
    return incident;
  }

  // ======================== 4. Update Incident (Investigation) ========================

  async updateIncident(
    hospitalId: number,
    id: number,
    dto: UpdateIncidentDto,
    userId: number,
  ) {
    await this.findOne(hospitalId, id);

    return this.prisma.clinicalIncident.update({
      where: { id },
      data: {
        ...dto,
        investigatedById: dto.investigatedById ?? userId,
      },
    });
  }

  // ======================== 5. Close Incident ========================

  async closeIncident(hospitalId: number, id: number, userId: number) {
    await this.findOne(hospitalId, id);

    // التحقق: يجب أن تكون جميع CAPA مكتملة ومتحققة
    const openCapas = await this.prisma.capaAction.count({
      where: {
        incidentId: id,
        status: { notIn: [CapaStatus.COMPLETED, CapaStatus.VERIFIED] },
      },
    });

    if (openCapas > 0) {
      throw new BadRequestException(
        `لا يمكن إغلاق الحادثة — يوجد ${openCapas} إجراء CAPA لم يُكتمل بعد`,
      );
    }

    return this.prisma.clinicalIncident.update({
      where: { id },
      data: {
        status: IncidentStatus.CLOSED,
        closedAt: new Date(),
        closedById: userId,
      },
    });
  }

  // ======================== 6. Dashboard Stats ========================

  async getDashboardStats(hospitalId: number) {
    const [
      totalByStatus,
      totalBySeverity,
      openCapas,
      overdueCapas,
      recentIncidents,
    ] = await this.prisma.$transaction([
      // توزيع حسب الحالة
      this.prisma.clinicalIncident.groupBy({
        by: ['status'],
        where: { hospitalId },
        _count: true,
        orderBy: { status: 'asc' },
      }),
      // توزيع حسب الخطورة
      this.prisma.clinicalIncident.groupBy({
        by: ['severity'],
        where: { hospitalId },
        _count: true,
        orderBy: { severity: 'asc' },
      }),
      // CAPA مفتوحة
      this.prisma.capaAction.count({
        where: {
          incident: { hospitalId },
          status: { in: [CapaStatus.OPEN, CapaStatus.IN_PROGRESS] },
        },
      }),
      // CAPA متأخرة
      this.prisma.capaAction.count({
        where: {
          incident: { hospitalId },
          status: { notIn: [CapaStatus.COMPLETED, CapaStatus.VERIFIED] },
          dueDate: { lt: new Date() },
        },
      }),
      // آخر 5 حوادث
      this.prisma.clinicalIncident.findMany({
        where: { hospitalId },
        orderBy: { reportedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          incidentNumber: true,
          incidentType: true,
          severity: true,
          status: true,
          reportedAt: true,
        },
      }),
    ]);

    return {
      byStatus: totalByStatus.reduce(
        (acc, r) => ({ ...acc, [r.status]: r._count }),
        {} as Record<string, number>,
      ),
      bySeverity: totalBySeverity.reduce(
        (acc, r) => ({ ...acc, [r.severity]: r._count }),
        {} as Record<string, number>,
      ),
      openCapas,
      overdueCapas,
      recentIncidents,
    };
  }

  // ======================== 7. CAPA Management ========================

  async addCapaAction(hospitalId: number, dto: CreateCapaDto) {
    // التحقق من وجود الحادثة
    const incident = await this.findOne(hospitalId, dto.incidentId);

    if (incident.status === IncidentStatus.CLOSED) {
      throw new BadRequestException('لا يمكن إضافة CAPA لحادثة مغلقة');
    }

    const action = await this.prisma.capaAction.create({
      data: {
        incidentId: dto.incidentId,
        actionType: dto.actionType,
        description: dto.description,
        descriptionAr: dto.descriptionAr,
        assignedToId: dto.assignedToId,
        dueDate: new Date(dto.dueDate),
        status: CapaStatus.OPEN,
      },
      include: {
        assignedTo: { select: { id: true, fullName: true } },
      },
    });

    // تحديث حالة الحادثة إلى CAPA_OPEN
    if (incident.status === IncidentStatus.INVESTIGATED) {
      await this.prisma.clinicalIncident.update({
        where: { id: dto.incidentId },
        data: { status: IncidentStatus.CAPA_OPEN },
      });
    }

    this.eventEmitter.emit('quality.capa_added', {
      hospitalId,
      capaId: action.id,
      incidentId: dto.incidentId,
      actionType: dto.actionType,
      assignedToName: action.assignedTo?.fullName || 'Unknown',
    });

    return action;
  }

  async updateCapaAction(
    hospitalId: number,
    capaId: number,
    dto: UpdateCapaDto,
  ) {
    const capa = await this.prisma.capaAction.findFirst({
      where: {
        id: capaId,
        incident: { hospitalId },
      },
    });

    if (!capa) throw new NotFoundException('إجراء CAPA غير موجود');

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.status === CapaStatus.COMPLETED) {
      updateData.completedAt = new Date();
    }

    return this.prisma.capaAction.update({
      where: { id: capaId },
      data: updateData,
    });
  }

  async verifyCapaAction(
    hospitalId: number,
    capaId: number,
    dto: VerifyCapaDto,
    verifiedById: number,
  ) {
    const capa = await this.prisma.capaAction.findFirst({
      where: {
        id: capaId,
        incident: { hospitalId },
      },
    });

    if (!capa) throw new NotFoundException('إجراء CAPA غير موجود');
    if (capa.status !== CapaStatus.COMPLETED) {
      throw new BadRequestException(
        'لا يمكن التحقق من CAPA قبل اكتمالها — الحالة يجب أن تكون COMPLETED',
      );
    }

    const verified = await this.prisma.capaAction.update({
      where: { id: capaId },
      data: {
        status: CapaStatus.VERIFIED,
        verifiedById,
        verificationNotes: dto.verificationNotes,
        isEffective: dto.isEffective,
        verifiedAt: new Date(),
      },
    });

    // تحديث حالة الحادثة الأم إذا كل CAPA متحققة
    const remainingOpen = await this.prisma.capaAction.count({
      where: {
        incidentId: capa.incidentId,
        status: { notIn: [CapaStatus.VERIFIED] },
      },
    });

    if (remainingOpen === 0) {
      await this.prisma.clinicalIncident.update({
        where: { id: capa.incidentId },
        data: { status: IncidentStatus.CAPA_VERIFIED },
      });
    }

    return verified;
  }

  // ======================== 8. My CAPA Tasks ========================

  async getMyCapaTasks(userId: number) {
    const now = new Date();

    const tasks = await this.prisma.capaAction.findMany({
      where: {
        assignedToId: userId,
        status: { notIn: [CapaStatus.VERIFIED] },
      },
      include: {
        incident: {
          select: {
            id: true,
            incidentNumber: true,
            incidentType: true,
            severity: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    return tasks.map((t) => ({
      ...t,
      isOverdue: t.dueDate < now && t.status !== CapaStatus.COMPLETED,
    }));
  }
}
