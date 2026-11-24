// src/radiology/radiology.service.ts

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { enqueueConsumptionIntent } from '../inventory/consumption-intent';
import {
  ChargeSource,
  OrderStatus,
  OrderType,
  Prisma,
  RadiologyStatus,
  RadiologyOrder,
} from '@prisma/client';
import { PriceListsService } from '../price-lists/price-lists.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RadiologyOrderCreatedEvent } from './events/radiology-order-created.event';
import { RadiologyOrderStartedEvent } from './events/radiology-order-started.event';
import {
  lockRadiologyExecution,
  lockRadiologyOrder,
  radiologyReleasedPaymentStatuses,
} from './radiology-release';
import { AccountingService } from '../accounting/accounting.service';
import {
  canReadDepartmentStudies,
  protectedViewerUrl,
} from './radiology-viewer.service';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  composeStructuredReportText,
  computeRadiologyAddendumHash,
  computeRadiologyReportHash,
  evaluateRadiologySafety,
  IONIZING_MODALITIES,
  type RadiologyPregnancyStatus,
  type RadiologySafetyEvaluation,
} from './radiology-report.util';
import type {
  AddRadiologyAddendumDto,
  CreateRadiologyStationDto,
  CreateRadiologyStudyDto,
  CreateRadiologyTemplateDto,
  RecordRadiologyReadBackDto,
  SaveRadiologyReportDto,
} from './dto/radiology-modernization.dto';

const CRITICAL_SLA_MINUTES = 30;
const CREATININE_TEST_PATTERN = /creat|cr\b|كرياتين/i;

@Injectable()
export class RadiologyService {
  constructor(
    private prisma: PrismaService,
    private priceService: PriceListsService,
    private eventEmitter: EventEmitter2,
    private accounting: AccountingService,
  ) {}

  async getCatalog(hospitalId: number) {
    return this.prisma.radiologyStudy.findMany({
      where: { hospitalId, isDeleted: false, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        arabicName: true,
        modality: true,
        bodyPart: true,
        requiresContrast: true,
        contrastType: true,
        ionizingRadiation: true,
        minEgfrThreshold: true,
      },
    });
  }

