// server/src/labs/lab-qc.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { evaluateWestgardRules } from './westgard-qc.util';
import type {
  CreateLabQcLotDto,
  RecordLabQcRunDto,
  ReviewLabQcRunDto,
} from './dto/lab-qc.dto';

const ADVISORY_LOCK_LAB_QC = 27029;

@Injectable()
export class LabQcService {
  constructor(private readonly prisma: PrismaService) {}

  async listLots(hospitalId: number, testId?: number) {
    return this.prisma.labQcLot.findMany({
      where: {
        hospitalId,
        isActive: true,
        ...(testId ? { testId } : {}),
      },
      include: {
        test: { select: { id: true, code: true, name: true } },
      },
      orderBy: { id: 'desc' },
    });
  }

  async createLot(
    hospitalId: number,
    createdById: number,
    dto: CreateLabQcLotDto,
  ) {
    const { lot, audit } = await this.prisma.$transaction(async (tx) => {
      const test = await tx.labTest.findFirst({
        where: { id: dto.testId, hospitalId, isActive: true, isDeleted: false },
        select: { id: true, code: true, name: true },
      });
      if (!test) {
        throw new NotFoundException('الفحص المخبري غير موجود ضمن المنشأة.');
      }

      const analyzerName = dto.analyzerName.trim();
      const lotNumber = dto.lotNumber.trim();
      const dup = await tx.labQcLot.findUnique({
        where: {
          hospitalId_testId_analyzerName_lotNumber_level: {
            hospitalId,
            testId: test.id,
            analyzerName,
            lotNumber,
            level: dto.level,
          },
        },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          `تشغيلة ضبط الجودة (${lotNumber} / ${dto.level}) مسجلة مسبقًا لهذا الجهاز.`,
        );
      }

      const created = await tx.labQcLot.create({
        data: {
          hospitalId,
          testId: test.id,
          analyzerName,
          lotNumber,
          level: dto.level,
          targetMean: Money.toUnitDbString(dto.targetMean),
          targetSd: Money.toUnitDbString(dto.targetSd),
          unit: dto.unit?.trim() || null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          isActive: true,
          createdById,
        },
        include: { test: { select: { id: true, code: true, name: true } } },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: createdById,
        action: 'LAB_QC_LOT_CREATED',
        entity: 'LabQcLot',
        entityId: created.id,
        details: {
          testCode: test.code,
          analyzerName,
          lotNumber,
          level: dto.level,
          targetMean: Money.toUnitDbString(dto.targetMean),
          targetSd: Money.toUnitDbString(dto.targetSd),
        },
      });

      return { lot: created, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return lot;
  }

  async recordRun(
    hospitalId: number,
    performedById: number,
    dto: RecordLabQcRunDto,
  ) {
    const { run, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_LAB_QC}::int, ${hospitalId}::int)`;

      const lot = await tx.labQcLot.findFirst({
        where: { id: dto.qcLotId, hospitalId, isActive: true },
      });
      if (!lot) {
        throw new NotFoundException(
          'تشغيلة ضبط الجودة غير موجودة ضمن المنشأة.',
        );
      }

      const recentRuns = await tx.labQcRun.findMany({
        where: { hospitalId, qcLotId: lot.id },
        orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
        take: 9,
        select: { zScore: true },
      });
      // Reverse to oldest -> newest for chronological Westgard rule evaluation
      const previousZScores = recentRuns
        .reverse()
        .map((r) => r.zScore.toString());

      const evalRes = evaluateWestgardRules(
        dto.measuredValue,
        lot.targetMean.toString(),
        lot.targetSd.toString(),
        previousZScores,
      );

      const created = await tx.labQcRun.create({
        data: {
          hospitalId,
          qcLotId: lot.id,
          measuredValue: Money.toUnitDbString(dto.measuredValue),
          zScore: evalRes.zScore,
          status: evalRes.status,
          violatedRules:
            evalRes.violatedRules as unknown as Prisma.InputJsonValue,
          correctiveAction: dto.correctiveAction?.trim() || null,
          performedById,
          measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: performedById,
        action:
          evalRes.status === 'REJECT'
            ? 'LAB_QC_WESTGARD_REJECTED'
            : 'LAB_QC_RUN_RECORDED',
        entity: 'LabQcRun',
        entityId: created.id,
        details: {
          qcLotId: lot.id,
          measuredValue: Money.toUnitDbString(dto.measuredValue),
          zScore: evalRes.zScore,
          status: evalRes.status,
          violatedRules: evalRes.violatedRules,
        },
      });

      return { run: created, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return run;
  }

  async reviewRun(
    hospitalId: number,
    runId: number,
    reviewedById: number,
    dto: ReviewLabQcRunDto,
  ) {
    const { updated, audit } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.labQcRun.findFirst({
        where: { id: runId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('قراءة ضبط الجودة غير موجودة ضمن المنشأة.');
      }
      if (existing.performedById === reviewedById) {
        throw new ConflictException(
          'رقابة 4 عيون: يجب أن يختلف مراجع الإجراء التصحيحي عن منفّذ فحص الجودة.',
        );
      }

      const saved = await tx.labQcRun.update({
        where: { id: existing.id },
        data: {
          correctiveAction: dto.correctiveAction.trim(),
          reviewedById,
          reviewedAt: new Date(),
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: reviewedById,
        action: 'LAB_QC_RUN_REVIEWED',
        entity: 'LabQcRun',
        entityId: saved.id,
        details: {
          qcLotId: saved.qcLotId,
          status: saved.status,
          correctiveAction: saved.correctiveAction,
        },
      });

      return { updated: saved, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return updated;
  }

  async getLeveyJennings(hospitalId: number, lotId: number, limit = 60) {
    const lot = await this.prisma.labQcLot.findFirst({
      where: { id: lotId, hospitalId },
      include: { test: { select: { id: true, code: true, name: true } } },
    });
    if (!lot) {
      throw new NotFoundException('تشغيلة ضبط الجودة غير موجودة ضمن المنشأة.');
    }

    const runs = await this.prisma.labQcRun.findMany({
      where: { hospitalId, qcLotId: lot.id },
      orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }],
      take: Math.min(200, Math.max(1, limit)),
      include: {
        performedBy: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });

    const mean = Money.decimal(lot.targetMean.toString());
    const sd = Money.decimal(lot.targetSd.toString());

    return {
      lot,
      bands: {
        mean: mean.toFixed(4),
        sd: sd.toFixed(4),
        plus1Sd: mean.plus(sd).toFixed(4),
        minus1Sd: mean.minus(sd).toFixed(4),
        plus2Sd: mean.plus(sd.times(2)).toFixed(4),
        minus2Sd: mean.minus(sd.times(2)).toFixed(4),
        plus3Sd: mean.plus(sd.times(3)).toFixed(4),
        minus3Sd: mean.minus(sd.times(3)).toFixed(4),
      },
      summary: {
        totalRuns: runs.length,
        passCount: runs.filter((r) => r.status === 'PASS').length,
        warningCount: runs.filter((r) => r.status === 'WARNING').length,
        rejectCount: runs.filter((r) => r.status === 'REJECT').length,
      },
      runs,
    };
  }
}
