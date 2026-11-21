import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import {
  administer,
  barcodeVerification,
  medicationContext,
  type AdministrationInput,
} from './medication-administration';
import { appendNursingNotification } from './nursing-notification-journal';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EncounterStatus,
  EncounterType,
  AdministrationStatus,
  CareTaskStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { TimeZoneUtils } from '../common/utils/date.util';
import {
  medicationScheduleDate,
  medicationScheduleZone,
  medicationSlots,
} from './medication-schedule';

@Injectable()
export class NursingService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  // 1. جلب قائمة المرضى في عنبر معين (أو كل العنابر) - Ward Dashboard
  async getInpatients(hospitalId: number, wardId?: number) {
    const encounters = await this.prisma.encounter.findMany({
      where: {
        hospitalId,
        type: EncounterType.IPD,
        status: EncounterStatus.OPEN,
        bedAssignments: {
          some: {
            to: null,
            bed: wardId ? { wardId } : {},
          },
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            mrn: true,
            gender: true,
            dateOfBirth: true,
          },
        },
        doctor: {
          select: { fullName: true },
        },
        bedAssignments: {
          where: { to: null },
          include: {
            bed: {
              include: {
                ward: { select: { id: true, name: true } },
                room: { select: { roomNumber: true } },
              },
            },
          },
        },
      },
      orderBy: {
        admissionDate: 'desc',
      },
    });

    return encounters.map((enc) => {
      const assignment = enc.bedAssignments[0];
      return {
        encounterId: enc.id,
        patient: enc.patient,
        doctor: enc.doctor,
        admissionDate: enc.admissionDate,
        bed: assignment
          ? {
              id: assignment.bed.id,
              number: assignment.bed.bedNumber,
              room: assignment.bed.room.roomNumber,
              ward: assignment.bed.ward.name,
              wardId: assignment.bed.ward.id,
            }
          : null,
      };
    });
  }

  // 2. جلب خطة الأدوية للمريض (Medication Administration Record - MAR)
  async getPatientMAR(hospitalId: number, encounterId: number) {
    const prescriptions = await this.prisma.prescription.findMany({
      where: {
        hospitalId,
        encounterId,
        status: { in: ['ACTIVE', 'PARTIALLY_COMPLETED', 'COMPLETED'] },
      },
      include: {
        items: {
          include: { product: true },
        },
        doctor: { select: { fullName: true } },
      },
    });

    const administrations = await this.prisma.medicationAdministration.findMany(
      {
        where: {
          hospitalId,
          encounterId,
        },
        orderBy: { administeredAt: 'desc' },
        include: {
          performer: { select: { fullName: true } },
        },
      },
    );

    return {
      prescriptions,
      administrations,
    };
  }

  // 3. تسجيل إعطاء دواء يدوي (eMAR Manual Action)
  private async administerAndNotify(params: AdministrationInput) {
    const { record, audit } = await this.prisma.$transaction(
      async (tx) => {
        const result = await administer(tx, params);
        if (result.audit) {
          await appendNursingNotification(tx, {
            kind: 'medication',
            hospitalId: params.hospitalId,
            encounterId: params.encounterId,
            recordId: result.record.id,
          });
        }
        return result;
      },
      { timeout: 20000, maxWait: 10000 },
    );
    if (!audit) return record;
    // The committed audit is authoritative; publish only non-clinical metadata.
    publishCommittedCriticalAudit({
      hospitalId: audit.hospitalId,
      userId: audit.userId,
      entity: audit.entity,
      entityId: audit.entityId,
      action: audit.action,
      ipAddress: audit.ipAddress,
      clientName: audit.clientName,
      details: { encounterId: params.encounterId },
    });
    this.eventEmitter.emit('nursing.medication_administered', {
      hospitalId: params.hospitalId,
      encounterId: params.encounterId,
      performerId: params.userId,
      administrationId: record.id,
      prescriptionItemId: params.prescriptionItemId,
      status: record.status,
      administeredAt: record.administeredAt,
    });
    if (record.isEmergencyOverride)
      this.eventEmitter.emit('clinical.variance.clma', {
        hospitalId: params.hospitalId,
        encounterId: params.encounterId,
        performerId: params.userId,
        administrationId: record.id,
        varianceReason: record.varianceReason ?? undefined,
      });
    return record;
  }
  administerMedication(params: AdministrationInput) {
    return this.administerAndNotify(params);
  }

  async verifyFiveRights(
    hospitalId: number,
    encounterId: number,
    prescriptionItemId: number,
    patientBarcode: string,
    drugBarcode: string,
  ) {
    return this.prisma.$transaction(async (tx) =>
      barcodeVerification(
        await medicationContext(
          tx,
          hospitalId,
          encounterId,
          prescriptionItemId,
        ),
        patientBarcode,
        drugBarcode,
      ),
    );
  }

  administerWithBarcode(params: Omit<AdministrationInput, 'status'>) {
    return this.administerAndNotify({
      ...params,
      status: AdministrationStatus.GIVEN,
    });
  }

  // 4. إضافة ملاحظة تمريض
  async addNursingNote(params: {
    hospitalId: number;
    userId: number;
    encounterId: number;
    note: string;
    isShiftHandover: boolean;
  }) {
    if (!params.note.trim() || params.note.length > 4000)
      throw new BadRequestException('ملاحظة التمريض مطلوبة وبحد أقصى4000حرف');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: number }[]
      >`SELECT e.id FROM "Encounter" e JOIN "Patient" p ON p.id=e."patientId" WHERE e.id=${params.encounterId} AND e."hospitalId"=${params.hospitalId} AND p."hospitalId"=${params.hospitalId} AND e."isDeleted"=false FOR SHARE OF e,p`;
      if (rows.length !== 1)
        throw new NotFoundException('الحالة لا تخص المنشأة');
      const note = await tx.nursingNote.create({
        data: {
          hospitalId: params.hospitalId,
          encounterId: params.encounterId,
          createdById: params.userId,
          note: params.note.trim(),
          isShiftHandover: params.isShiftHandover,
        },
      });
      await appendChainedAuditInTransaction(tx, {
        hospitalId: params.hospitalId,
        userId: params.userId,
        action: 'NURSING_NOTE_CREATED',
        entity: 'NursingNote',
        entityId: note.id,
        details: {
          encounterId: params.encounterId,
          isShiftHandover: params.isShiftHandover,
          length: params.note.trim().length,
        },
      });
      return note;
    });
  }

  // 5. جلب ملاحظات التمريض
  async getNursingNotes(hospitalId: number, encounterId: number) {
    return this.prisma.nursingNote.findMany({
      where: { hospitalId, encounterId },
      include: {
        createdBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 6. المهام السريرية (Care Tasks)
  async getCareTasks(hospitalId: number, encounterId: number) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId, isDeleted: false },
      select: { id: true },
    });
    if (!encounter) {
      throw new NotFoundException('الحالة غير موجودة في هذه المنشأة');
    }

    return this.prisma.careTask.findMany({
      where: { enrollment: { encounterId, pathway: { hospitalId } } },
      include: {
        step: { select: { title: true, dayNumber: true } },
        assignedTo: { select: { fullName: true } },
        completedBy: { select: { fullName: true } },
      },
      orderBy: [{ step: { dayNumber: 'desc' } }, { createdAt: 'desc' }],
    });
  }

  async updateCareTaskStatus(
    hospitalId: number,
    userId: number,
    taskId: number,
    status: CareTaskStatus,
    notes?: string,
  ) {
    const existingTask = await this.prisma.careTask.findFirst({
      where: { id: taskId, enrollment: { pathway: { hospitalId } } },
      select: { id: true, enrollment: { select: { encounterId: true } } },
    });
    if (!existingTask) {
      throw new NotFoundException('المهمة السريرية غير موجودة في هذه المنشأة');
    }

    const encounter = await this.prisma.encounter.findFirst({
      where: {
        id: existingTask.enrollment.encounterId,
        hospitalId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!encounter) {
      throw new NotFoundException('المهمة السريرية غير موجودة في هذه المنشأة');
    }

    const data: {
      status: CareTaskStatus;
      notes?: string;
      completedById: number | null;
      completedAt: Date | null;
    } = {
      status,
      notes,
      completedById: null,
      completedAt: null,
    };
    if (status === 'COMPLETED' || status === 'SKIPPED') {
      data.completedById = userId;
      data.completedAt = new Date();
    }
    return this.prisma.careTask.update({
      where: { id: existingTask.id },
      data,
      include: {
        step: { select: { title: true, dayNumber: true } },
        completedBy: { select: { fullName: true } },
      },
    });
  }

  // -----------------------------------------------------------------------
  // 🟢 MAR Schedule & Overdue Alerts - HIMSS Stage 6/7 Target (Sprint 2C)
  // -----------------------------------------------------------------------

  /**
   * توليد جدول مواعيد إعطاء الأدوية (MAR) ليوم محدد
   */
  async generateMARSchedule(
    hospitalId: number,
    encounterId: number,
    targetDate: Date | string = new Date(),
  ) {
    const timezone = await medicationScheduleZone(this.prisma, hospitalId);
    const dateKey = medicationScheduleDate(targetDate, timezone);
    const [prescriptions, administrations] = await Promise.all([
      this.prisma.prescription.findMany({
        where: {
          hospitalId,
          encounterId,
          status: 'ACTIVE',
          createdAt: { lte: TimeZoneUtils.endOfLocalDay(dateKey, timezone) },
          dispenses: { none: { partialClosureReason: { not: null } } },
        },
        select: {
          items: {
            select: {
              id: true,
              frequency: true,
              dose: true,
              route: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.medicationAdministration.findMany({
        where: {
          hospitalId,
          encounterId,
          scheduledSlot: { startsWith: dateKey },
        },
        omit: { requestKey: true, requestFingerprint: true },
      }),
    ]);
    const recorded = new Map<string, (typeof administrations)[number]>();
    for (const admin of administrations) {
      const key = `${admin.prescriptionItemId}:${admin.scheduledSlot}`;
      if (!recorded.has(key) || admin.status !== 'HELD')
        recorded.set(key, admin);
    }
    const now = Date.now();
    const schedule = prescriptions.flatMap(({ items }) =>
      items.flatMap((item) =>
        medicationSlots(item.frequency, dateKey, timezone).map((slot) => {
          const record = recorded.get(`${item.id}:${slot.scheduledSlot}`);
          const scheduledTime = record?.scheduledFor ?? slot.scheduledTime;
          const isOverdue =
            !record && now > scheduledTime.getTime() + 60 * 60 * 1000;
          return {
            ...slot,
            scheduledTime,
            prescriptionItemId: item.id,
            drugName: item.product.name,
            dose: item.dose,
            route: item.route,
            status: record?.status ?? (isOverdue ? 'OVERDUE' : 'PENDING'),
            isOverdue,
            administrationRecord: record ?? null,
          };
        }),
      ),
    );
    return schedule.sort(
      (a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime(),
    );
  }

  /**
   * الكشف عن الأدوية المتأخرة وإطلاق تنبيهات
   */
  async getOverdueMedications(hospitalId: number, encounterId?: number) {
    const activeEncounters = encounterId
      ? [{ id: encounterId }]
      : await this.prisma.encounter.findMany({
          where: { hospitalId, type: 'IPD', status: 'OPEN' },
          select: { id: true },
        });

    const allOverdue: any[] = [];

    for (const enc of activeEncounters) {
      const schedule = await this.generateMARSchedule(
        hospitalId,
        enc.id,
        new Date(),
      );
      const overdueItems = schedule.filter((s) => s.isOverdue);

      if (overdueItems.length > 0) {
        allOverdue.push({
          encounterId: enc.id,
          overdueItems,
        });

        this.eventEmitter.emit('nursing.medication.overdue', {
          hospitalId,
          encounterId: enc.id,
          overdueCount: overdueItems.length,
          items: overdueItems.map((i) => ({
            drug: i.drugName,
            scheduled: i.scheduledTime,
          })),
        });
      }
    }

    return allOverdue;
  }
}