  async createCatalogStudy(
    hospitalId: number,
    userId: number,
    dto: CreateRadiologyStudyDto,
  ) {
    const code = dto.code.trim().toUpperCase();
    const modality = dto.modality.toUpperCase();
    const ionizingRadiation =
      dto.ionizingRadiation ?? IONIZING_MODALITIES.has(modality);

    if (dto.serviceItemId) {
      const svc = await this.prisma.serviceItem.findFirst({
        where: { id: dto.serviceItemId, hospitalId, isDeleted: false },
        select: { id: true },
      });
      if (!svc) {
        throw new NotFoundException('بند الخدمة غير موجود ضمن المنشأة.');
      }
    }

    const { study, audit } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.radiologyStudy.create({
        data: {
          hospitalId,
          code,
          name: dto.name.trim(),
          arabicName: dto.arabicName?.trim() || null,
          modality,
          bodyPart: dto.bodyPart?.trim() || null,
          requiresContrast: dto.requiresContrast ?? false,
          contrastType: dto.contrastType ?? null,
          ionizingRadiation,
          minEgfrThreshold:
            dto.minEgfrThreshold !== undefined
              ? new Prisma.Decimal(dto.minEgfrThreshold.toFixed(2))
              : null,
          serviceItemId: dto.serviceItemId ?? null,
        },
      });
      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'RADIOLOGY_STUDY_CREATED',
        entity: 'RadiologyStudy',
        entityId: created.id,
        details: {
          code,
          modality,
          requiresContrast: created.requiresContrast,
          ionizingRadiation: created.ionizingRadiation,
        },
      });
      return { study: created, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return study;
  }

  async listTemplates(hospitalId: number, modality?: string) {
    return this.prisma.radiologyReportTemplate.findMany({
      where: {
        hospitalId,
        isActive: true,
        ...(modality
          ? { modality: { equals: modality.trim().toUpperCase() } }
          : {}),
      },
      orderBy: [{ modality: 'asc' }, { title: 'asc' }],
    });
  }

  async createTemplate(
    hospitalId: number,
    userId: number,
    dto: CreateRadiologyTemplateDto,
  ) {
    const code = dto.code.trim().toUpperCase();
    const { template, audit } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.radiologyReportTemplate.create({
        data: {
          hospitalId,
          code,
          title: dto.title.trim(),
          modality: dto.modality?.toUpperCase() || null,
          bodyPart: dto.bodyPart?.trim() || null,
          indicationTemplate: dto.indicationTemplate?.trim() || null,
          techniqueTemplate: dto.techniqueTemplate?.trim() || null,
          findingsTemplate: dto.findingsTemplate?.trim() || null,
          impressionTemplate: dto.impressionTemplate?.trim() || null,
          createdById: userId,
        },
      });
      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'RADIOLOGY_TEMPLATE_CREATED',
        entity: 'RadiologyReportTemplate',
        entityId: created.id,
        details: { code, modality: created.modality },
      });
      return { template: created, audit: auditEntry };
    });
    publishCommittedCriticalAudit(audit);
    return template;
  }

  async listStations(hospitalId: number) {
    return this.prisma.radiologyStation.findMany({
      where: { hospitalId, isActive: true },
      orderBy: [{ modality: 'asc' }, { stationAet: 'asc' }],
    });
  }

  async createStation(
    hospitalId: number,
    userId: number,
    dto: CreateRadiologyStationDto,
  ) {
    const stationAet = dto.stationAet.trim().toUpperCase();
    const modality = dto.modality.toUpperCase();
    const { station, audit } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.radiologyStation.create({
        data: {
          hospitalId,
          stationAet,
          stationName: dto.stationName.trim(),
          modality,
          roomLocation: dto.roomLocation?.trim() || null,
        },
      });
      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'RADIOLOGY_STATION_CREATED',
        entity: 'RadiologyStation',
        entityId: created.id,
        details: { stationAet, modality },
      });
      return { station: created, audit: auditEntry };
    });
    publishCommittedCriticalAudit(audit);
    return station;
  }

  private async fetchPatientSafetyInputs(
    hospitalId: number,
    patientId: number,
  ): Promise<{
    allergies: Array<{ allergen: string; severity?: string | null }>;
    latestCreatinineMgDl: number | null;
  }> {
    const allergies =
      typeof this.prisma.patientAllergy?.findMany === 'function'
        ? await this.prisma.patientAllergy.findMany({
            where: { patientId },
            select: { allergen: true, severity: true },
          })
        : [];

    let latestCreatinineMgDl: number | null = null;
    if (typeof this.prisma.labOrder?.findMany === 'function') {
      const recentLabs = await this.prisma.labOrder.findMany({
        where: {
          resultStatus: 'COMPLETED',
          resultValue: { not: null },
          order: {
            hospitalId,
            isDeleted: false,
            encounter: { patientId, hospitalId },
          },
        },
        include: {
          test: { select: { code: true, name: true } },
        },
        orderBy: { resultDate: 'desc' },
        take: 25,
      });
      const creatOrder = recentLabs.find(
        (lo) =>
          CREATININE_TEST_PATTERN.test(lo.test?.code ?? '') ||
          CREATININE_TEST_PATTERN.test(lo.test?.name ?? ''),
      );
      if (creatOrder?.resultValue) {
        const parsed = Number.parseFloat(creatOrder.resultValue);
        if (Number.isFinite(parsed) && parsed > 0) {
          latestCreatinineMgDl = parsed;
        }
      }
    }

    return { allergies, latestCreatinineMgDl };
  }

  async evaluateSafetyForEncounter(params: {
    encounterId: number;
    hospitalId: number;
    studyIds: number[];
    pregnancyStatus?: RadiologyPregnancyStatus;
    contrastOverrideReason?: string;
    radiationOverrideReason?: string;
  }): Promise<RadiologySafetyEvaluation> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: params.encounterId },
      include: {
        patient: { select: { id: true, gender: true, dateOfBirth: true } },
      },
    });
    if (!encounter || encounter.hospitalId !== params.hospitalId) {
      throw new BadRequestException('هذه الحالة لا تنتمي لهذه المنشأة.');
    }

    const studies = await this.prisma.radiologyStudy.findMany({
      where: {
        id: { in: params.studyIds },
        hospitalId: params.hospitalId,
        isDeleted: false,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        modality: true,
        requiresContrast: true,
        contrastType: true,
        ionizingRadiation: true,
        minEgfrThreshold: true,
      },
    });
    if (studies.length === 0) {
      throw new BadRequestException('لا توجد دراسات أشعة صالحة.');
    }

    const { allergies, latestCreatinineMgDl } =
      await this.fetchPatientSafetyInputs(
        params.hospitalId,
        encounter.patient.id,
      );

    return evaluateRadiologySafety({
      studies: studies.map((s) => ({
        ...s,
        minEgfrThreshold:
          s.minEgfrThreshold !== null && s.minEgfrThreshold !== undefined
            ? Number(s.minEgfrThreshold)
            : null,
      })),
      patient: encounter.patient,
      allergies,
      latestCreatinineMgDl,
      pregnancyStatus: params.pregnancyStatus ?? null,
      contrastOverrideReason: params.contrastOverrideReason ?? null,
      radiationOverrideReason: params.radiationOverrideReason ?? null,
    });
  }

  async listOrdersForEncounter(
    encounterId: number,
    hospitalId: number,
    viewer?: JwtPayload,
  ) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true, hospitalId: true, doctorId: true },
    });
    if (!encounter) throw new NotFoundException('الحالة غير موجودة.');
    if (encounter.hospitalId !== hospitalId)
      throw new BadRequestException('هذه الحالة لا تنتمي لهذه المنشأة.');

    const radOrders = await this.prisma.radiologyOrder.findMany({
      where: {
        order: {
          hospitalId,
          encounterId,
          type: OrderType.RADIOLOGY,
          isDeleted: false,
        },
      },
      include: {
        order: true,
        study: true,
        signedBy: { select: { id: true, fullName: true } },
        reportedBy: { select: { id: true, fullName: true } },
        addenda: {
          orderBy: { addendumNumber: 'asc' },
          include: { author: { select: { id: true, fullName: true } } },
        },
        criticalNotifications: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { id: 'asc' },
    });

    return radOrders.map((ro) => ({
      id: ro.id,
      status: ro.status,
      reportStatus: ro.reportStatus,
      scheduledAt: ro.scheduledAt,
      reportedAt: ro.reportedAt,
      reportText: ro.reportText,
      indicationText: ro.indicationText,
      techniqueText: ro.techniqueText,
      findingsText: ro.findingsText,
      impressionText: ro.impressionText,
      biradsScore: ro.biradsScore,
      isCriticalFinding: ro.isCriticalFinding,
      signedAt: ro.signedAt,
      signatureHash: ro.signatureHash,
      signedBy: ro.signedBy ?? null,
      reportedBy: ro.reportedBy ?? null,
      dicomAccessionNumber: ro.dicomAccessionNumber,
      pacsUrl: ro.dicomStudyUid ? null : ro.pacsUrl,
      viewerUrl:
        viewer &&
        (canReadDepartmentStudies(viewer) ||
          viewer.sub === encounter.doctorId ||
          viewer.sub === ro.order.orderedById)
          ? protectedViewerUrl(ro.id, ro.dicomStudyUid)
          : null,
      addenda: ro.addenda ?? [],
      criticalNotifications: ro.criticalNotifications ?? [],
      study: {
        id: ro.study.id,
        code: ro.study.code,
        name: ro.study.name,
        modality: ro.study.modality,
        bodyPart: ro.study.bodyPart,
        requiresContrast: ro.study.requiresContrast,
        ionizingRadiation: ro.study.ionizingRadiation,
      },
      order: {
        id: ro.order.id,
        status: ro.order.status,
        paymentStatus: ro.order.paymentStatus,
        notes: ro.order.notes,
        createdAt: ro.order.createdAt,
      },
    }));
  }

  async createOrdersForEncounter(params: {
    encounterId: number;
    hospitalId: number;
    doctorId: number;
    studyIds: number[];
    notes?: string;
    pregnancyStatus?: RadiologyPregnancyStatus;
    contrastOverrideReason?: string;
    radiationOverrideReason?: string;
    stationId?: number;
  }) {
    const {
      encounterId,
      hospitalId,
      doctorId,
      studyIds,
      notes,
      pregnancyStatus,
      contrastOverrideReason,
      radiationOverrideReason,
      stationId,
    } = params;

    const encounterInfo = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: { patient: { include: { insurancePolicy: true } } },
    });
    if (!encounterInfo || encounterInfo.hospitalId !== hospitalId) {
      throw new BadRequestException('هذه الحالة لا تنتمي لهذه المنشأة.');
    }
    if (encounterInfo.status && encounterInfo.status !== 'OPEN') {
      throw new ConflictException(
        'لا يمكن إنشاء طلبات أشعة لحالة مغلقة أو ملغاة.',
      );
    }

    const doctorInfo = await this.prisma.user.findUnique({
      where: { id: doctorId },
    });
    if (
      doctorInfo &&
      ((doctorInfo.hospitalId !== undefined &&
        doctorInfo.hospitalId !== hospitalId) ||
        doctorInfo.isActive === false ||
        doctorInfo.isDeleted === true)
    ) {
      throw new BadRequestException('الطبيب المحدّد غير نشط ضمن هذه المنشأة.');
    }

    if (stationId) {
      const station = await this.prisma.radiologyStation.findFirst({
        where: { id: stationId, hospitalId, isActive: true },
        select: { id: true },
      });
      if (!station) {
        throw new NotFoundException('محطة الأشعة المحددة غير متاحة.');
      }
    }

    const uniqueStudyIds = [...new Set(studyIds)];

    const result = await this.prisma.$transaction(async (tx) => {
      const studies = await tx.radiologyStudy.findMany({
        where: {
          id: { in: uniqueStudyIds },
          hospitalId,
          isDeleted: false,
          isActive: true,
        },
        include: { serviceItem: true },
      });

      if (studies.length === 0)
        throw new BadRequestException('لا توجد دراسات أشعة صالحة.');
      if (studies.length !== uniqueStudyIds.length) {
        throw new BadRequestException(
          'بعض دراسات الأشعة المطلوبة غير موجودة أو غير مفعّلة ضمن المنشأة.',
        );
      }

      // Evaluate contrast / eGFR / pregnancy safety before creating orders
      let safetyEvaluation: RadiologySafetyEvaluation | null = null;
      const needsSafetyScreening = studies.some(
        (s) =>
          Boolean(s.requiresContrast) ||
          Boolean(s.ionizingRadiation) ||
          IONIZING_MODALITIES.has((s.modality ?? '').toUpperCase()),
      );
      if (needsSafetyScreening && encounterInfo.patient?.id) {
        const { allergies, latestCreatinineMgDl } =
          await this.fetchPatientSafetyInputs(
            hospitalId,
            encounterInfo.patient.id,
          );
        safetyEvaluation = evaluateRadiologySafety({
          studies: studies.map((s) => ({
            id: s.id,
            code: s.code ?? String(s.id),
            name: s.name,
            modality: s.modality,
            requiresContrast: Boolean(s.requiresContrast),
            contrastType: s.contrastType,
            ionizingRadiation: Boolean(s.ionizingRadiation),
            minEgfrThreshold:
              s.minEgfrThreshold !== null && s.minEgfrThreshold !== undefined
                ? Number(s.minEgfrThreshold)
                : null,
          })),
          patient: {
            gender: encounterInfo.patient.gender,
            dateOfBirth: encounterInfo.patient.dateOfBirth,
          },
          allergies,
          latestCreatinineMgDl,
          pregnancyStatus: pregnancyStatus ?? null,
          contrastOverrideReason: contrastOverrideReason ?? null,
          radiationOverrideReason: radiationOverrideReason ?? null,
        });

        if (!safetyEvaluation.canProceed) {
          const blockers = safetyEvaluation.alerts
            .filter((a) => a.severity === 'HARD_BLOCK')
            .map((a) => a.message)
            .join(' | ');
          throw new ConflictException(blockers);
        }
      }

      const safetyNotes = [
        contrastOverrideReason?.trim()
          ? `تجاوز صبغة موثّق: ${contrastOverrideReason.trim()}`
          : null,
        radiationOverrideReason?.trim()
          ? `تجاوز إشعاعي موثّق: ${radiationOverrideReason.trim()}`
          : null,
      ]
        .filter(Boolean)
        .join(' ; ');

      const created: (RadiologyOrder & { studyName: string })[] = [];
      const chargeIds: number[] = [];
      let totalAmountDec = Money.roundDecimal(0, 3);
      const policyId = encounterInfo.patient.insurancePolicy?.isActive
        ? encounterInfo.patient.insurancePolicy.id
        : null;

      for (const study of studies) {
        const order = await tx.order.create({
          data: {
            hospitalId,
            encounterId,
            orderedById: doctorId,
            type: OrderType.RADIOLOGY,
            status: OrderStatus.NEW,
            notes: notes ?? null,
          },
        });

        const radOrder = await tx.radiologyOrder.create({
          data: {
            orderId: order.id,
            studyId: study.id,
            contrastSafetyChecked: Boolean(study.requiresContrast),
            contrastSafetyNotes: safetyNotes || null,
            pregnancyChecked: Boolean(pregnancyStatus),
            pregnancyStatus: pregnancyStatus ?? null,
            egfrAtOrder:
              safetyEvaluation?.egfr !== null &&
              safetyEvaluation?.egfr !== undefined
                ? new Prisma.Decimal(safetyEvaluation.egfr.toFixed(2))
                : null,
            stationId: stationId ?? null,
          },
        });

        if (study.serviceItem) {
          const rawPrice = await this.priceService.getServicePrice(
            hospitalId,
            study.serviceItem.id,
            policyId,
          );
          const unitPriceDec = Money.roundDecimal(rawPrice, 4);
          const lineTotalDec = Money.roundDecimal(unitPriceDec, 3);

          const charge = await tx.encounterCharge.create({
            data: {
              hospitalId,
              encounterId,
              serviceItemId: study.serviceItem.id,
              sourceType: ChargeSource.RADIOLOGY_ORDER,
              sourceId: radOrder.id,
              quantity: 1,
              unitPrice: Money.toUnitDbString(unitPriceDec),
              totalAmount: Money.toDbString(lineTotalDec),
              performerId: doctorId,
            },
          });
          chargeIds.push(charge.id);
          totalAmountDec = Money.addDecimal(totalAmountDec, lineTotalDec);
        }
        created.push({ ...radOrder, studyName: study.name });
      }

      // ✅ إنشاء فاتورة تلقائية لطلبات الأشعة باستخدام مكتبة الأموال (Money — ROUND_HALF_EVEN)
      if (chargeIds.length > 0 && Money.isPositive(totalAmountDec)) {
        let patientShareDec = totalAmountDec;
        let insuranceShareDec = Money.roundDecimal(0, 3);
        let insuranceProviderId: number | null = null;

        if (encounterInfo.patient.insurancePolicy?.isActive) {
          const copayRatio = Money.divide(
            encounterInfo.patient.insurancePolicy.patientCopayRate ?? 0,
            100,
          );
          patientShareDec = Money.roundDecimal(
            Money.multiply(totalAmountDec, copayRatio),
            3,
          );
          insuranceShareDec = Money.subtractDecimal(
            totalAmountDec,
            patientShareDec,
          );
          insuranceProviderId =
            encounterInfo.patient.insurancePolicy.insuranceProviderId;
        }

        const { financialYear, period } =
          await this.accounting.validateDateInOpenPeriod(
            hospitalId,
            new Date(),
          );

        const invoice = await tx.invoice.create({
          data: {
            hospitalId,
            patientId: encounterInfo.patientId,
            encounterId,
            status: 'ISSUED',
            totalAmount: Money.toDbString(totalAmountDec),
            discountAmount: '0.000',
            paidAmount: '0.000',
            currency: 'LYD',
            patientShare: Money.toDbString(patientShareDec),
            insuranceShare: Money.toDbString(insuranceShareDec),
            insuranceProviderId,
            financialYearId: financialYear.id,
            financialPeriodId: period.id,
          },
        });

        await tx.encounterCharge.updateMany({
          where: { id: { in: chargeIds } },
          data: { invoiceId: invoice.id },
        });
      }

      return created;
    });

    if (result.length > 0) {
      const studyNames = result.map((r) => r.studyName).join(', ');
      this.eventEmitter.emit(
        'radiology.order_created',
        new RadiologyOrderCreatedEvent(
          hospitalId,
          result[0].orderId,
          encounterInfo.patient.fullName,
          doctorInfo?.fullName || 'طبيب',
          studyNames,
        ),
      );
    }

    return result;
  }

  async getWorklist(hospitalId: number) {
    const radOrders = await this.prisma.radiologyOrder.findMany({
      where: {
        status: { not: RadiologyStatus.CANCELLED },
        order: {
          hospitalId,
          type: OrderType.RADIOLOGY,
          isDeleted: false,
          status: { not: OrderStatus.CANCELLED },
          paymentStatus: { in: radiologyReleasedPaymentStatuses },
        },
      },
      include: {
        order: {
          include: {
            encounter: {
              select: {
                id: true,
                patient: { select: { id: true, fullName: true, mrn: true } },
              },
            },
          },
        },
        study: true,
        signedBy: { select: { id: true, fullName: true } },
        reportedBy: { select: { id: true, fullName: true } },
        addenda: {
          orderBy: { addendumNumber: 'asc' },
          include: { author: { select: { id: true, fullName: true } } },
        },
        criticalNotifications: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { id: 'desc' },
      take: 100,
    });

    return radOrders.map((ro) => ({
      id: ro.id,
      status: ro.status,
      reportStatus: ro.reportStatus ?? 'DRAFT',
      reportedAt: ro.reportedAt,
      reportText: ro.reportText,
      indicationText: ro.indicationText ?? null,
      techniqueText: ro.techniqueText ?? null,
      findingsText: ro.findingsText ?? null,
      impressionText: ro.impressionText ?? null,
      biradsScore: ro.biradsScore ?? null,
      isCriticalFinding: Boolean(ro.isCriticalFinding),
      signedAt: ro.signedAt ?? null,
      signatureHash: ro.signatureHash ?? null,
      signedBy: ro.signedBy ?? null,
      reportedBy: ro.reportedBy ?? null,
      dicomAccessionNumber: ro.dicomAccessionNumber ?? null,
      contrastSafetyChecked: Boolean(ro.contrastSafetyChecked),
      contrastSafetyNotes: ro.contrastSafetyNotes ?? null,
      pregnancyStatus: ro.pregnancyStatus ?? null,
      egfrAtOrder: ro.egfrAtOrder ? Number(ro.egfrAtOrder) : null,
      pacsUrl: ro.dicomStudyUid ? null : ro.pacsUrl,
      viewerUrl: protectedViewerUrl(ro.id, ro.dicomStudyUid),
      addenda: ro.addenda ?? [],
      criticalNotifications: ro.criticalNotifications ?? [],
      order: {
        id: ro.order.id,
        status: ro.order.status,
        createdAt: ro.order.createdAt,
        encounterId: ro.order.encounterId,
      },
      patient: ro.order.encounter?.patient ?? null,
      study: {
        id: ro.study.id,
        code: ro.study.code,
        name: ro.study.name,
        modality: ro.study.modality,
        bodyPart: ro.study.bodyPart,
        requiresContrast: Boolean(ro.study.requiresContrast),
        contrastType: ro.study.contrastType ?? null,
        ionizingRadiation: Boolean(ro.study.ionizingRadiation),
      },
    }));
  }

  async getOrderById(hospitalId: number, id: number) {
    const radOrder = await this.prisma.radiologyOrder.findFirst({
      where: { id, order: { hospitalId } },
      include: {
        study: true,
        signedBy: { select: { id: true, fullName: true } },
        reportedBy: { select: { id: true, fullName: true } },
        station: { select: { id: true, stationAet: true, stationName: true } },
        addenda: {
          orderBy: { addendumNumber: 'asc' },
          include: { author: { select: { id: true, fullName: true } } },
        },
        criticalNotifications: {
          orderBy: { createdAt: 'desc' },
          include: {
            notifiedBy: { select: { id: true, fullName: true } },
            notifiedToUser: { select: { id: true, fullName: true } },
          },
        },
        order: {
          include: {
            encounter: { include: { patient: true } },
            orderedBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!radOrder) throw new NotFoundException('طلب الأشعة غير موجود.');

    return {
      id: radOrder.id,
      status: radOrder.status,
      reportStatus: radOrder.reportStatus,
      scheduledAt: radOrder.scheduledAt,
      reportedAt: radOrder.reportedAt,
      reportText: radOrder.reportText,
      indicationText: radOrder.indicationText,
      techniqueText: radOrder.techniqueText,
      findingsText: radOrder.findingsText,
      impressionText: radOrder.impressionText,
      biradsScore: radOrder.biradsScore,
      isCriticalFinding: radOrder.isCriticalFinding,
      signedAt: radOrder.signedAt,
      signatureHash: radOrder.signatureHash,
      signedBy: radOrder.signedBy,
      reportedBy: radOrder.reportedBy,
      contrastSafetyChecked: radOrder.contrastSafetyChecked,
      contrastSafetyNotes: radOrder.contrastSafetyNotes,
      pregnancyStatus: radOrder.pregnancyStatus,
      egfrAtOrder: radOrder.egfrAtOrder ? Number(radOrder.egfrAtOrder) : null,
      station: radOrder.station,
      pacsUrl: radOrder.dicomStudyUid ? null : radOrder.pacsUrl,
      dicomStudyUid: radOrder.dicomStudyUid,
      dicomAccessionNumber: radOrder.dicomAccessionNumber,
      viewerUrl: protectedViewerUrl(radOrder.id, radOrder.dicomStudyUid),
      addenda: radOrder.addenda,
      criticalNotifications: radOrder.criticalNotifications,
      study: radOrder.study,
      order: {
        id: radOrder.order.id,
        status: radOrder.order.status,
        paymentStatus: radOrder.order.paymentStatus,
        createdAt: radOrder.order.createdAt,
        patient: radOrder.order.encounter.patient,
        orderedBy: radOrder.order.orderedBy,
        encounter: { id: radOrder.order.encounter.id },
      },
    };
  }

  async startProcessing(
    hospitalId: number,
    radiologyOrderId: number,
    userId: number,
  ) {
    const { order, started } = await this.prisma.$transaction(async (tx) => {
      await lockRadiologyExecution(tx, hospitalId, radiologyOrderId);
      const order = await tx.radiologyOrder.findUniqueOrThrow({
        where: { id: radiologyOrderId },
        include: { order: true },
      });
      if (
        order.status === RadiologyStatus.COMPLETED ||
        order.status === RadiologyStatus.IN_PROGRESS
      ) {
        return { order, started: false };
      }
      const updated = await tx.radiologyOrder.update({
        where: { id: radiologyOrderId },
        data: { status: RadiologyStatus.IN_PROGRESS },
        include: { order: true },
      });
      return { order: updated, started: true };
    });
    if (started) {
      this.eventEmitter.emit(
        'radiology.order_started',
        new RadiologyOrderStartedEvent(hospitalId, radiologyOrderId, userId),
      );
    }
    return order;
  }

  async completeOrderWithReport(
    params: {
      hospitalId: number;
      radiologyOrderId: number;
      reportedById: number;
    } & SaveRadiologyReportDto,
  ) {
    const { updatedRadOrder, audit } = await this.prisma.$transaction(
      async (tx) => {
        await lockRadiologyExecution(
          tx,
          params.hospitalId,
          params.radiologyOrderId,
          'report',
        );
        const radOrder = await tx.radiologyOrder.findUnique({
          where: { id: params.radiologyOrderId },
        });
        if (!radOrder) throw new NotFoundException('طلب الأشعة غير موجود.');

        if (
          radOrder.reportStatus === 'FINAL' ||
          radOrder.reportStatus === 'AMENDED' ||
          radOrder.signedAt
        ) {
          throw new ConflictException(
            'التقرير الإشعاعي موقّع ومقفل إلكترونيًا؛ لا يمكن تعديله مباشرة، استخدم مسار الملحق الموقّع (Addendum).',
          );
        }

        const order = await tx.order.findUnique({
          where: { id: radOrder.orderId },
          include: {
            encounter: {
              include: { patient: { include: { insurancePolicy: true } } },
            },
          },
        });
        if (!order || order.hospitalId !== params.hospitalId)
          throw new BadRequestException('الطلب غير صالح.');

        const study = await tx.radiologyStudy.findUnique({
          where: { id: radOrder.studyId },
          include: { serviceItem: true },
        });
        if (!study || !study.serviceItem)
          throw new BadRequestException('خدمة الأشعة غير معرفة.');

        const existingCharge = await tx.encounterCharge.findFirst({
          where: {
            hospitalId: order.hospitalId,
            encounterId: order.encounterId,
            sourceType: ChargeSource.RADIOLOGY_ORDER,
            sourceId: radOrder.id,
          },
        });

        if (!existingCharge) {
          const policyId = order.encounter.patient.insurancePolicy?.isActive
            ? order.encounter.patient.insurancePolicy.id
            : null;

          const rawPrice = await this.priceService.getServicePrice(
            order.hospitalId,
            study.serviceItem.id,
            policyId,
          );
          const unitPriceDec = Money.roundDecimal(rawPrice, 4);
          const lineTotalDec = Money.roundDecimal(unitPriceDec, 3);

          await tx.encounterCharge.create({
            data: {
              hospitalId: order.hospitalId,
              encounterId: order.encounterId,
              serviceItemId: study.serviceItem.id,
              sourceType: ChargeSource.RADIOLOGY_ORDER,
              sourceId: radOrder.id,
              quantity: 1,
              unitPrice: Money.toUnitDbString(unitPriceDec),
              totalAmount: Money.toDbString(lineTotalDec),
              performerId: params.reportedById,
            },
          });
        }

        const indicationText =
          params.indicationText !== undefined
            ? params.indicationText.trim() || null
            : radOrder.indicationText;
        const techniqueText =
          params.techniqueText !== undefined
            ? params.techniqueText.trim() || null
            : radOrder.techniqueText;
        const findingsText =
          params.findingsText !== undefined
            ? params.findingsText.trim() || null
            : radOrder.findingsText;
        const impressionText =
          params.impressionText !== undefined
            ? params.impressionText.trim() || null
            : radOrder.impressionText;
        const biradsScore =
          params.biradsScore !== undefined
            ? params.biradsScore.trim() || null
            : radOrder.biradsScore;

        const composedText =
          composeStructuredReportText({
            indicationText,
            techniqueText,
            findingsText,
            impressionText,
            biradsScore,
            reportText: params.reportText ?? radOrder.reportText,
          }) ?? radOrder.reportText;

        const now = new Date();
        const finalize = Boolean(params.finalize);
        if (finalize && (!composedText || composedText.trim().length < 3)) {
          throw new BadRequestException(
            'لا يمكن توقيع التقرير الإشعاعي نهائيًا دون نص تقرير أو خلاصة.',
          );
        }

        const isCritical =
          params.isCriticalFinding !== undefined
            ? Boolean(params.isCriticalFinding)
            : Boolean(radOrder.isCriticalFinding);

        if (radOrder.status !== RadiologyStatus.COMPLETED) {
          await enqueueConsumptionIntent(tx, {
            hospitalId: params.hospitalId,
            serviceItemId: study.serviceItem.id,
            referenceType: 'RADIOLOGY_ORDER',
            referenceId: radOrder.id,
            userId: params.reportedById,
          });
        }

        const signatureHash = finalize
          ? computeRadiologyReportHash({
              hospitalId: params.hospitalId,
              radiologyOrderId: radOrder.id,
              studyId: radOrder.studyId,
              indicationText,
              techniqueText,
              findingsText,
              impressionText,
              biradsScore,
              reportText: composedText,
              signedById: params.reportedById,
              signedAt: now,
            })
          : null;

        const updated = await tx.radiologyOrder.update({
          where: { id: radOrder.id },
          data: {
            status: RadiologyStatus.COMPLETED,
            reportedAt: now,
            reportedById: params.reportedById,
            reportText: composedText,
            indicationText,
            techniqueText,
            findingsText,
            impressionText,
            biradsScore,
            isCriticalFinding: isCritical,
            reportStatus: finalize ? 'FINAL' : 'PRELIMINARY',
            ...(finalize
              ? {
                  signedById: params.reportedById,
                  signedAt: now,
                  signatureHash,
                }
              : {}),
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.COMPLETED, completedAt: now },
        });

        if (
          isCritical &&
          typeof tx.radiologyCriticalNotification?.findFirst === 'function'
        ) {
          const existingNotif =
            await tx.radiologyCriticalNotification.findFirst({
              where: { radiologyOrderId: radOrder.id },
              select: { id: true },
            });
          if (!existingNotif) {
            const summary = (
              params.criticalFindingSummary?.trim() ||
              impressionText ||
              composedText ||
              'نتيجة أشعة حرجة تستدعي الإبلاغ الفوري'
            ).slice(0, 500);
            await tx.radiologyCriticalNotification.create({
              data: {
                hospitalId: params.hospitalId,
                radiologyOrderId: radOrder.id,
                findingSummary: summary,
                severity: 'CRITICAL',
                notifiedById: params.reportedById,
                slaDeadlineAt: new Date(
                  now.getTime() + CRITICAL_SLA_MINUTES * 60_000,
                ),
              },
            });
          }
        }

        const auditEntry =
          finalize && typeof tx.auditLog?.create === 'function'
            ? await appendChainedAuditInTransaction(tx, {
                hospitalId: params.hospitalId,
                userId: params.reportedById,
                action: 'RADIOLOGY_REPORT_SIGNED',
                entity: 'RadiologyOrder',
                entityId: radOrder.id,
                details: {
                  reportStatus: 'FINAL',
                  signatureHash,
                  isCriticalFinding: isCritical,
                  biradsScore,
                },
              })
            : null;

        return { updatedRadOrder: updated, audit: auditEntry };
      },
    );

    if (audit) {
      publishCommittedCriticalAudit(audit);
    }
    return updatedRadOrder;
  }

  async signReport(
    hospitalId: number,
    radiologyOrderId: number,
    signedById: number,
    dto: SaveRadiologyReportDto = {},
  ) {
    return this.completeOrderWithReport({
      ...dto,
      hospitalId,
      radiologyOrderId,
      reportedById: signedById,
      finalize: true,
    });
  }

  async addReportAddendum(
    hospitalId: number,
    radiologyOrderId: number,
    authorId: number,
    dto: AddRadiologyAddendumDto,
  ) {
    const { addendum, updatedOrder, audit } = await this.prisma.$transaction(
      async (tx) => {
        await lockRadiologyOrder(tx, hospitalId, radiologyOrderId);
        const radOrder = await tx.radiologyOrder.findFirst({
          where: { id: radiologyOrderId, order: { hospitalId } },
          include: {
            addenda: { orderBy: { addendumNumber: 'desc' }, take: 1 },
          },
        });
        if (!radOrder) {
          throw new NotFoundException('طلب الأشعة غير موجود في المنشأة.');
        }
        if (
          (radOrder.reportStatus !== 'FINAL' &&
            radOrder.reportStatus !== 'AMENDED') ||
          !radOrder.signatureHash
        ) {
          throw new ConflictException(
            'لا يمكن إضافة ملحق قبل توقيع التقرير الإشعاعي نهائيًا.',
          );
        }

        const nextNumber = (radOrder.addenda[0]?.addendumNumber ?? 0) + 1;
        const previousReportHash = radOrder.signatureHash;
        const signedAt = new Date();
        const isCritical = Boolean(dto.isCriticalFinding);

        const addendumHash = computeRadiologyAddendumHash({
          hospitalId,
          radiologyOrderId,
          addendumNumber: nextNumber,
          reason: dto.reason,
          addendumText: dto.addendumText,
          isCriticalFinding: isCritical,
          authorId,
          signedAt,
          previousReportHash,
        });

        const createdAddendum = await tx.radiologyReportAddendum.create({
          data: {
            hospitalId,
            radiologyOrderId,
            addendumNumber: nextNumber,
            reason: dto.reason.trim(),
            addendumText: dto.addendumText.trim(),
            isCriticalFinding: isCritical,
            authorId,
            signedAt,
            previousReportHash,
            addendumHash,
          },
          include: { author: { select: { id: true, fullName: true } } },
        });

        const updated = await tx.radiologyOrder.update({
          where: { id: radiologyOrderId },
          data: {
            reportStatus: 'AMENDED',
            signatureHash: addendumHash,
            ...(isCritical ? { isCriticalFinding: true } : {}),
          },
        });

        if (isCritical) {
          const summary = (
            dto.criticalFindingSummary?.trim() || dto.addendumText.trim()
          ).slice(0, 500);
          await tx.radiologyCriticalNotification.create({
            data: {
              hospitalId,
              radiologyOrderId,
              findingSummary: summary,
              severity: 'CRITICAL',
              notifiedById: authorId,
              slaDeadlineAt: new Date(
                signedAt.getTime() + CRITICAL_SLA_MINUTES * 60_000,
              ),
            },
          });
        }

        const auditEntry = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId: authorId,
          action: 'RADIOLOGY_REPORT_ADDENDUM_ADDED',
          entity: 'RadiologyReportAddendum',
          entityId: createdAddendum.id,
          details: {
            radiologyOrderId,
            addendumNumber: nextNumber,
            reason: dto.reason.trim(),
            previousReportHash,
            addendumHash,
            isCriticalFinding: isCritical,
          },
        });

        return {
          addendum: createdAddendum,
          updatedOrder: updated,
          audit: auditEntry,
        };
      },
    );

    publishCommittedCriticalAudit(audit);
    return { addendum, reportStatus: updatedOrder.reportStatus };
  }

  async verifyReportIntegrity(hospitalId: number, radiologyOrderId: number) {
    const radOrder = await this.prisma.radiologyOrder.findFirst({
      where: { id: radiologyOrderId, order: { hospitalId } },
      include: {
        addenda: { orderBy: { addendumNumber: 'asc' } },
      },
    });
    if (!radOrder) {
      throw new NotFoundException('طلب الأشعة غير موجود في المنشأة.');
    }
    if (!radOrder.signedById || !radOrder.signedAt || !radOrder.signatureHash) {
      return {
        valid: false,
        reason: 'UNSIGNED_REPORT',
        reportStatus: radOrder.reportStatus,
      };
    }

    let expectedHash = computeRadiologyReportHash({
      hospitalId,
      radiologyOrderId: radOrder.id,
      studyId: radOrder.studyId,
      indicationText: radOrder.indicationText,
      techniqueText: radOrder.techniqueText,
      findingsText: radOrder.findingsText,
      impressionText: radOrder.impressionText,
      biradsScore: radOrder.biradsScore,
      reportText: radOrder.reportText,
      signedById: radOrder.signedById,
      signedAt: radOrder.signedAt,
    });

    for (const add of radOrder.addenda) {
      if (add.previousReportHash !== expectedHash) {
        return {
          valid: false,
          reason: `ADDENDUM_CHAIN_BROKEN_AT_${add.addendumNumber}`,
          reportStatus: radOrder.reportStatus,
        };
      }
      const recomputedAddendum = computeRadiologyAddendumHash({
        hospitalId,
        radiologyOrderId: radOrder.id,
        addendumNumber: add.addendumNumber,
        reason: add.reason,
        addendumText: add.addendumText,
        isCriticalFinding: add.isCriticalFinding,
        authorId: add.authorId,
        signedAt: add.signedAt,
        previousReportHash: add.previousReportHash,
      });
      if (recomputedAddendum !== add.addendumHash) {
        return {
          valid: false,
          reason: `ADDENDUM_HASH_MISMATCH_AT_${add.addendumNumber}`,
          reportStatus: radOrder.reportStatus,
        };
      }
      expectedHash = add.addendumHash;
    }

    const valid = expectedHash === radOrder.signatureHash;
    return {
      valid,
      reason: valid ? 'VERIFIED' : 'SIGNATURE_HASH_MISMATCH',
      reportStatus: radOrder.reportStatus,
      signatureHash: radOrder.signatureHash,
      addendaCount: radOrder.addenda.length,
    };
  }

  async cancelOrder(
    hospitalId: number,
    radiologyOrderId: number,
    userId: number,
    reason: string,
  ) {
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      throw new BadRequestException('يجب إدخال سبب إلغاء واضح.');
    }

    const { cancelled, audit } = await this.prisma.$transaction(async (tx) => {
      const locked = await lockRadiologyOrder(tx, hospitalId, radiologyOrderId);
      if (!locked || locked.isDeleted) {
        throw new NotFoundException('طلب الأشعة غير موجود في المنشأة.');
      }
      if (locked.radiologyStatus === RadiologyStatus.COMPLETED) {
        throw new ConflictException(
          'لا يمكن إلغاء طلب أشعة مكتمل التقرير؛ استخدم الإشعار الدائن أو الملحق.',
        );
      }
      if (locked.radiologyStatus === RadiologyStatus.CANCELLED) {
        const existing = await tx.radiologyOrder.findUniqueOrThrow({
          where: { id: radiologyOrderId },
          include: { order: true },
        });
        return { cancelled: existing, audit: null };
      }

      const radOrder = await tx.radiologyOrder.update({
        where: { id: radiologyOrderId },
        data: {
          status: RadiologyStatus.CANCELLED,
          // Trigger MWL worker withdrawal if published to Orthanc
          ...(locked.dicomAccessionNumber ? { dicomMwlCheckedAt: null } : {}),
        },
        include: { order: true },
      });

      await tx.order.update({
        where: { id: radOrder.orderId },
        data: {
          status: OrderStatus.CANCELLED,
          notes: radOrder.order.notes
            ? `${radOrder.order.notes} | ملغى: ${cleanReason}`
            : `ملغى: ${cleanReason}`,
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'RADIOLOGY_ORDER_CANCELLED',
        entity: 'RadiologyOrder',
        entityId: radiologyOrderId,
        details: {
          orderId: radOrder.orderId,
          reason: cleanReason,
          previousPaymentStatus: locked.paymentStatus,
        },
      });

      return { cancelled: radOrder, audit: auditEntry };
    });

    if (audit) {
      publishCommittedCriticalAudit(audit);
    }
    return cancelled;
  }

  async listCriticalNotifications(hospitalId: number, onlyPending = false) {
    return this.prisma.radiologyCriticalNotification.findMany({
      where: {
        hospitalId,
        ...(onlyPending ? { readBackConfirmed: false } : {}),
      },
      include: {
        notifiedBy: { select: { id: true, fullName: true } },
        notifiedToUser: { select: { id: true, fullName: true } },
        radiologyOrder: {
          select: {
            id: true,
            dicomAccessionNumber: true,
            study: { select: { code: true, name: true, modality: true } },
            order: {
              select: {
                id: true,
                encounter: {
                  select: {
                    id: true,
                    patient: {
                      select: { id: true, fullName: true, mrn: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ readBackConfirmed: 'asc' }, { slaDeadlineAt: 'asc' }],
      take: 100,
    });
  }

  async recordCriticalReadBack(
    hospitalId: number,
    notificationId: number,
    actorId: number,
    dto: RecordRadiologyReadBackDto,
  ) {
    const { updated, audit } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.radiologyCriticalNotification.findFirst({
        where: { id: notificationId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('سجل تنبيه النتيجة الحرجة غير موجود.');
      }
      if (existing.readBackConfirmed) {
        throw new ConflictException(
          'تم توثيق إعادة القراءة (Read-Back) لهذا التنبيه مسبقًا.',
        );
      }

      const now = new Date();
      const slaBreached = now.getTime() > existing.slaDeadlineAt.getTime();
      const updatedNotif = await tx.radiologyCriticalNotification.update({
        where: { id: notificationId },
        data: {
          notifiedToName: dto.notifiedToName.trim(),
          notifiedToUserId: dto.notifiedToUserId ?? null,
          communicationChannel: dto.communicationChannel,
          readBackConfirmed: true,
          readBackNotes: dto.readBackNotes?.trim() || null,
          notifiedAt: now,
          acknowledgedAt: now,
          slaBreached,
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: actorId,
        action: 'RADIOLOGY_CRITICAL_READBACK_CONFIRMED',
        entity: 'RadiologyCriticalNotification',
        entityId: notificationId,
        details: {
          radiologyOrderId: existing.radiologyOrderId,
          notifiedToName: updatedNotif.notifiedToName,
          communicationChannel: dto.communicationChannel,
          slaBreached,
        },
      });

      return { updated: updatedNotif, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return updated;
  }
}
