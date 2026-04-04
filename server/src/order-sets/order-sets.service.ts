import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { LabService } from '../labs/labs.service';
import { RadiologyService } from '../radiology/radiology.service';
import { OrderSetItemType } from '@prisma/client';

@Injectable()
export class OrderSetsService {
  private readonly logger = new Logger(OrderSetsService.name);

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private labService: LabService,
    private radiologyService: RadiologyService,
  ) {}

  // ==================== CRUD ====================

  async create(hospitalId: number, userId: number, data: {
    name: string;
    nameAr?: string;
    description?: string;
    category?: string;
    specialty?: string;
    items?: Array<{
      itemType: OrderSetItemType;
      labTestId?: number;
      radiologyStudyId?: number;
      productId?: number;
      dose?: string;
      route?: string;
      frequency?: string;
      durationDays?: number;
      serviceItemId?: number;
      nursingAction?: string;
      priority?: string;
      instructions?: string;
      isRequired?: boolean;
      sortOrder?: number;
    }>;
  }) {
    return this.prisma.orderSet.create({
      data: {
        hospitalId,
        createdById: userId,
        name: data.name,
        nameAr: data.nameAr,
        description: data.description,
        category: data.category,
        specialty: data.specialty,
        items: data.items ? {
          create: data.items.map((item, idx) => ({
            itemType: item.itemType,
            labTestId: item.labTestId,
            radiologyStudyId: item.radiologyStudyId,
            productId: item.productId,
            dose: item.dose,
            route: item.route,
            frequency: item.frequency,
            durationDays: item.durationDays,
            serviceItemId: item.serviceItemId,
            nursingAction: item.nursingAction,
            priority: item.priority || 'ROUTINE',
            instructions: item.instructions,
            isRequired: item.isRequired ?? true,
            sortOrder: item.sortOrder ?? idx,
          })),
        } : undefined,
      },
      include: {
        items: {
          include: {
            labTest: { select: { id: true, name: true, code: true, arabicName: true } },
            radiologyStudy: { select: { id: true, name: true, code: true, arabicName: true } },
            product: { select: { id: true, name: true, code: true, genericName: true } },
            serviceItem: { select: { id: true, name: true, code: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async findAll(hospitalId: number, filters?: { category?: string; specialty?: string; search?: string }) {
    const where: any = { hospitalId, isActive: true };

    if (filters?.category) where.category = filters.category;
    if (filters?.specialty) where.specialty = filters.specialty;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { nameAr: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.orderSet.findMany({
      where,
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
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(hospitalId: number, id: number) {
    const orderSet = await this.prisma.orderSet.findFirst({
      where: { id, hospitalId },
      include: {
        items: {
          include: {
            labTest: { select: { id: true, name: true, code: true, arabicName: true } },
            radiologyStudy: { select: { id: true, name: true, code: true, arabicName: true, modality: true } },
            product: { select: { id: true, name: true, code: true, genericName: true, form: true } },
            serviceItem: { select: { id: true, name: true, code: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    if (!orderSet) throw new NotFoundException('مجموعة الطلبات غير موجودة');
    return orderSet;
  }

  async update(hospitalId: number, id: number, data: {
    name?: string;
    nameAr?: string;
    description?: string;
    category?: string;
    specialty?: string;
    isActive?: boolean;
    items?: Array<{
      itemType: OrderSetItemType;
      labTestId?: number;
      radiologyStudyId?: number;
      productId?: number;
      dose?: string;
      route?: string;
      frequency?: string;
      durationDays?: number;
      serviceItemId?: number;
      nursingAction?: string;
      priority?: string;
      instructions?: string;
      isRequired?: boolean;
      sortOrder?: number;
    }>;
  }) {
    const existing = await this.prisma.orderSet.findFirst({ where: { id, hospitalId } });
    if (!existing) throw new NotFoundException('مجموعة الطلبات غير موجودة');

    // If items provided, replace all items
    if (data.items) {
      await this.prisma.orderSetItem.deleteMany({ where: { orderSetId: id } });
    }

    return this.prisma.orderSet.update({
      where: { id },
      data: {
        name: data.name,
        nameAr: data.nameAr,
        description: data.description,
        category: data.category,
        specialty: data.specialty,
        isActive: data.isActive,
        items: data.items ? {
          create: data.items.map((item, idx) => ({
            itemType: item.itemType,
            labTestId: item.labTestId,
            radiologyStudyId: item.radiologyStudyId,
            productId: item.productId,
            dose: item.dose,
            route: item.route,
            frequency: item.frequency,
            durationDays: item.durationDays,
            serviceItemId: item.serviceItemId,
            nursingAction: item.nursingAction,
            priority: item.priority || 'ROUTINE',
            instructions: item.instructions,
            isRequired: item.isRequired ?? true,
            sortOrder: item.sortOrder ?? idx,
          })),
        } : undefined,
      },
      include: {
        items: {
          include: {
            labTest: { select: { id: true, name: true, code: true, arabicName: true } },
            radiologyStudy: { select: { id: true, name: true, code: true, arabicName: true } },
            product: { select: { id: true, name: true, code: true } },
            serviceItem: { select: { id: true, name: true, code: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async remove(hospitalId: number, id: number) {
    const existing = await this.prisma.orderSet.findFirst({ where: { id, hospitalId } });
    if (!existing) throw new NotFoundException('مجموعة الطلبات غير موجودة');

    return this.prisma.orderSet.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ==================== EXECUTE ORDER SET ====================

  async execute(hospitalId: number, userId: number, orderSetId: number, encounterId: number) {
    const orderSet = await this.findOne(hospitalId, orderSetId);

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

    // Group items for billing batch
    for (const item of orderSet.items) {
       if (item.itemType === 'LAB' && item.labTestId) {
         labTestIds.push(item.labTestId);
         if (item.instructions) labNotesArr.push(item.instructions);
       } else if (item.itemType === 'RADIOLOGY' && item.radiologyStudyId) {
         radStudyIds.push(item.radiologyStudyId);
         if (item.instructions) radNotesArr.push(item.instructions);
       }
    }

    // 1. Dispatch Lab Orders via LabService to trigger Billing & Invoices
    if (labTestIds.length > 0) {
      try {
         const labResults = await this.labService.createOrdersForEncounter({
            encounterId,
            hospitalId,
            doctorId: userId,
            testIds: labTestIds,
            notes: labNotesArr.length > 0 ? labNotesArr.join(' | ') : `أوامر مختبر من بروتوكول: ${orderSet.name}`,
         });
         results.labOrders.push(...labResults);
         results.total += labResults.length;
      } catch (err: any) {
         this.logger.warn(`Error dispatching Lab Orders in OrderSet: ${err.message}`);
         results.skipped.push(`LAB_BATCH: خطأ - ${err.message}`);
      }
    }

    // 2. Dispatch Radiology Orders via RadiologyService
    if (radStudyIds.length > 0) {
       try {
          const radResults = await this.radiologyService.createOrdersForEncounter({
              encounterId,
              hospitalId,
              doctorId: userId,
              studyIds: radStudyIds,
              notes: radNotesArr.length > 0 ? radNotesArr.join(' | ') : `أوامر أشعة من بروتوكول: ${orderSet.name}`,
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
            // Already handled via batch above
            break;

          case 'MEDICATION':
            if (item.productId) {
              // Create prescription for medication items
              const prescription = await this.prisma.prescription.create({
                data: {
                  hospitalId,
                  encounterId,
                  patientId: encounter.patientId,
                  doctorId: userId,
                  notes: `تم الإنشاء من مجموعة الطلبات: ${orderSet.name}`,
                  items: {
                    create: [{
                      productId: item.productId,
                      dose: item.dose || '1',
                      route: (item.route as any) || 'PO',
                      frequency: (item.frequency as any) || 'OD',
                      durationDays: item.durationDays || 7,
                      quantity: item.durationDays || 7,
                      notes: item.instructions,
                    }],
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
      ...results,
    };
  }

  // ==================== CATEGORIES & SPECIALTIES ====================

  async getCategories(hospitalId: number) {
    const results = await this.prisma.orderSet.findMany({
      where: { hospitalId, isActive: true, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    return results.map(r => r.category).filter(Boolean);
  }

  async getSpecialties(hospitalId: number) {
    const results = await this.prisma.orderSet.findMany({
      where: { hospitalId, isActive: true, specialty: { not: null } },
      select: { specialty: true },
      distinct: ['specialty'],
    });
    return results.map(r => r.specialty).filter(Boolean);
  }
}
