import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClinicalContentEventType, ClinicalContentStatus, OrderSetItemType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LabService } from '../labs/labs.service';
import { RadiologyService } from '../radiology/radiology.service';

type OrderSetItemInput = {
  itemType: OrderSetItemType;
  labTestId?: number;
  radiologyStudyId?: number;
  productId?: number;
  dose?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  serviceItemId?: number;
  terminologyConceptId?: number;
  nursingAction?: string;
  priority?: string;
  instructions?: string;
  isRequired?: boolean;
  sortOrder?: number;
};

type OrderSetPayload = {
  name: string;
  nameAr?: string;
  description?: string;
  category?: string;
  specialty?: string;
  changeSummary?: string;
  items?: OrderSetItemInput[];
};

type OrderSetQueryFilters = {
  category?: string;
  specialty?: string;
  search?: string;
  scope?: 'published' | 'all';
  status?: ClinicalContentStatus;
  contentKey?: string;
};

@Injectable()
export class OrderSetsService {
  private readonly logger = new Logger(OrderSetsService.name);

  constructor(
    private prisma: PrismaService,
    private labService: LabService,
    private radiologyService: RadiologyService,
  ) {}

  private orderSetInclude(includeCounts = false) {
    return {
      items: {
        include: {
          labTest: { select: { id: true, name: true, code: true, arabicName: true } },
          radiologyStudy: { select: { id: true, name: true, code: true, arabicName: true, modality: true } },
          product: { select: { id: true, name: true, code: true, genericName: true, form: true } },
          serviceItem: { select: { id: true, name: true, code: true } },
          terminologyConcept: { select: { id: true, system: true, code: true, display: true, displayAr: true } }
        },
        orderBy: { sortOrder: 'asc' as const },
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
      ...(includeCounts ? { _count: { select: { items: true } } } : {}),
    };
  }

  private buildWhere(hospitalId: number, filters?: OrderSetQueryFilters): Prisma.OrderSetWhereInput {
    const scope = filters?.scope === 'all' ? 'all' : 'published';
    const where: Prisma.OrderSetWhereInput = {
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

    if (filters?.category) where.category = filters.category;
    if (filters?.specialty) where.specialty = filters.specialty;
    if (filters?.contentKey) where.contentKey = filters.contentKey;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { nameAr: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private normalizeItems(items?: OrderSetItemInput[]) {
    return items?.map((item, idx) => ({
      itemType: item.itemType,
      labTestId: item.labTestId,
      radiologyStudyId: item.radiologyStudyId,
      productId: item.productId,
      dose: item.dose,
      route: item.route,
      frequency: item.frequency,
      durationDays: item.durationDays,
      serviceItemId: item.serviceItemId,
      terminologyConceptId: item.terminologyConceptId,
      nursingAction: item.nursingAction,
      priority: item.priority || 'ROUTINE',
      instructions: item.instructions,
      isRequired: item.isRequired ?? true,
      sortOrder: item.sortOrder ?? idx,
    }));
  }

  private async recordReviewEvent(
    tx: Prisma.TransactionClient,
    orderSetId: number,
    eventType: ClinicalContentEventType,
    actorId?: number,
    notes?: string,
  ) {
    await tx.orderSetReviewEvent.create({
      data: {
        orderSetId,
        eventType,
        actorId,
        notes,
      },
    });
  }

  private async getOrderSetOrThrow(hospitalId: number, id: number) {
    const orderSet = await this.prisma.orderSet.findFirst({
      where: { id, hospitalId },
      include: this.orderSetInclude(true),
    });

    if (!orderSet) throw new NotFoundException('مجموعة الطلبات غير موجودة');
    return orderSet;
  }

  private async getOrderSetForExecution(hospitalId: number, id: number) {
    const orderSet = await this.prisma.orderSet.findFirst({
      where: {
        id,
        hospitalId,
        isActive: true,
        status: ClinicalContentStatus.PUBLISHED,
      },
      include: this.orderSetInclude(),
    });

    if (!orderSet) {
      throw new NotFoundException('لا توجد نسخة منشورة ونشطة من مجموعة الطلبات');
    }

    return orderSet;
  }

  private async assertNoPendingVersion(hospitalId: number, contentKey: string, excludeId?: number) {
    const pending = await this.prisma.orderSet.findFirst({
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
    const latest = await tx.orderSet.findFirst({
      where: { hospitalId, contentKey },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return (latest?.version ?? 0) + 1;
  }

  // ==================== CRUD ====================

  async create(hospitalId: number, userId: number, data: OrderSetPayload) {
    const created = await this.prisma.$transaction(async (tx) => {
      const orderSet = await tx.orderSet.create({
        data: {
          hospitalId,
          createdById: userId,
          name: data.name,
          nameAr: data.nameAr,
          description: data.description,
          category: data.category,
          specialty: data.specialty,
          changeSummary: data.changeSummary,
          items: data.items
            ? {
                create: this.normalizeItems(data.items),
              }
            : undefined,
        },
      });

      await this.recordReviewEvent(
        tx,
        orderSet.id,
        ClinicalContentEventType.CREATED,
        userId,
        data.changeSummary || 'إنشاء أول مسودة',
      );

      return orderSet.id;
    });

    return this.findOne(hospitalId, created, 'all');
  }

  async findAll(hospitalId: number, filters?: OrderSetQueryFilters) {
    return this.prisma.orderSet.findMany({
      where: this.buildWhere(hospitalId, filters),
      include: this.orderSetInclude(true),
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
  }

  async findOne(hospitalId: number, id: number, scope: 'published' | 'all' = 'all') {
    const orderSet = await this.prisma.orderSet.findFirst({
      where: {
        id,
        hospitalId,
        ...(scope === 'published'
          ? { isActive: true, status: ClinicalContentStatus.PUBLISHED }
          : {}),
      },
      include: this.orderSetInclude(true),
    });

    if (!orderSet) throw new NotFoundException('مجموعة الطلبات غير موجودة');
    return orderSet;
  }

  async findHistory(hospitalId: number, id: number) {
    const current = await this.prisma.orderSet.findFirst({
      where: { id, hospitalId },
      select: { contentKey: true },
    });
    if (!current) throw new NotFoundException('مجموعة الطلبات غير موجودة');

    return this.prisma.orderSet.findMany({
      where: { hospitalId, contentKey: current.contentKey },
      include: this.orderSetInclude(),
      orderBy: { version: 'desc' },
    });
  }

  async update(hospitalId: number, id: number, userId: number, data: Partial<OrderSetPayload>) {
    const existing = await this.prisma.orderSet.findFirst({
      where: { id, hospitalId },
      include: this.orderSetInclude(),
    });
    if (!existing) throw new NotFoundException('مجموعة الطلبات غير موجودة');

    if (existing.status === ClinicalContentStatus.RETIRED) {
      throw new ForbiddenException('لا يمكن تعديل إصدار متقاعد');
    }

    const itemPayload = data.items ? this.normalizeItems(data.items) : undefined;

    if (existing.status === ClinicalContentStatus.DRAFT) {
      const updatedId = await this.prisma.$transaction(async (tx) => {
        if (itemPayload) {
          await tx.orderSetItem.deleteMany({ where: { orderSetId: id } });
        }

        const updated = await tx.orderSet.update({
          where: { id },
          data: {
            name: data.name,
            nameAr: data.nameAr,
            description: data.description,
            category: data.category,
            specialty: data.specialty,
            changeSummary: data.changeSummary ?? existing.changeSummary,
            items: itemPayload ? { create: itemPayload } : undefined,
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
      const draft = await tx.orderSet.create({
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
          category: data.category ?? existing.category ?? undefined,
          specialty: data.specialty ?? existing.specialty ?? undefined,
          changeSummary: data.changeSummary ?? `نسخة مشتقة من الإصدار v${existing.version}`,
          items: {
            create: itemPayload
              ?? this.normalizeItems(
                existing.items.map((item) => ({
                  itemType: item.itemType,
                  labTestId: item.labTestId ?? undefined,
                  radiologyStudyId: item.radiologyStudyId ?? undefined,
                  productId: item.productId ?? undefined,
                  dose: item.dose ?? undefined,
                  route: item.route ?? undefined,
                  frequency: item.frequency ?? undefined,
                  durationDays: item.durationDays ?? undefined,
                  serviceItemId: item.serviceItemId ?? undefined,
                  nursingAction: item.nursingAction ?? undefined,
                  priority: item.priority,
                  instructions: item.instructions ?? undefined,
                  isRequired: item.isRequired,
                  sortOrder: item.sortOrder,
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
    const orderSet = await this.getOrderSetOrThrow(hospitalId, id);
    if (orderSet.status !== ClinicalContentStatus.DRAFT) {
      throw new ForbiddenException('يمكن إرسال المسودات فقط للمراجعة');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderSet.update({
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
    const orderSet = await this.getOrderSetOrThrow(hospitalId, id);
    if (orderSet.status !== ClinicalContentStatus.IN_REVIEW) {
      throw new ForbiddenException('يمكن اعتماد إصدار تحت المراجعة فقط');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderSet.update({
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
    const orderSet = await this.getOrderSetOrThrow(hospitalId, id);
    if (
      orderSet.status !== ClinicalContentStatus.IN_REVIEW
      && orderSet.status !== ClinicalContentStatus.APPROVED
    ) {
      throw new ForbiddenException('يمكن إرجاع إصدار من المراجعة أو بعد الاعتماد فقط');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderSet.update({
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
    const orderSet = await this.getOrderSetOrThrow(hospitalId, id);
    if (orderSet.status !== ClinicalContentStatus.APPROVED) {
      throw new ForbiddenException('لا يمكن نشر إلا إصدار معتمد');
    }

    await this.prisma.$transaction(async (tx) => {
      const previouslyPublished = await tx.orderSet.findMany({
        where: {
          hospitalId,
          contentKey: orderSet.contentKey,
          isActive: true,
          status: ClinicalContentStatus.PUBLISHED,
          id: { not: id },
        },
        select: { id: true },
      });

      if (previouslyPublished.length > 0) {
        await tx.orderSet.updateMany({
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
            `إحالة إلى التقاعد بسبب نشر إصدار أحدث v${orderSet.version}`,
          );
        }
      }

      await tx.orderSet.update({
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
    const orderSet = await this.getOrderSetOrThrow(hospitalId, id);
    if (orderSet.status === ClinicalContentStatus.RETIRED) {
      return orderSet;
    }
    if (orderSet.status === ClinicalContentStatus.DRAFT) {
      throw new ForbiddenException('عطّل المسودة بدل استخدام إجراء التقاعد');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderSet.update({
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
    const existing = await this.getOrderSetOrThrow(hospitalId, id);
    if (existing.status === ClinicalContentStatus.PUBLISHED) {
      throw new ForbiddenException('لا يمكن تعطيل نسخة منشورة مباشرة. قم بتقاعدها أو استبدالها أولًا.');
    }

    return this.prisma.orderSet.update({
      where: { id },
      data: {
        isActive: false,
        retiredById: userId,
        retiredAt: new Date(),
        status: ClinicalContentStatus.RETIRED,
      },
      include: this.orderSetInclude(),
    });
  }

  // ==================== EXECUTE ORDER SET ====================

  async execute(hospitalId: number, userId: number, orderSetId: number, encounterId: number) {
    const orderSet = await this.getOrderSetForExecution(hospitalId, orderSetId);

    // Verify encounter
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId, status: 'OPEN' },
      include: { patient: true },
    });

    if (!encounter) {
      throw new ForbiddenException('الحالة المرضية غير موجودة أو مغلقة');
    }

    const results = {
      labOrders: [] as any[],
      radiologyOrders: [] as any[],
      prescriptions: [] as any[],
      skipped: [] as string[],
      total: 0,
    };

    const labTestIds: number[] = [];
    const radStudyIds: number[] = [];
    const labNotesArr: string[] = [];
    const radNotesArr: string[] = [];

    for (const item of orderSet.items) {
      if (item.itemType === 'LAB' && item.labTestId) {
        labTestIds.push(item.labTestId);
        if (item.instructions) labNotesArr.push(item.instructions);
      } else if (item.itemType === 'RADIOLOGY' && item.radiologyStudyId) {
        radStudyIds.push(item.radiologyStudyId);
        if (item.instructions) radNotesArr.push(item.instructions);
      }
    }

    if (labTestIds.length > 0) {
      try {
        const labResults = await this.labService.createOrdersForEncounter({
          encounterId,
          hospitalId,
          doctorId: userId,
          testIds: labTestIds,
          notes:
            labNotesArr.length > 0
              ? labNotesArr.join(' | ')
              : `أوامر مختبر من بروتوكول منشور: ${orderSet.name}`,
        });
        results.labOrders.push(...labResults);
        results.total += labResults.length;
      } catch (err: any) {
        this.logger.warn(`Error dispatching Lab Orders in OrderSet: ${err.message}`);
        results.skipped.push(`LAB_BATCH: خطأ - ${err.message}`);
      }
    }

    if (radStudyIds.length > 0) {
      try {
        const radResults = await this.radiologyService.createOrdersForEncounter({
          encounterId,
          hospitalId,
          doctorId: userId,
          studyIds: radStudyIds,
          notes:
            radNotesArr.length > 0
              ? radNotesArr.join(' | ')
              : `أوامر أشعة من بروتوكول منشور: ${orderSet.name}`,
        });
        results.radiologyOrders.push(...radResults);
        results.total += radResults.length;
      } catch (err: any) {
        this.logger.warn(`Error dispatching Rad Orders in OrderSet: ${err.message}`);
        results.skipped.push(`RADIOLOGY_BATCH: خطأ - ${err.message}`);
      }
    }

    for (const item of orderSet.items) {
      try {
        switch (item.itemType) {
          case 'LAB':
          case 'RADIOLOGY':
            break;
          case 'MEDICATION':
            if (item.productId) {
              const prescription = await this.prisma.prescription.create({
                data: {
                  hospitalId,
                  encounterId,
                  patientId: encounter.patientId,
                  doctorId: userId,
                  notes: `تم الإنشاء من مجموعة الطلبات المنشورة: ${orderSet.name}`,
                  items: {
                    create: [
                      {
                        productId: item.productId,
                        dose: item.dose || '1',
                        route: (item.route as any) || 'PO',
                        frequency: (item.frequency as any) || 'OD',
                        durationDays: item.durationDays || 7,
                        quantity: item.durationDays || 7,
                        notes: item.instructions,
                      },
                    ],
                  },
                },
              });
              results.prescriptions.push(prescription);
              results.total++;
            }
            break;
          case 'NURSING':
          case 'PROCEDURE':
            results.skipped.push(`${item.itemType}: ${item.nursingAction || item.instructions || 'N/A'}`);
            break;
        }
      } catch (err: any) {
        this.logger.warn(`Error executing order set item ${item.id}: ${err.message}`);
        results.skipped.push(`${item.itemType}: خطأ - ${err.message}`);
      }
    }

    this.logger.log(`Order Set "${orderSet.name}" executed for encounter ${encounterId}: ${results.total} orders created`);

    return {
      orderSetName: orderSet.name,
      encounterId,
      patientName: encounter.patient.fullName,
      version: orderSet.version,
      status: orderSet.status,
      ...results,
    };
  }

  // ==================== CATEGORIES & SPECIALTIES ====================

  async getCategories(hospitalId: number) {
    const results = await this.prisma.orderSet.findMany({
      where: {
        hospitalId,
        isActive: true,
        status: ClinicalContentStatus.PUBLISHED,
        category: { not: null },
      },
      select: { category: true },
      distinct: ['category'],
    });
    return results.map((r) => r.category).filter(Boolean);
  }

  async getSpecialties(hospitalId: number) {
    const results = await this.prisma.orderSet.findMany({
      where: {
        hospitalId,
        isActive: true,
        status: ClinicalContentStatus.PUBLISHED,
        specialty: { not: null },
      },
      select: { specialty: true },
      distinct: ['specialty'],
    });
    return results.map((r) => r.specialty).filter(Boolean);
  }
}
