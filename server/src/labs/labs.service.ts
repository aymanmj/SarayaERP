// src/labs/labs.service.ts

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { enqueueConsumptionIntent } from '../inventory/consumption-intent';
import {
  ChargeSource,
  LabOrder,
  LabResultStatus,
  OrderStatus,
  OrderType,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PriceListsService } from '../price-lists/price-lists.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LabOrderCreatedEvent } from './events/lab-order-created.event';
import { LabOrderStartedEvent } from './events/lab-order-started.event';
import { AccountingService } from '../accounting/accounting.service';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  computeLabVerificationHash,
  computePatientAgeDays,
  evaluateNumericResultAgainstRange,
  selectReferenceRange,
} from './lab-reference-range.util';
import type {
  AmendLabOrderDto,
  CreateLabReferenceRangeDto,
  CreateLabTestCatalogDto,
  LabResultParameterInputDto,
  RecordCriticalReadBackDto,
} from './dto/lab-modernization.dto';

export interface LabAuditMeta {
  ipAddress?: string;
  clientName?: string;
}

const USER_LITE = {
  id: true,
  fullName: true,
  username: true,
} as const;

@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name);

  constructor(
    private prisma: PrismaService,
    private priceService: PriceListsService,
    private eventEmitter: EventEmitter2,
    private accounting: AccountingService,
  ) {}

  // =========================================================================
  // 1. Catalog & Structured Age/Sex Reference Ranges
  // =========================================================================

  async getCatalog(hospitalId: number) {
    return this.prisma.labTest.findMany({
      where: { hospitalId, isDeleted: false, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        arabicName: true,
        category: true,
        unit: true,
        parameters: {
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            refRange: true,
          },
          orderBy: { id: 'asc' },
        },
        referenceRanges: {
          where: { isActive: true },
          orderBy: [{ gender: 'asc' }, { ageMinDays: 'asc' }],
        },
      },
    });
  }

  async createCatalogTest(
    hospitalId: number,
    userId: number,
    dto: CreateLabTestCatalogDto,
    meta?: LabAuditMeta,
  ) {
    const code = dto.code.trim().toUpperCase();

    const { test, audit } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.labTest.findUnique({
        where: { hospitalId_code: { hospitalId, code } },
      });
      if (existing && !existing.isDeleted) {
        throw new ConflictException(
          `تحليل المختبر بالرمز (${code}) مسجل مسبقًا في هذه المنشأة`,
        );
      }

      if (dto.serviceItemId) {
        const svc = await tx.serviceItem.findFirst({
          where: { id: dto.serviceItemId, hospitalId, isDeleted: false },
        });
        if (!svc) {
          throw new NotFoundException(
            'الخدمة التسعيرية غير موجودة في هذه المنشأة',
          );
        }
      }

      const created = await tx.labTest.create({
        data: {
          hospitalId,
          code,
          name: dto.name.trim(),
          arabicName: dto.arabicName?.trim() || null,
          category: dto.category?.trim() || null,
          unit: dto.unit?.trim() || null,
          serviceItemId: dto.serviceItemId ?? null,
          parameters: dto.parameters?.length
            ? {
                create: dto.parameters.map((p) => ({
                  code: p.code.trim().toUpperCase(),
                  name: p.name.trim(),
                  unit: p.unit?.trim() || null,
                  refRange: p.refRange?.trim() || null,
                })),
              }
            : undefined,
        },
        include: { parameters: true },
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'LAB_CATALOG_TEST_CREATED',
        entity: 'LabTest',
        entityId: created.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          code: created.code,
          name: created.name,
          parametersCount: created.parameters.length,
        },
      });

      return { test: created, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return test;
  }

  async createReferenceRange(
    hospitalId: number,
    userId: number,
    dto: CreateLabReferenceRangeDto,
    meta?: LabAuditMeta,
  ) {
    const ageMinDays = dto.ageMinDays ?? 0;
    const ageMaxDays = dto.ageMaxDays ?? 50000;
    if (ageMaxDays < ageMinDays) {
      throw new BadRequestException(
        'الحد الأقصى للعمر يجب أن يكون أكبر من أو يساوي الحد الأدنى',
      );
    }

    const { range, audit } = await this.prisma.$transaction(async (tx) => {
      const test = await tx.labTest.findFirst({
        where: { id: dto.labTestId, hospitalId, isDeleted: false },
      });
      if (!test) {
        throw new NotFoundException('تحليل المختبر غير موجود في هذه المنشأة');
      }

      if (dto.parameterId) {
        const param = await tx.labTestParameter.findFirst({
          where: { id: dto.parameterId, labTestId: test.id },
        });
        if (!param) {
          throw new NotFoundException('البراميتر غير موجود ضمن هذا التحليل');
        }
      }

      const created = await tx.labReferenceRange.create({
        data: {
          hospitalId,
          labTestId: test.id,
          parameterId: dto.parameterId ?? null,
          gender: dto.gender ?? 'ANY',
          ageMinDays,
          ageMaxDays,
          normalLow: dto.normalLow ?? null,
          normalHigh: dto.normalHigh ?? null,
          criticalLow: dto.criticalLow ?? null,
          criticalHigh: dto.criticalHigh ?? null,
          unit: dto.unit?.trim() || test.unit || null,
          textRange: dto.textRange?.trim() || null,
        },
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'LAB_REFERENCE_RANGE_CREATED',
        entity: 'LabReferenceRange',
        entityId: created.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          labTestId: test.id,
          parameterId: dto.parameterId ?? null,
          gender: created.gender,
          ageMinDays,
          ageMaxDays,
        },
      });

      return { range: created, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return range;
  }

  async listReferenceRanges(hospitalId: number, labTestId?: number) {
    return this.prisma.labReferenceRange.findMany({
      where: {
        hospitalId,
        isActive: true,
        ...(labTestId ? { labTestId } : {}),
      },
      include: {
        labTest: { select: { id: true, code: true, name: true } },
        parameter: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ labTestId: 'asc' }, { gender: 'asc' }, { ageMinDays: 'asc' }],
    });
  }

  // =========================================================================
  // 2. Worklist & Encounter Orders (including Panels, Specimens & Cultures)
  // =========================================================================

  async getWorklist(hospitalId: number) {
    const labOrders = await this.prisma.labOrder.findMany({
      where: {
        order: {
          hospitalId,
          type: OrderType.LAB,
          isDeleted: false,
          status: { not: OrderStatus.CANCELLED },
          paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.WAIVED] },
        },
      },
      include: {
        order: {
          include: {
            encounter: {
              select: {
                id: true,
                patient: {
                  select: {
                    id: true,
                    fullName: true,
                    mrn: true,
                    gender: true,
                    dateOfBirth: true,
                  },
                },
              },
            },
          },
        },
        test: {
          include: {
            parameters: { orderBy: { id: 'asc' } },
          },
        },
        results: { orderBy: { id: 'asc' } },
        verifiedBy: { select: USER_LITE },
        criticalNotifications: {
          where: { status: 'PENDING' },
          select: {
            id: true,
            parameterName: true,
            criticalValue: true,
            flag: true,
            status: true,
            slaDeadline: true,
          },
        },
      },
      orderBy: { id: 'desc' },
      take: 150,
    });

    return labOrders.map((lo) => ({
      id: lo.id,
      resultStatus: lo.resultStatus,
      resultValue: lo.resultValue,
      resultUnit: lo.resultUnit,
      referenceRange: lo.referenceRange,
      resultDate: lo.resultDate,
      isVerified: lo.isVerified,
      verifiedAt: lo.verifiedAt,
      verifiedBy: lo.verifiedBy,
      isAmended: lo.isAmended,
      lastAmendmentReason: lo.lastAmendmentReason,
      results: lo.results,
      pendingCriticalNotifications: lo.criticalNotifications,
      order: {
        id: lo.order.id,
        status: lo.order.status,
        paymentStatus: lo.order.paymentStatus,
        createdAt: lo.order.createdAt,
        encounterId: lo.order.encounterId,
      },
      patient: lo.order.encounter?.patient ?? null,
      test: {
        id: lo.test.id,
        code: lo.test.code,
        name: lo.test.name,
        category: lo.test.category,
        unit: lo.test.unit,
        parameters: lo.test.parameters,
      },
    }));
  }

  async listOrdersForEncounter(encounterId: number, hospitalId: number) {
    return this.prisma.labOrder.findMany({
      where: {
        order: {
          hospitalId,
          encounterId,
          type: OrderType.LAB,
          isDeleted: false,
        },
      },
      include: {
        order: true,
        test: { include: { parameters: true } },
        results: { orderBy: { id: 'asc' } },
        specimens: { orderBy: { collectedAt: 'desc' } },
        cultureReports: {
          include: { sensitivities: true },
          orderBy: { createdAt: 'desc' },
        },
        verifiedBy: { select: USER_LITE },
        criticalNotifications: true,
        amendments: {
          include: { amendedBy: { select: USER_LITE } },
          orderBy: { amendedAt: 'desc' },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  // =========================================================================
  // 3. Create Lab Orders (Money Precision + Strict Tenant/Encounter/Doctor Checks)
  // =========================================================================

  async createOrdersForEncounter(params: {
    encounterId: number;
    hospitalId: number;
    doctorId: number;
    testIds: number[];
    notes?: string;
  }) {
    const { encounterId, hospitalId, doctorId, testIds, notes } = params;
    const uniqueTestIds = [...new Set(testIds)];
    if (uniqueTestIds.length === 0) {
      throw new BadRequestException('لا توجد تحاليل مختارة.');
    }

    const encounterInfo = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patient: { include: { insurancePolicy: true } },
      },
    });

    if (
      !encounterInfo ||
      encounterInfo.hospitalId !== hospitalId ||
      encounterInfo.isDeleted
    ) {
      throw new BadRequestException('خطأ في بيانات الحالة.');
    }
    if (encounterInfo.status && encounterInfo.status !== 'OPEN') {
      throw new ConflictException(
        'لا يمكن إنشاء طلبات مختبر لزيارة مغلقة أو ملغاة',
      );
    }

    const doctorInfo = await this.prisma.user.findUnique({
      where: { id: doctorId },
      include: {
        accessibleHospitals: { where: { hospitalId }, select: { id: true } },
      },
    });
    if (
      doctorInfo &&
      (doctorInfo.isActive === false ||
        doctorInfo.isDeleted === true ||
        (doctorInfo.hospitalId !== undefined &&
          doctorInfo.hospitalId !== hospitalId &&
          !(doctorInfo.accessibleHospitals?.length > 0)))
    ) {
      throw new BadRequestException(
        'الطبيب غير صالح أو لا يملك صلاحية العمل في هذه المنشأة.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const tests = await tx.labTest.findMany({
        where: {
          id: { in: uniqueTestIds },
          hospitalId,
          isActive: true,
          isDeleted: false,
        },
        include: { serviceItem: true },
      });

      if (tests.length !== uniqueTestIds.length) {
        throw new BadRequestException(
          'بعض التحاليل المختارة غير موجودة أو غير نشطة في هذه المنشأة.',
        );
      }

      const created: LabOrder[] = [];
      const chargeIds: number[] = [];
      let totalAmountDec = Money.roundDecimal(0, 3);

      const policyId = encounterInfo.patient.insurancePolicy?.isActive
        ? encounterInfo.patient.insurancePolicy.id
        : null;

      for (const test of tests) {
        const order = await tx.order.create({
          data: {
            hospitalId,
            encounterId,
            orderedById: doctorId,
            type: OrderType.LAB,
            status: OrderStatus.NEW,
            notes: notes ?? null,
          },
        });

        const labOrder = await tx.labOrder.create({
          data: {
            orderId: order.id,
            testId: test.id,
            resultStatus: LabResultStatus.PENDING,
          },
          include: { test: true },
        });

        if (test.serviceItem) {
          const price = await this.priceService.getServicePrice(
            hospitalId,
            test.serviceItem.id,
            policyId,
          );
          const unitPriceDec = Money.roundDecimal(price, 4);
          const lineTotalDec = Money.roundDecimal(unitPriceDec, 3);

          const charge = await tx.encounterCharge.create({
            data: {
              hospitalId,
              encounterId,
              serviceItemId: test.serviceItem.id,
              sourceType: ChargeSource.LAB_ORDER,
              sourceId: labOrder.id,
              quantity: 1,
              unitPrice: Money.toUnitDb(unitPriceDec),
              totalAmount: Money.toDb(lineTotalDec),
              performerId: doctorId,
            },
          });
          chargeIds.push(charge.id);
          totalAmountDec = Money.addDecimal(totalAmountDec, lineTotalDec);
        }
        created.push(labOrder);
      }

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
            totalAmount: Money.toDb(totalAmountDec),
            discountAmount: 0,
            paidAmount: 0,
            currency: 'LYD',
            patientShare: Money.toDb(patientShareDec),
            insuranceShare: Money.toDb(insuranceShareDec),
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
      this.eventEmitter.emit(
        'lab.order_created',
        new LabOrderCreatedEvent(
          hospitalId,
          result[0].orderId,
          encounterInfo.patient.fullName,
          doctorInfo?.fullName || 'طبيب',
          result.length,
        ),
      );
    }

    return result;
  }

  // =========================================================================
  // 4. Start Processing, Multi-Parameter Entry, Verification, Amendment, Cancel
  // =========================================================================

  async startProcessing(
    hospitalId: number,
    labOrderId: number,
    userId: number,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT l.id FROM "LabOrder" l JOIN "Order" o ON o.id=l."orderId" WHERE l.id=${labOrderId} AND o."hospitalId"=${hospitalId} FOR UPDATE OF l`;
      const labOrder = await tx.labOrder.findUnique({
        where: { id: labOrderId },
        include: {
          order: { include: { encounter: { select: { type: true } } } },
        },
      });

      if (!labOrder || labOrder.order.hospitalId !== hospitalId) {
        throw new NotFoundException('الطلب غير موجود.');
      }
      if (
        labOrder.order.status === OrderStatus.CANCELLED ||
        labOrder.order.isDeleted
      ) {
        throw new ConflictException('لا يمكن بدء معالجة طلب مختبر ملغى.');
      }
      if (
        labOrder.order.encounter?.type === 'OPD' &&
        labOrder.order.paymentStatus !== PaymentStatus.PAID &&
        labOrder.order.paymentStatus !== PaymentStatus.WAIVED
      ) {
        throw new ConflictException(
          'حظر مالي: لا يمكن بدء تحليل المختبر الخارجي قبل سداد الفاتورة أو الإعفاء المعتمد.',
        );
      }
      if (labOrder.resultStatus === LabResultStatus.COMPLETED) {
        return labOrder;
      }

      await tx.order.update({
        where: { id: labOrder.orderId },
        data: { status: OrderStatus.IN_PROGRESS },
      });

      return tx.labOrder.update({
        where: { id: labOrderId },
        data: { resultStatus: LabResultStatus.IN_PROGRESS },
      });
    });

    // Emit AFTER transaction commits
    this.eventEmitter.emit(
      'lab.order_started',
      new LabOrderStartedEvent(hospitalId, labOrderId, userId),
    );

    return updated;
  }

  async completeOrder(params: {
    hospitalId: number;
    labOrderId: number;
    performedById: number;
    resultValue?: string;
    resultUnit?: string;
    referenceRange?: string;
    parameters?: LabResultParameterInputDto[];
    verifyImmediately?: boolean;
    meta?: LabAuditMeta;
  }) {
    const { saved, emittedEvents, audit } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT l.id FROM "LabOrder" l JOIN "Order" o ON o.id=l."orderId" WHERE l.id=${params.labOrderId} AND o."hospitalId"=${params.hospitalId} FOR UPDATE OF l`;
        const labOrder = await tx.labOrder.findUnique({
          where: { id: params.labOrderId },
          include: {
            test: { include: { parameters: true } },
            order: {
              include: {
                encounter: {
                  select: {
                    type: true,
                    patientId: true,
                    patient: {
                      select: { id: true, gender: true, dateOfBirth: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (!labOrder) {
          throw new NotFoundException('الطلب غير موجود.');
        }
        if (labOrder.order.hospitalId !== params.hospitalId) {
          throw new BadRequestException('الطلب غير صالح.');
        }
        if (
          labOrder.order.status === OrderStatus.CANCELLED ||
          labOrder.order.isDeleted
        ) {
          throw new ConflictException('لا يمكن إدخال نتيجة لطلب ملغى.');
        }
        if (
          labOrder.order.encounter?.type === 'OPD' &&
          labOrder.order.paymentStatus !== PaymentStatus.PAID &&
          labOrder.order.paymentStatus !== PaymentStatus.WAIVED
        ) {
          throw new ConflictException(
            'حظر مالي: لا يمكن إدخال نتيجة المختبر الخارجي قبل سداد الفاتورة أو الإعفاء المعتمد.',
          );
        }
        if (labOrder.isVerified) {
          throw new ConflictException(
            'النتيجة معتمدة وموقّعة نهائيًا ولا تقبل التعديل المباشر؛ استخدم مسار التصحيح المعتمد (Amendment) مع ذكر السبب.',
          );
        }

        const patient = labOrder.order.encounter?.patient ?? null;
        const patientAgeDays = computePatientAgeDays(patient?.dateOfBirth);
        const allRanges = await tx.labReferenceRange.findMany({
          where: {
            hospitalId: params.hospitalId,
            labTestId: labOrder.testId,
            isActive: true,
          },
        });

        const now = new Date();
        const slaDeadline = new Date(now.getTime() + 30 * 60_000);
        const eventsToEmit: Array<{
          hospitalId: number;
          labOrderId: number;
          patientId: number;
          testCode: string;
          value: number;
          unit: string;
          verifiedAt: Date;
        }> = [];

        let finalRefRange = params.referenceRange ?? labOrder.referenceRange;
        const finalUnit = params.resultUnit ?? labOrder.test.unit ?? null;

        // 1. Evaluate scalar result against age/sex reference range
        if (params.resultValue !== undefined && params.resultValue !== null) {
          const scalarRange = selectReferenceRange(
            allRanges.filter((r) => r.parameterId === null),
            patient?.gender,
            patientAgeDays,
          );
          const evalRes = evaluateNumericResultAgainstRange(
            params.resultValue,
            scalarRange,
          );
          if (!finalRefRange && evalRes.formattedRange) {
            finalRefRange = evalRes.formattedRange;
          }
          if (evalRes.isCritical && evalRes.flag && patient) {
            await tx.labCriticalNotification.create({
              data: {
                hospitalId: params.hospitalId,
                labOrderId: labOrder.id,
                patientId: patient.id,
                parameterName: labOrder.test.name,
                criticalValue: params.resultValue,
                unit: finalUnit,
                flag: evalRes.flag,
                slaDeadline,
              },
            });
          }
          const numericVal = Number.parseFloat(params.resultValue);
          if (!Number.isNaN(numericVal) && patient) {
            eventsToEmit.push({
              hospitalId: params.hospitalId,
              labOrderId: labOrder.id,
              patientId: patient.id,
              testCode: labOrder.test.code,
              value: numericVal,
              unit: finalUnit || '',
              verifiedAt: now,
            });
          }
        }

        // 2. Persist multi-parameter panel results if provided
        const persistedParams: Array<{
          parameterId?: number | null;
          parameterName: string;
          value: string;
          unit?: string | null;
          range?: string | null;
          flag?: string | null;
        }> = [];

        if (params.parameters && params.parameters.length > 0) {
          await tx.labOrderResult.deleteMany({
            where: { labOrderId: labOrder.id },
          });

          for (const p of params.parameters) {
            const matchedParamRange = selectReferenceRange(
              allRanges.filter((r) =>
                p.parameterId
                  ? r.parameterId === p.parameterId
                  : r.parameterId === null,
              ),
              patient?.gender,
              patientAgeDays,
            );
            const evalParam = evaluateNumericResultAgainstRange(
              p.value,
              matchedParamRange,
            );
            const resolvedFlag = p.flag || evalParam.flag || null;
            const resolvedRange = p.range || evalParam.formattedRange || null;

            const createdRow = await tx.labOrderResult.create({
              data: {
                labOrderId: labOrder.id,
                parameterId: p.parameterId ?? null,
                parameterName: p.parameterName.trim(),
                value: p.value.trim(),
                unit: p.unit?.trim() || null,
                range: resolvedRange,
                flag: resolvedFlag,
              },
            });

            persistedParams.push({
              parameterId: createdRow.parameterId,
              parameterName: createdRow.parameterName,
              value: createdRow.value,
              unit: createdRow.unit,
              range: createdRow.range,
              flag: createdRow.flag,
            });

            if (
              (evalParam.isCritical ||
                resolvedFlag === 'LL' ||
                resolvedFlag === 'HH') &&
              patient
            ) {
              await tx.labCriticalNotification.create({
                data: {
                  hospitalId: params.hospitalId,
                  labOrderId: labOrder.id,
                  patientId: patient.id,
                  parameterName: createdRow.parameterName,
                  criticalValue: createdRow.value,
                  unit: createdRow.unit,
                  flag:
                    resolvedFlag === 'LL' || resolvedFlag === 'HH'
                      ? resolvedFlag
                      : 'CRITICAL',
                  slaDeadline,
                },
              });
            }

            const numParamVal = Number.parseFloat(p.value);
            if (!Number.isNaN(numParamVal) && patient) {
              const paramDef = labOrder.test.parameters.find(
                (def) => def.id === p.parameterId,
              );
              eventsToEmit.push({
                hospitalId: params.hospitalId,
                labOrderId: labOrder.id,
                patientId: patient.id,
                testCode: paramDef?.code || p.parameterName,
                value: numParamVal,
                unit: p.unit || '',
                verifiedAt: now,
              });
            }
          }
        }

        const shouldVerify = Boolean(params.verifyImmediately);
        const verificationHash = shouldVerify
          ? computeLabVerificationHash({
              hospitalId: params.hospitalId,
              labOrderId: labOrder.id,
              testCode: labOrder.test.code,
              resultValue: params.resultValue ?? null,
              resultUnit: finalUnit,
              referenceRange: finalRefRange ?? null,
              parameters: persistedParams,
            })
          : null;

        const updated = await tx.labOrder.update({
          where: { id: labOrder.id },
          data: {
            resultStatus: LabResultStatus.COMPLETED,
            resultValue: params.resultValue,
            resultUnit: finalUnit,
            referenceRange: finalRefRange,
            resultDate: now,
            enteredById: params.performedById,
            enteredAt: now,
            ...(shouldVerify
              ? {
                  isVerified: true,
                  verifiedById: params.performedById,
                  verifiedAt: now,
                  verificationHash,
                }
              : {}),
          },
          include: {
            results: true,
            verifiedBy: { select: USER_LITE },
            criticalNotifications: true,
          },
        });

        await tx.order.update({
          where: { id: labOrder.orderId },
          data: { status: OrderStatus.COMPLETED, completedAt: now },
        });

        if (
          labOrder.resultStatus !== LabResultStatus.COMPLETED &&
          labOrder.test.serviceItemId
        ) {
          await enqueueConsumptionIntent(tx, {
            hospitalId: params.hospitalId,
            serviceItemId: labOrder.test.serviceItemId,
            referenceType: 'LAB_ORDER',
            referenceId: labOrder.id,
            userId: params.performedById,
          });
        }

        const auditLog = await appendChainedAuditInTransaction(tx, {
          hospitalId: params.hospitalId,
          userId: params.performedById,
          action: shouldVerify
            ? 'LAB_RESULT_ENTERED_AND_VERIFIED'
            : 'LAB_RESULT_ENTERED',
          entity: 'LabOrder',
          entityId: updated.id,
          ipAddress: params.meta?.ipAddress,
          clientName: params.meta?.clientName,
          details: {
            testCode: labOrder.test.code,
            parametersCount: persistedParams.length,
            isVerified: shouldVerify,
            verificationHash,
          },
        });

        return { saved: updated, emittedEvents: eventsToEmit, audit: auditLog };
      },
    );

    publishCommittedCriticalAudit(audit);
    for (const evt of emittedEvents) {
      this.eventEmitter.emit('lab.result_verified', evt);
    }

    return saved;
  }

  async verifyOrder(
    hospitalId: number,
    labOrderId: number,
    verifierId: number,
    meta?: LabAuditMeta,
  ) {
    const { saved, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT l.id FROM "LabOrder" l JOIN "Order" o ON o.id=l."orderId" WHERE l.id=${labOrderId} AND o."hospitalId"=${hospitalId} FOR UPDATE OF l`;
      const labOrder = await tx.labOrder.findUnique({
        where: { id: labOrderId },
        include: { test: true, order: true, results: true },
      });
      if (!labOrder || labOrder.order.hospitalId !== hospitalId) {
        throw new NotFoundException('الطلب غير موجود.');
      }
      if (labOrder.isVerified) {
        throw new ConflictException('النتيجة معتمدة ومقفلة مسبقًا.');
      }
      if (!labOrder.resultValue && labOrder.results.length === 0) {
        throw new BadRequestException(
          'لا يمكن اعتماد نتيجة فارغة قبل إدخال القيم المخبرية.',
        );
      }

      const now = new Date();
      const verificationHash = computeLabVerificationHash({
        hospitalId,
        labOrderId: labOrder.id,
        testCode: labOrder.test.code,
        resultValue: labOrder.resultValue,
        resultUnit: labOrder.resultUnit,
        referenceRange: labOrder.referenceRange,
        parameters: labOrder.results,
      });

      const updated = await tx.labOrder.update({
        where: { id: labOrder.id },
        data: {
          resultStatus: LabResultStatus.COMPLETED,
          resultDate: labOrder.resultDate ?? now,
          isVerified: true,
          verifiedById: verifierId,
          verifiedAt: now,
          verificationHash,
        },
        include: {
          results: true,
          verifiedBy: { select: USER_LITE },
          criticalNotifications: true,
        },
      });

      await tx.order.update({
        where: { id: labOrder.orderId },
        data: { status: OrderStatus.COMPLETED, completedAt: now },
      });

      if (
        labOrder.resultStatus !== LabResultStatus.COMPLETED &&
        labOrder.test.serviceItemId
      ) {
        await enqueueConsumptionIntent(tx, {
          hospitalId,
          serviceItemId: labOrder.test.serviceItemId,
          referenceType: 'LAB_ORDER',
          referenceId: labOrder.id,
          userId: verifierId,
        });
      }

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: verifierId,
        action: 'LAB_RESULT_VERIFIED',
        entity: 'LabOrder',
        entityId: updated.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          testCode: labOrder.test.code,
          verificationHash,
        },
      });

      return { saved: updated, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return saved;
  }

  async amendOrder(
    hospitalId: number,
    labOrderId: number,
    userId: number,
    dto: AmendLabOrderDto,
    meta?: LabAuditMeta,
  ) {
    const { saved, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT l.id FROM "LabOrder" l JOIN "Order" o ON o.id=l."orderId" WHERE l.id=${labOrderId} AND o."hospitalId"=${hospitalId} FOR UPDATE OF l`;
      const labOrder = await tx.labOrder.findUnique({
        where: { id: labOrderId },
        include: { test: true, order: true, results: true },
      });
      if (!labOrder || labOrder.order.hospitalId !== hospitalId) {
        throw new NotFoundException('الطلب غير موجود.');
      }
      if (!labOrder.isVerified) {
        throw new ConflictException(
          'لا حاجة لمسار التصحيح (Amendment) لنتيجة غير معتمدة بعد؛ يمكن تعديلها مباشرة قبل الاعتماد.',
        );
      }

      const previousParams = labOrder.results.map((r) => ({
        parameterId: r.parameterId,
        parameterName: r.parameterName,
        value: r.value,
        unit: r.unit,
        range: r.range,
        flag: r.flag,
      }));

      let nextParams = previousParams;
      if (dto.parameters && dto.parameters.length > 0) {
        await tx.labOrderResult.deleteMany({
          where: { labOrderId: labOrder.id },
        });
        nextParams = [];
        for (const p of dto.parameters) {
          const created = await tx.labOrderResult.create({
            data: {
              labOrderId: labOrder.id,
              parameterId: p.parameterId ?? null,
              parameterName: p.parameterName.trim(),
              value: p.value.trim(),
              unit: p.unit?.trim() || null,
              range: p.range?.trim() || null,
              flag: p.flag?.trim() || null,
            },
          });
          nextParams.push({
            parameterId: created.parameterId,
            parameterName: created.parameterName,
            value: created.value,
            unit: created.unit,
            range: created.range,
            flag: created.flag,
          });
        }
      }

      const nextValue =
        dto.resultValue !== undefined ? dto.resultValue : labOrder.resultValue;
      const nextUnit =
        dto.resultUnit !== undefined ? dto.resultUnit : labOrder.resultUnit;
      const nextRange =
        dto.referenceRange !== undefined
          ? dto.referenceRange
          : labOrder.referenceRange;

      const newHash = computeLabVerificationHash({
        hospitalId,
        labOrderId: labOrder.id,
        testCode: labOrder.test.code,
        resultValue: nextValue ?? null,
        resultUnit: nextUnit ?? null,
        referenceRange: nextRange ?? null,
        parameters: nextParams,
      });

      const now = new Date();
      await tx.labResultAmendment.create({
        data: {
          hospitalId,
          labOrderId: labOrder.id,
          previousResultValue: labOrder.resultValue,
          newResultValue: nextValue,
          previousParametersSnapshot:
            previousParams as unknown as Prisma.InputJsonValue,
          newParametersSnapshot: nextParams as unknown as Prisma.InputJsonValue,
          reason: dto.reason.trim(),
          amendedById: userId,
          previousHash: labOrder.verificationHash,
          newHash,
        },
      });

      const updated = await tx.labOrder.update({
        where: { id: labOrder.id },
        data: {
          resultValue: nextValue,
          resultUnit: nextUnit,
          referenceRange: nextRange,
          verificationHash: newHash,
          isAmended: true,
          amendedAt: now,
          lastAmendmentReason: dto.reason.trim(),
        },
        include: {
          results: true,
          verifiedBy: { select: USER_LITE },
          amendments: {
            include: { amendedBy: { select: USER_LITE } },
            orderBy: { amendedAt: 'desc' },
          },
        },
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'LAB_RESULT_AMENDED',
        entity: 'LabOrder',
        entityId: updated.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          reason: dto.reason.trim(),
          previousHash: labOrder.verificationHash,
          newHash,
        },
      });

      return { saved: updated, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return saved;
  }

  async cancelOrder(
    hospitalId: number,
    labOrderId: number,
    userId: number,
    reason: string,
    meta?: LabAuditMeta,
  ) {
    const { cancelled, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT l.id FROM "LabOrder" l JOIN "Order" o ON o.id=l."orderId" WHERE l.id=${labOrderId} AND o."hospitalId"=${hospitalId} FOR UPDATE OF l`;
      const labOrder = await tx.labOrder.findUnique({
        where: { id: labOrderId },
        include: { order: true, test: true },
      });
      if (!labOrder || labOrder.order.hospitalId !== hospitalId) {
        throw new NotFoundException('الطلب غير موجود.');
      }
      if (
        labOrder.isVerified ||
        labOrder.resultStatus === LabResultStatus.COMPLETED
      ) {
        throw new ConflictException(
          'لا يمكن إلغاء طلب مختبر مكتمل أو معتمد نهائيًا.',
        );
      }

      const updated = await tx.labOrder.update({
        where: { id: labOrder.id },
        data: { resultStatus: LabResultStatus.CANCELLED },
      });

      await tx.order.update({
        where: { id: labOrder.orderId },
        data: {
          status: OrderStatus.CANCELLED,
          notes: `${labOrder.order.notes ? `${labOrder.order.notes} | ` : ''}ملغى: ${reason.trim()}`,
        },
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'LAB_ORDER_CANCELLED',
        entity: 'LabOrder',
        entityId: labOrder.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          orderId: labOrder.orderId,
          testCode: labOrder.test.code,
          reason: reason.trim(),
        },
      });

      return { cancelled: updated, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return cancelled;
  }

  // =========================================================================
  // 5. JCI IPSG.2 Critical Value Read-Back Escalation
  // =========================================================================

  async listCriticalNotifications(hospitalId: number, status?: string) {
    return this.prisma.labCriticalNotification.findMany({
      where: {
        hospitalId,
        ...(status ? { status } : {}),
      },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        labOrder: {
          select: {
            id: true,
            orderId: true,
            test: { select: { id: true, code: true, name: true } },
          },
        },
        calledBy: { select: USER_LITE },
        notifiedClinician: { select: USER_LITE },
      },
      orderBy: [{ status: 'asc' }, { slaDeadline: 'asc' }],
      take: 100,
    });
  }

  async recordCriticalReadBack(
    hospitalId: number,
    notificationId: number,
    callerId: number,
    dto: RecordCriticalReadBackDto,
    meta?: LabAuditMeta,
  ) {
    if (!dto.readBackConfirmed) {
      throw new BadRequestException(
        'معيار JCI IPSG.2 يتطلب تأكيد إعادة قراءة القيمة الحرجة (Read-Back) من الطبيب/الممرض المبلَّغ.',
      );
    }

    const { saved, audit } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.labCriticalNotification.findFirst({
        where: { id: notificationId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException(
          'تنبيه القيمة الحرجة غير موجود في هذه المنشأة.',
        );
      }
      if (existing.status === 'ACKNOWLEDGED_READBACK') {
        throw new ConflictException(
          'تم توثيق إبلاغ وإعادة قراءة هذه القيمة الحرجة مسبقًا.',
        );
      }

      const updated = await tx.labCriticalNotification.update({
        where: { id: existing.id },
        data: {
          status: 'ACKNOWLEDGED_READBACK',
          calledById: callerId,
          notifiedClinicianId: dto.notifiedClinicianId ?? null,
          notifiedClinicianName: dto.notifiedClinicianName.trim(),
          notificationMethod: dto.notificationMethod,
          readBackConfirmed: true,
          readBackValue: dto.readBackValue.trim(),
          readBackAt: new Date(),
          notes: dto.notes?.trim() || null,
        },
        include: {
          patient: { select: { id: true, fullName: true, mrn: true } },
          calledBy: { select: USER_LITE },
        },
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: callerId,
        action: 'LAB_CRITICAL_READBACK_DOCUMENTED',
        entity: 'LabCriticalNotification',
        entityId: updated.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          labOrderId: updated.labOrderId,
          parameterName: updated.parameterName,
          criticalValue: updated.criticalValue,
          readBackValue: updated.readBackValue,
          notifiedClinicianName: updated.notifiedClinicianName,
          notificationMethod: updated.notificationMethod,
        },
      });

      return { saved: updated, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return saved;
  }

  // =========================================================================
  // 6. Cumulative Lab Report (including Panels, Specimens, Cultures & Verifier)
  // =========================================================================

  async getCumulativeReport(hospitalId: number, encounterId: number) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId, hospitalId },
      include: {
        patient: true,
        doctor: { select: { fullName: true } },
        department: true,
      },
    });

    if (!encounter) throw new NotFoundException('الحالة غير موجودة.');

    const labOrders = await this.prisma.labOrder.findMany({
      where: {
        order: {
          encounterId,
          hospitalId,
          type: OrderType.LAB,
          isDeleted: false,
        },
        resultStatus: LabResultStatus.COMPLETED,
      },
      include: {
        test: true,
        order: { select: { createdAt: true } },
        results: { orderBy: { id: 'asc' } },
        specimens: {
          select: {
            id: true,
            barcode: true,
            specimenType: true,
            collectedAt: true,
          },
          orderBy: { collectedAt: 'desc' },
        },
        cultureReports: {
          include: { sensitivities: true, verifiedBy: { select: USER_LITE } },
          orderBy: { createdAt: 'desc' },
        },
        verifiedBy: { select: USER_LITE },
      },
      orderBy: {
        test: { category: 'asc' },
      },
    });

    return { encounter, labOrders };
  }
}
