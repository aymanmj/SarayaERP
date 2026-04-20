import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ClinicalContentEventType,
  ClinicalContentStatus,
  PathwayEnrollmentStatus,
  Prisma,
  VarianceType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderSetsService } from '../order-sets/order-sets.service';

type PathwayStepInput = {
  dayNumber: number;
  phase?: string;
  title: string;
  titleAr?: string;
  description?: string;
  orderSetId?: number;
  expectedOutcome?: string;
  milestones?: string;
  sortOrder?: number;
};

type ClinicalPathwayPayload = {
  name: string;
  nameAr?: string;
  description?: string;
  targetDiagnosis?: string;
  expectedLOS?: number;
  changeSummary?: string;
  steps?: PathwayStepInput[];
};

type ClinicalPathwayQueryFilters = {
  search?: string;
  scope?: 'published' | 'all';
  status?: ClinicalContentStatus;
  contentKey?: string;
};

@Injectable()
export class ClinicalPathwaysService {
  private readonly logger = new Logger(ClinicalPathwaysService.name);

  constructor(
    private prisma: PrismaService,
    private orderSetsService: OrderSetsService,
  ) {}

  private pathwayInclude(includeCounts = false) {
    return {
      steps: {
        include: {
          orderSet: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              version: true,
              status: true,
              _count: { select: { items: true } },
            },
          },
        },
        orderBy: [{ dayNumber: 'asc' as const }, { sortOrder: 'asc' as const }],
      },
      createdBy: { select: { id: true, fullName: true } },
      submittedBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
      publishedBy: { select: { id: true, fullName: true } },
      retiredBy: { select: { id: true, fullName: true } },
      previousVersion: { select: { id: true, version: true, status: true } },
      nextVersions: {
        select: { id: true, version: true, status: true, updatedAt: true },
        orderBy: { version: 'desc' as const },
      },
      reviewEvents: {
        include: { actor: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' as const },
        take: 10,
      },
      ...(includeCounts ? { _count: { select: { steps: true, enrollments: true } } } : {}),
    };
  }

  private buildWhere(hospitalId: number, filters?: ClinicalPathwayQueryFilters): Prisma.ClinicalPathwayWhereInput {
    const scope = filters?.scope === 'all' ? 'all' : 'published';
    const where: Prisma.ClinicalPathwayWhereInput = {
      hospitalId,
      isActive: true,
    };

    if (scope === 'all') {
      where.status = filters?.status ?? {
        in: [
          ClinicalContentStatus.DRAFT,
          ClinicalContentStatus.IN_REVIEW,
          ClinicalContentStatus.APPROVED,
          ClinicalContentStatus.PUBLISHED,
        ],
      };
    } else {
      where.status = ClinicalContentStatus.PUBLISHED;
    }

    if (filters?.contentKey) where.contentKey = filters.contentKey;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { nameAr: { contains: filters.search, mode: 'insensitive' } },
        { targetDiagnosis: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private normalizeSteps(steps?: PathwayStepInput[]) {
    return steps?.map((step, idx) => ({
      dayNumber: step.dayNumber,
      phase: step.phase,
      title: step.title,
      titleAr: step.titleAr,
      description: step.description,
      orderSetId: step.orderSetId,
      expectedOutcome: step.expectedOutcome,
      milestones: step.milestones,
      sortOrder: step.sortOrder ?? idx,
    }));
  }

  private async recordReviewEvent(
    tx: Prisma.TransactionClient,
    pathwayId: number,
    eventType: ClinicalContentEventType,
    actorId?: number,
    notes?: string,
  ) {
    await tx.clinicalPathwayReviewEvent.create({
      data: {
        pathwayId,
        eventType,
        actorId,
        notes,
      },
    });
  }

  private async getPathwayOrThrow(hospitalId: number, id: number) {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id, hospitalId },
      include: this.pathwayInclude(true),
    });

    if (!pathway) throw new NotFoundException('المسار العلاجي غير موجود');
    return pathway;
  }

  private async assertNoPendingVersion(hospitalId: number, contentKey: string, excludeId?: number) {
    const pending = await this.prisma.clinicalPathway.findFirst({
      where: {
        hospitalId,
        contentKey,
        isActive: true,
        status: {
          in: [
            ClinicalContentStatus.DRAFT,
            ClinicalContentStatus.IN_REVIEW,
            ClinicalContentStatus.APPROVED,
          ],
        },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, version: true, status: true },
    });

    if (pending) {
      throw new ForbiddenException(
        `يوجد إصدار قيد العمل بالفعل (v${pending.version} - ${pending.status}). أكمل مساره قبل إنشاء إصدار جديد.`,
      );
    }
  }

  private async getNextVersion(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    contentKey: string,
  ) {
    const latest = await tx.clinicalPathway.findFirst({
      where: { hospitalId, contentKey },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return (latest?.version ?? 0) + 1;
  }

  private async validateLinkedOrderSetsForPublish(
    hospitalId: number,
    steps: Array<{ orderSetId?: number | null }>,
  ) {
    const orderSetIds = [...new Set(steps.map((step) => step.orderSetId).filter(Boolean) as number[])];
    if (orderSetIds.length === 0) return;

    const linked = await this.prisma.orderSet.findMany({
      where: {
        hospitalId,
        id: { in: orderSetIds },
        isActive: true,
      },
      select: { id: true, status: true },
    });

    const invalid = linked.filter((item) => item.status !== ClinicalContentStatus.PUBLISHED);
    const missingCount = orderSetIds.length - linked.length;

    if (invalid.length > 0 || missingCount > 0) {
      throw new ForbiddenException('لا يمكن نشر المسار ما لم تكن كل مجموعات الطلبات المرتبطة منشورة ونشطة');
    }
  }

  // ==================== CRUD ====================

  async create(hospitalId: number, userId: number, data: ClinicalPathwayPayload) {
    const created = await this.prisma.$transaction(async (tx) => {
      const pathway = await tx.clinicalPathway.create({
        data: {
          hospitalId,
          createdById: userId,
          name: data.name,
          nameAr: data.nameAr,
          description: data.description,
          targetDiagnosis: data.targetDiagnosis,
          expectedLOS: data.expectedLOS,
          changeSummary: data.changeSummary,
          steps: data.steps
            ? {
                create: this.normalizeSteps(data.steps),
              }
            : undefined,
        },
      });

      await this.recordReviewEvent(
        tx,
        pathway.id,
        ClinicalContentEventType.CREATED,
        userId,
        data.changeSummary || 'إنشاء أول مسودة',
      );

      return pathway.id;
    });

    return this.findOne(hospitalId, created, 'all');
  }

  async findAll(hospitalId: number, filters?: ClinicalPathwayQueryFilters) {
    return this.prisma.clinicalPathway.findMany({
      where: this.buildWhere(hospitalId, filters),
      include: this.pathwayInclude(true),
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
  }

  async findOne(hospitalId: number, id: number, scope: 'published' | 'all' = 'all') {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: {
        id,
        hospitalId,
        ...(scope === 'published'
          ? { isActive: true, status: ClinicalContentStatus.PUBLISHED }
          : {}),
      },
      include: {
        ...this.pathwayInclude(true),
        steps: {
          include: {
            orderSet: {
              include: {
                items: {
                  include: {
                    labTest: { select: { id: true, name: true, arabicName: true } },
                    radiologyStudy: { select: { id: true, name: true, arabicName: true } },
                    product: { select: { id: true, name: true } },
                    serviceItem: { select: { id: true, name: true } },
                  },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
          orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    });

    if (!pathway) throw new NotFoundException('المسار العلاجي غير موجود');
    return pathway;
  }

  async findHistory(hospitalId: number, id: number) {
    const current = await this.prisma.clinicalPathway.findFirst({
      where: { id, hospitalId },
      select: { contentKey: true },
    });
    if (!current) throw new NotFoundException('المسار العلاجي غير موجود');

    return this.prisma.clinicalPathway.findMany({
      where: { hospitalId, contentKey: current.contentKey },
      include: this.pathwayInclude(),
      orderBy: { version: 'desc' },
    });
  }

  async update(hospitalId: number, id: number, userId: number, data: Partial<ClinicalPathwayPayload>) {
    const existing = await this.prisma.clinicalPathway.findFirst({
      where: { id, hospitalId },
      include: this.pathwayInclude(),
    });
    if (!existing) throw new NotFoundException('المسار العلاجي غير موجود');

    if (existing.status === ClinicalContentStatus.RETIRED) {
      throw new ForbiddenException('لا يمكن تعديل إصدار متقاعد');
    }

    const stepPayload = data.steps ? this.normalizeSteps(data.steps) : undefined;

    if (existing.status === ClinicalContentStatus.DRAFT) {
      const updatedId = await this.prisma.$transaction(async (tx) => {
        if (stepPayload) {
          await tx.clinicalPathwayStep.deleteMany({ where: { pathwayId: id } });
        }

        const updated = await tx.clinicalPathway.update({
          where: { id },
          data: {
            name: data.name,
            nameAr: data.nameAr,
            description: data.description,
            targetDiagnosis: data.targetDiagnosis,
            expectedLOS: data.expectedLOS,
            changeSummary: data.changeSummary ?? existing.changeSummary,
            steps: stepPayload ? { create: stepPayload } : undefined,
          },
        });

        await this.recordReviewEvent(
          tx,
          updated.id,
          ClinicalContentEventType.UPDATED,
          userId,
          data.changeSummary || 'تحديث المسودة الحالية',
        );

        return updated.id;
      });

      return this.findOne(hospitalId, updatedId, 'all');
    }

    await this.assertNoPendingVersion(hospitalId, existing.contentKey, existing.id);

    const draftId = await this.prisma.$transaction(async (tx) => {
      const nextVersion = await this.getNextVersion(tx, hospitalId, existing.contentKey);
      const draft = await tx.clinicalPathway.create({
        data: {
          hospitalId,
          contentKey: existing.contentKey,
          version: nextVersion,
          status: ClinicalContentStatus.DRAFT,
          previousVersionId: existing.id,
          createdById: userId,
          name: data.name ?? existing.name,
          nameAr: data.nameAr ?? existing.nameAr ?? undefined,
          description: data.description ?? existing.description ?? undefined,
          targetDiagnosis: data.targetDiagnosis ?? existing.targetDiagnosis ?? undefined,
          expectedLOS: data.expectedLOS ?? existing.expectedLOS ?? undefined,
          changeSummary: data.changeSummary ?? `نسخة مشتقة من الإصدار v${existing.version}`,
          steps: {
            create:
              stepPayload
              ?? this.normalizeSteps(
                existing.steps.map((step) => ({
                  dayNumber: step.dayNumber,
                  phase: step.phase ?? undefined,
                  title: step.title,
                  titleAr: step.titleAr ?? undefined,
                  description: step.description ?? undefined,
                  orderSetId: step.orderSetId ?? undefined,
                  expectedOutcome: step.expectedOutcome ?? undefined,
                  milestones: step.milestones ?? undefined,
                  sortOrder: step.sortOrder,
                })),
              )!,
          },
        },
      });

      await this.recordReviewEvent(
        tx,
        draft.id,
        ClinicalContentEventType.VERSION_CLONED,
        userId,
        data.changeSummary || `إنشاء مسودة جديدة من الإصدار v${existing.version}`,
      );

      return draft.id;
    });

    return this.findOne(hospitalId, draftId, 'all');
  }

  async submitForReview(hospitalId: number, id: number, userId: number, notes?: string) {
    const pathway = await this.getPathwayOrThrow(hospitalId, id);
    if (pathway.status !== ClinicalContentStatus.DRAFT) {
      throw new ForbiddenException('يمكن إرسال المسودات فقط للمراجعة');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalPathway.update({
        where: { id },
        data: {
          status: ClinicalContentStatus.IN_REVIEW,
          submittedById: userId,
          submittedAt: new Date(),
          reviewNotes: notes,
        },
      });

      await this.recordReviewEvent(
        tx,
        id,
        ClinicalContentEventType.SUBMITTED_FOR_REVIEW,
        userId,
        notes || 'إرسال للمراجعة السريرية',
      );
    });

    return this.findOne(hospitalId, id, 'all');
  }

  async approve(hospitalId: number, id: number, userId: number, notes?: string) {
    const pathway = await this.getPathwayOrThrow(hospitalId, id);
    if (pathway.status !== ClinicalContentStatus.IN_REVIEW) {
      throw new ForbiddenException('يمكن اعتماد إصدار تحت المراجعة فقط');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalPathway.update({
        where: { id },
        data: {
          status: ClinicalContentStatus.APPROVED,
          approvedById: userId,
          approvedAt: new Date(),
          reviewNotes: notes,
        },
      });

      await this.recordReviewEvent(
        tx,
        id,
        ClinicalContentEventType.APPROVED,
        userId,
        notes || 'اعتماد سريري للإصدار',
      );
    });

    return this.findOne(hospitalId, id, 'all');
  }

  async reject(hospitalId: number, id: number, userId: number, notes?: string) {
    const pathway = await this.getPathwayOrThrow(hospitalId, id);
    if (
      pathway.status !== ClinicalContentStatus.IN_REVIEW
      && pathway.status !== ClinicalContentStatus.APPROVED
    ) {
      throw new ForbiddenException('يمكن إرجاع إصدار من المراجعة أو بعد الاعتماد فقط');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalPathway.update({
        where: { id },
        data: {
          status: ClinicalContentStatus.DRAFT,
          approvedById: null,
          approvedAt: null,
          reviewNotes: notes,
        },
      });

      await this.recordReviewEvent(
        tx,
        id,
        ClinicalContentEventType.REJECTED,
        userId,
        notes || 'إرجاع الإصدار إلى مسودة',
      );
    });

    return this.findOne(hospitalId, id, 'all');
  }

  async publish(hospitalId: number, id: number, userId: number, notes?: string) {
    const pathway = await this.getPathwayOrThrow(hospitalId, id);
    if (pathway.status !== ClinicalContentStatus.APPROVED) {
      throw new ForbiddenException('لا يمكن نشر إلا إصدار معتمد');
    }

    await this.validateLinkedOrderSetsForPublish(hospitalId, pathway.steps);

    await this.prisma.$transaction(async (tx) => {
      const previouslyPublished = await tx.clinicalPathway.findMany({
        where: {
          hospitalId,
          contentKey: pathway.contentKey,
          isActive: true,
          status: ClinicalContentStatus.PUBLISHED,
          id: { not: id },
        },
        select: { id: true },
      });

      if (previouslyPublished.length > 0) {
        await tx.clinicalPathway.updateMany({
          where: { id: { in: previouslyPublished.map((item) => item.id) } },
          data: {
            status: ClinicalContentStatus.RETIRED,
            retiredAt: new Date(),
            retiredById: userId,
          },
        });

        for (const previous of previouslyPublished) {
          await this.recordReviewEvent(
            tx,
            previous.id,
            ClinicalContentEventType.RETIRED,
            userId,
            `إحالة إلى التقاعد بسبب نشر إصدار أحدث v${pathway.version}`,
          );
        }
      }

      await tx.clinicalPathway.update({
        where: { id },
        data: {
          status: ClinicalContentStatus.PUBLISHED,
          publishedById: userId,
          publishedAt: new Date(),
          releaseNotes: notes,
        },
      });

      await this.recordReviewEvent(
        tx,
        id,
        ClinicalContentEventType.PUBLISHED,
        userId,
        notes || 'نشر الإصدار للاستخدام التشغيلي',
      );
    });

    return this.findOne(hospitalId, id, 'all');
  }

  async retire(hospitalId: number, id: number, userId: number, notes?: string) {
    const pathway = await this.getPathwayOrThrow(hospitalId, id);
    if (pathway.status === ClinicalContentStatus.RETIRED) {
      return pathway;
    }
    if (pathway.status === ClinicalContentStatus.DRAFT) {
      throw new ForbiddenException('عطّل المسودة بدل استخدام إجراء التقاعد');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalPathway.update({
        where: { id },
        data: {
          status: ClinicalContentStatus.RETIRED,
          retiredById: userId,
          retiredAt: new Date(),
          reviewNotes: notes,
        },
      });

      await this.recordReviewEvent(
        tx,
        id,
        ClinicalContentEventType.RETIRED,
        userId,
        notes || 'تقاعد الإصدار الحالي',
      );
    });

    return this.findOne(hospitalId, id, 'all');
  }

  async remove(hospitalId: number, id: number, userId: number) {
    const existing = await this.getPathwayOrThrow(hospitalId, id);
    if (existing.status === ClinicalContentStatus.PUBLISHED) {
      throw new ForbiddenException('لا يمكن تعطيل نسخة منشورة مباشرة. قم بتقاعدها أو استبدالها أولًا.');
    }

    return this.prisma.clinicalPathway.update({
      where: { id },
      data: {
        isActive: false,
        retiredById: userId,
        retiredAt: new Date(),
        status: ClinicalContentStatus.RETIRED,
      },
      include: this.pathwayInclude(),
    });
  }

  // ==================== ENROLLMENT ====================

  async enroll(hospitalId: number, userId: number, pathwayId: number, encounterId: number, notes?: string) {
    const pathway = await this.findOne(hospitalId, pathwayId, 'published');

    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId, status: 'OPEN' },
      include: { patient: true },
    });
    if (!encounter) throw new ForbiddenException('الحالة المرضية غير موجودة أو مغلقة');

    const existing = await this.prisma.pathwayEnrollment.findUnique({
      where: { pathwayId_encounterId: { pathwayId, encounterId } },
    });
    if (existing) throw new ForbiddenException('المريض مسجل بالفعل في هذا المسار العلاجي');

    const enrollment = await this.prisma.pathwayEnrollment.create({
      data: {
        pathwayId,
        encounterId,
        patientId: encounter.patientId,
        enrolledById: userId,
        notes,
        currentDay: 0,
      },
      include: {
        pathway: {
          include: {
            steps: { orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }] },
          },
        },
      },
    });

    this.logger.log(`Patient ${encounter.patient.fullName} enrolled in pathway "${pathway.name}"`);

    const day0Steps = pathway.steps.filter((step) => step.dayNumber === 0);
    for (const step of day0Steps) {
      if (step.orderSetId) {
        try {
          await this.orderSetsService.execute(hospitalId, userId, step.orderSetId, encounterId);
          this.logger.log(`Auto-executed order set for Day 0 step: ${step.title}`);
        } catch (err: any) {
          this.logger.warn(`Failed to auto-execute Day 0 order set: ${err.message}`);
        }
      }

      const tasksList = step.milestones ? step.milestones.split('\\n').map(t => t.trim()).filter(Boolean) : [step.title];
      for (const t of tasksList) {
        await this.prisma.careTask.create({
          data: {
            enrollmentId: enrollment.id,
            stepId: step.id,
            title: t,
            type: t.toLowerCase().includes('med') ? 'MEDICATION_CHECK' : (t.toLowerCase().includes('assess') ? 'ASSESSMENT' : 'MONITORING'),
          }
        });
      }
    }

    return enrollment;
  }

  async getEnrollment(id: number) {
    const enrollment = await this.prisma.pathwayEnrollment.findUnique({
      where: { id },
      include: {
        pathway: {
          include: {
            steps: {
              include: {
                orderSet: { select: { id: true, name: true, nameAr: true, version: true, status: true } },
                variances: {
                  where: { enrollmentId: id },
                  include: { reportedBy: { select: { id: true, fullName: true } } },
                },
              },
              orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }],
            },
          },
        },
        enrolledBy: { select: { id: true, fullName: true } },
        variances: {
          include: {
            step: { select: { id: true, title: true, dayNumber: true } },
            reportedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { reportedAt: 'desc' },
        },
      },
    });

    if (!enrollment) throw new NotFoundException('التسجيل في المسار غير موجود');
    return enrollment;
  }

  async advanceDay(id: number, userId: number, hospitalId: number) {
    const enrollment = await this.getEnrollment(id);
    if (enrollment.status !== 'ACTIVE') throw new ForbiddenException('المسار غير نشط');

    // 1. Variance Enforcement Check 
    const pendingTasks = await this.prisma.careTask.count({
      where: { 
        enrollmentId: id,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        step: { dayNumber: enrollment.currentDay }
      }
    });

    if (pendingTasks > 0) {
      throw new ForbiddenException('لا يمكن الدفع لليوم التالي. توجد مهام رعاية سريرية لم تكتمل لهذا اليوم. يجب تقييد خرق بروتوكول (Variance) أو إكمال المهام أولاً.');
    }

    const nextDay = enrollment.currentDay + 1;
    const maxDay = Math.max(...enrollment.pathway.steps.map((step) => step.dayNumber));

    const nextDaySteps = enrollment.pathway.steps.filter((step) => step.dayNumber === nextDay);
    for (const step of nextDaySteps) {
      if (step.orderSetId) {
        try {
          await this.orderSetsService.execute(hospitalId, userId, step.orderSetId, enrollment.encounterId);
        } catch (err: any) {
          this.logger.warn(`Failed to auto-execute order set for Day ${nextDay}: ${err.message}`);
        }
      }

      // Generate Tasks for next day
      const tasksList = step.milestones ? step.milestones.split('\\n').map(t => t.trim()).filter(Boolean) : [step.title];
      for (const t of tasksList) {
        await this.prisma.careTask.create({
          data: {
            enrollmentId: enrollment.id,
            stepId: step.id,
            title: t,
            type: t.toLowerCase().includes('med') ? 'MEDICATION_CHECK' : (t.toLowerCase().includes('assess') ? 'ASSESSMENT' : 'MONITORING'),
          }
        });
      }
    }

    const isComplete = nextDay >= maxDay;

    return this.prisma.pathwayEnrollment.update({
      where: { id },
      data: {
        currentDay: nextDay,
        status: isComplete ? PathwayEnrollmentStatus.COMPLETED : PathwayEnrollmentStatus.ACTIVE,
        completedAt: isComplete ? new Date() : undefined,
      },
    });
  }

  async reportVariance(id: number, userId: number, data: {
    stepId: number;
    varianceType: VarianceType;
    reason: string;
  }) {
    const enrollment = await this.prisma.pathwayEnrollment.findUnique({ where: { id } });
    if (!enrollment) throw new NotFoundException('التسجيل في المسار غير موجود');

    return this.prisma.pathwayVariance.create({
      data: {
        enrollmentId: id,
        stepId: data.stepId,
        varianceType: data.varianceType,
        reason: data.reason,
        reportedById: userId,
      },
      include: {
        step: { select: { id: true, title: true, dayNumber: true } },
        reportedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async completeEnrollment(id: number) {
    const enrollment = await this.prisma.pathwayEnrollment.findUnique({ where: { id } });
    if (!enrollment) throw new NotFoundException('التسجيل في المسار غير موجود');

    return this.prisma.pathwayEnrollment.update({
      where: { id },
      data: {
        status: PathwayEnrollmentStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  async getEnrollmentsByEncounter(encounterId: number) {
    return this.prisma.pathwayEnrollment.findMany({
      where: { encounterId },
      include: {
        pathway: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            expectedLOS: true,
            version: true,
            status: true,
          },
        },
        enrolledBy: { select: { id: true, fullName: true } },
        _count: { select: { variances: true } },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }
}
