// src/lab-orders/lab-orders.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ChargeSource,
  LabResultStatus,
  OrderStatus,
  OrderType,
  PaymentStatus,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';

@Injectable()
export class LabOrdersService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  /**
   * جلب كل طلبات التحاليل المرتبطة بـ Encounter معيّن
   * تُرجع LabOrder مع الـ test + order
   */
  async listForEncounter(encounterId: number) {
    const labOrders = await this.prisma.labOrder.findMany({
      where: {
        order: {
          encounterId,
          type: OrderType.LAB,
          isDeleted: false,
        },
      },
      include: {
        test: true,
        order: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            notes: true,
            // لو حابب تضيف orderedBy:
            // orderedBy: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: {
        order: { createdAt: 'desc' },
      },
    });

    return labOrders;
  }

  /**
   * إنشاء طلبات تحاليل متعددة لحالة واحدة
   * - يتحقق من الـ Encounter
   * - يتحقق من صلاحية الـ LabTest
   * - ينشئ Order + LabOrder + EncounterCharge (لو فيه ServiceItem مربوط)
   */
  async createForEncounter(input: {
    encounterId: number;
    hospitalId: number;
    doctorId: number;
    testIds: number[];
    notes?: string;
  }) {
    const { encounterId, hospitalId, doctorId, testIds, notes } = input;

    if (!testIds || testIds.length === 0) {
      throw new BadRequestException('يجب اختيار تحليل واحد على الأقل.');
    }

    // التحقق من وجود الحالة وأنها تتبع نفس المستشفى
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: {
        id: true,
        hospitalId: true,
        patientId: true,
        isDeleted: true,
      },
    });

    if (!encounter || encounter.isDeleted) {
      throw new NotFoundException('الحالة غير موجودة أو محذوفة.');
    }

    if (encounter.hospitalId !== hospitalId) {
      throw new BadRequestException(
        'لا يمكن إنشاء طلب تحاليل لمستشفى مختلف عن مستشفى الحالة.',
      );
    }

    // التأكد من أن الطبيب موجود وفعّال (اختياري لكن أفضل)
    const doctor = await this.prisma.user.findUnique({
      where: { id: doctorId },
      select: { id: true, isActive: true, hospitalId: true },
    });

    if (!doctor || !doctor.isActive || doctor.hospitalId !== hospitalId) {
      throw new BadRequestException('الطبيب غير صالح أو لا ينتمي لنفس المستشفى.');
    }

    // جلب التحاليل المطلوبة
    const labTests = await this.prisma.labTest.findMany({
      where: {
        id: { in: testIds },
        hospitalId,
        isActive: true,
        isDeleted: false,
      },
      include: {
        serviceItem: true, // عشان نقدر نطلع السعر الافتراضي
      },
    });

    if (labTests.length !== testIds.length) {
      throw new BadRequestException(
        'بعض التحاليل غير موجودة أو غير مفعّلة في هذا المستشفى.',
      );
    }

    // تنفيذ كل شيء داخل Transaction
    const createdLabOrders = await this.prisma.$transaction(async (tx) => {
      const result: any[] = [];
      const chargeIds: number[] = [];
      let totalAmount = 0;

      for (const test of labTests) {
        // 1) إنشاء Order أساسياً
        const order = await tx.order.create({
          data: {
            hospitalId,
            encounterId,
            orderedById: doctorId,
            type: OrderType.LAB,
            status: OrderStatus.NEW,
            notes: notes || undefined,
          },
        });

        // 2) إنشاء LabOrder مرتبط بالـ Order + LabTest
        const labOrder = await tx.labOrder.create({
          data: {
            orderId: order.id,
            testId: test.id,
            resultStatus: LabResultStatus.PENDING,
          },
          include: {
            test: true,
            order: {
              select: {
                id: true,
                status: true,
                createdAt: true,
                notes: true,
              },
            },
          },
        });

        result.push(labOrder);

        // 3) إنشاء EncounterCharge لو التحليل مربوط بخدمة تسعير
        if (test.serviceItemId && test.serviceItem) {
          const price = Number(test.serviceItem.defaultPrice);
          const charge = await tx.encounterCharge.create({
            data: {
              hospitalId,
              encounterId,
              serviceItemId: test.serviceItemId,
              sourceType: ChargeSource.LAB_ORDER,
              sourceId: order.id,
              quantity: 1,
              unitPrice: price,
              totalAmount: price,
            },
          });
          chargeIds.push(charge.id);
          totalAmount += price;
        }
      }

      // ✅ 4) إنشاء فاتورة تلقائية لطلبات التحليل
      if (chargeIds.length > 0 && totalAmount > 0) {
        // جلب بيانات التأمين للمريض
        const patientData = await tx.patient.findUnique({
          where: { id: encounter.patientId },
          include: { insurancePolicy: true },
        });

        // حساب حصة المريض وحصة التأمين
        let patientShare = totalAmount;
        let insuranceShare = 0;
        let insuranceProviderId: number | null = null;

        if (patientData?.insurancePolicy?.isActive) {
          const copayRate = Number(patientData.insurancePolicy.patientCopayRate || 0) / 100;
          patientShare = Math.round(totalAmount * copayRate * 100) / 100;
          insuranceShare = Math.round((totalAmount - patientShare) * 100) / 100;
          insuranceProviderId = patientData.insurancePolicy.insuranceProviderId;
        }

        // جلب الفترة المالية
        const { financialYear, period } = await this.accounting.validateDateInOpenPeriod(
          hospitalId,
          new Date(),
        );

        // إنشاء الفاتورة
        const invoice = await tx.invoice.create({
          data: {
            hospitalId,
            patientId: encounter.patientId,
            encounterId,
            status: 'ISSUED',
            totalAmount,
            discountAmount: 0,
            paidAmount: 0,
            currency: 'LYD',
            patientShare,
            insuranceShare,
            insuranceProviderId,
            financialYearId: financialYear.id,
            financialPeriodId: period.id,
          },
        });

        // ربط الـ Charges بالفاتورة
        await tx.encounterCharge.updateMany({
          where: { id: { in: chargeIds } },
          data: { invoiceId: invoice.id },
        });
      }

      return result;
    });

    return createdLabOrders;
  }

  /**
   * ✅ [PAYWALL] قائمة عمل المختبر
   * تظهر فقط الطلبات المدفوعة أو المعفاة
   */
  async getWorklist(hospitalId: number) {
    const labOrders = await this.prisma.labOrder.findMany({
      where: {
        order: {
          hospitalId,
          type: OrderType.LAB,
          isDeleted: false,
          paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.WAIVED] },
        },
      },
      include: {
        test: true,
        order: {
          include: {
            encounter: {
              select: {
                id: true,
                patient: { select: { id: true, fullName: true, mrn: true } },
              },
            },
            orderedBy: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { order: { createdAt: 'desc' } },
      take: 100,
    });

    return labOrders.map((lo) => ({
      id: lo.id,
      status: lo.resultStatus,
      testName: lo.test.name,
      resultValue: lo.resultValue,
      order: {
        id: lo.order.id,
        status: lo.order.status,
        createdAt: lo.order.createdAt,
        encounterId: lo.order.encounterId,
      },
      patient: lo.order.encounter?.patient ?? null,
      orderedBy: lo.order.orderedBy?.fullName ?? 'N/A',
    }));
  }
}


