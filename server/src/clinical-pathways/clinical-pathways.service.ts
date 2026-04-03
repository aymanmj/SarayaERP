import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderSetsService } from '../order-sets/order-sets.service';
import { PathwayEnrollmentStatus, VarianceType } from '@prisma/client';

@Injectable()
export class ClinicalPathwaysService {
  private readonly logger = new Logger(ClinicalPathwaysService.name);

  constructor(
    private prisma: PrismaService,
    private orderSetsService: OrderSetsService,
  ) {}

  // ==================== CRUD ====================

  async create(hospitalId: number, userId: number, data: {
    name: string;
    nameAr?: string;
    description?: string;
    targetDiagnosis?: string;
    expectedLOS?: number;
    steps?: Array<{
      dayNumber: number;
      phase?: string;
      title: string;
      titleAr?: string;
      description?: string;
      orderSetId?: number;
      expectedOutcome?: string;
      milestones?: string;
      sortOrder?: number;
    }>;
  }) {
    return this.prisma.clinicalPathway.create({
      data: {
        hospitalId,
        createdById: userId,
        name: data.name,
        nameAr: data.nameAr,
        description: data.description,
        targetDiagnosis: data.targetDiagnosis,
        expectedLOS: data.expectedLOS,
        steps: data.steps ? {
          create: data.steps.map((step, idx) => ({
            dayNumber: step.dayNumber,
            phase: step.phase,
            title: step.title,
            titleAr: step.titleAr,
            description: step.description,
            orderSetId: step.orderSetId,
            expectedOutcome: step.expectedOutcome,
            milestones: step.milestones,
            sortOrder: step.sortOrder ?? idx,
          })),
        } : undefined,
      },
      include: {
        steps: {
          include: {
            orderSet: { select: { id: true, name: true, nameAr: true, _count: { select: { items: true } } } },
          },
          orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }],
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async findAll(hospitalId: number, filters?: { search?: string }) {
    const where: any = { hospitalId, isActive: true };

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { nameAr: { contains: filters.search, mode: 'insensitive' } },
        { targetDiagnosis: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.clinicalPathway.findMany({
      where,
      include: {
        steps: {
          orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }],
          include: {
            orderSet: { select: { id: true, name: true, nameAr: true } },
          },
        },
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { steps: true, enrollments: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(hospitalId: number, id: number) {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id, hospitalId },
      include: {
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
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { enrollments: true } },
      },
    });

    if (!pathway) throw new NotFoundException('المسار العلاجي غير موجود');
    return pathway;
  }

  async update(hospitalId: number, id: number, data: {
    name?: string;
    nameAr?: string;
    description?: string;
    targetDiagnosis?: string;
    expectedLOS?: number;
    isActive?: boolean;
    steps?: Array<{
      dayNumber: number;
      phase?: string;
      title: string;
      titleAr?: string;
      description?: string;
      orderSetId?: number;
      expectedOutcome?: string;
      milestones?: string;
      sortOrder?: number;
    }>;
  }) {
    const existing = await this.prisma.clinicalPathway.findFirst({ where: { id, hospitalId } });
    if (!existing) throw new NotFoundException('المسار العلاجي غير موجود');

    if (data.steps) {
      await this.prisma.clinicalPathwayStep.deleteMany({ where: { pathwayId: id } });
    }

    return this.prisma.clinicalPathway.update({
      where: { id },
      data: {
        name: data.name,
        nameAr: data.nameAr,
        description: data.description,
        targetDiagnosis: data.targetDiagnosis,
        expectedLOS: data.expectedLOS,
        isActive: data.isActive,
        steps: data.steps ? {
          create: data.steps.map((step, idx) => ({
            dayNumber: step.dayNumber,
            phase: step.phase,
            title: step.title,
            titleAr: step.titleAr,
            description: step.description,
            orderSetId: step.orderSetId,
            expectedOutcome: step.expectedOutcome,
            milestones: step.milestones,
            sortOrder: step.sortOrder ?? idx,
          })),
        } : undefined,
      },
      include: {
        steps: {
          include: {
            orderSet: { select: { id: true, name: true, nameAr: true } },
          },
          orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    });
  }

  async remove(hospitalId: number, id: number) {
    const existing = await this.prisma.clinicalPathway.findFirst({ where: { id, hospitalId } });
    if (!existing) throw new NotFoundException('المسار العلاجي غير موجود');
    return this.prisma.clinicalPathway.update({ where: { id }, data: { isActive: false } });
  }

  // ==================== ENROLLMENT ====================

  async enroll(hospitalId: number, userId: number, pathwayId: number, encounterId: number, notes?: string) {
    const pathway = await this.findOne(hospitalId, pathwayId);

    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId, status: 'OPEN' },
      include: { patient: true },
    });
    if (!encounter) throw new ForbiddenException('الحالة المرضية غير موجودة أو مغلقة');

    // Check if already enrolled
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

    // Auto-execute Day 0 order sets if any
    const day0Steps = pathway.steps.filter(s => s.dayNumber === 0 && s.orderSetId);
    for (const step of day0Steps) {
      try {
        await this.orderSetsService.execute(hospitalId, userId, step.orderSetId!, encounterId);
        this.logger.log(`Auto-executed order set for Day 0 step: ${step.title}`);
      } catch (err) {
        this.logger.warn(`Failed to auto-execute Day 0 order set: ${err.message}`);
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
                orderSet: { select: { id: true, name: true, nameAr: true } },
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

    const nextDay = enrollment.currentDay + 1;
    const maxDay = Math.max(...enrollment.pathway.steps.map(s => s.dayNumber));

    // Auto-execute order sets for the next day
    const nextDaySteps = enrollment.pathway.steps.filter(s => s.dayNumber === nextDay && s.orderSetId);
    for (const step of nextDaySteps) {
      try {
        await this.orderSetsService.execute(hospitalId, userId, step.orderSetId!, enrollment.encounterId);
      } catch (err) {
        this.logger.warn(`Failed to auto-execute order set for Day ${nextDay}: ${err.message}`);
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
        pathway: { select: { id: true, name: true, nameAr: true, expectedLOS: true } },
        enrolledBy: { select: { id: true, fullName: true } },
        _count: { select: { variances: true } },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }
}
