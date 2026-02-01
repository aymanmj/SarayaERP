// src/labs/labs.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChargeSource,
  LabResultStatus,
  OrderStatus,
  OrderType,
  PaymentStatus, // ✅ [NEW] Import for Paywall
  LabOrder,
} from '@prisma/client';
import { PriceListsService } from '../price-lists/price-lists.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LabOrderCreatedEvent } from './events/lab-order-created.event';
import { LabResultVerifiedEvent } from './events/lab-result-verified.event';
import { LabOrderStartedEvent } from './events/lab-order-started.event';
import { AccountingService } from '../accounting/accounting.service'; // ✅ [NEW]

@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name);

  constructor(
    private prisma: PrismaService,
    private priceService: PriceListsService,
    private eventEmitter: EventEmitter2,
    private accounting: AccountingService, // ✅ [NEW]
  ) {}

  // 1. الكتالوج
  async getCatalog(hospitalId: number) {
    return this.prisma.labTest.findMany({
      where: { hospitalId, isDeleted: false, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        unit: true,
      },
    });
  }

  // 2. قائمة العمل (Worklist)
  async getWorklist(hospitalId: number) {
    const labOrders = await this.prisma.labOrder.findMany({
      where: {
        order: {
          hospitalId,
          type: OrderType.LAB,
          isDeleted: false,
          // ✅ [PAYWALL] لا تظهر للفني إلا إذا كانت مدفوعة أو معفاة
          paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.WAIVED] },
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
        test: true,
      },
      orderBy: { id: 'desc' },
      take: 100,
    });

    return labOrders.map((lo) => ({
      id: lo.id,
      resultStatus: lo.resultStatus,
      resultDate: lo.resultDate,
      order: {
        id: lo.order.id,
        status: lo.order.status,
        paymentStatus: lo.order.paymentStatus, // ✅ Expose payment status
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
      },
    }));
  }

  // 3. طلبات حالة معينة
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
        test: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  // 4. إنشاء طلبات (مع التعديل لإطلاق الإشعار)
  async createOrdersForEncounter(params: {
    encounterId: number;
    hospitalId: number;
    doctorId: number;
    testIds: number[];
    notes?: string;
  }) {
    const { encounterId, hospitalId, doctorId, testIds, notes } = params;

    const encounterInfo = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patient: { include: { insurancePolicy: true } },
      },
    });

    if (!encounterInfo || encounterInfo.hospitalId !== hospitalId) {
      throw new BadRequestException('خطأ في بيانات الحالة.');
    }

    const doctorInfo = await this.prisma.user.findUnique({
      where: { id: doctorId },
    });

    // الترانزاكشن
    const result = await this.prisma.$transaction(async (tx) => {
      const tests = await tx.labTest.findMany({
        where: { id: { in: testIds }, hospitalId },
        include: { serviceItem: true },
      });

      if (tests.length === 0)
        throw new BadRequestException('لا توجد تحاليل مختارة.');

      const created: LabOrder[] = [];
      const chargeIds: number[] = []; // ✅ [NEW]
      let totalAmount = 0; // ✅ [NEW]

      // نستخدم بوليصة التأمين للتسعير
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

          const charge = await tx.encounterCharge.create({
            data: {
              hospitalId,
              encounterId,
              serviceItemId: test.serviceItem.id,
              sourceType: ChargeSource.LAB_ORDER,
              sourceId: labOrder.id,
              quantity: 1,
              unitPrice: price,
              totalAmount: price,
              performerId: doctorId,
            },
          });
          chargeIds.push(charge.id); // ✅ [NEW]
          totalAmount += Number(price); // ✅ [NEW]
        }
        created.push(labOrder);
      }

      // ✅ [NEW] إنشاء فاتورة تلقائية لطلبات التحاليل (مثل الأشعة)
      if (chargeIds.length > 0 && totalAmount > 0) {
        // حساب حصص الدفع
        let patientShare = totalAmount;
        let insuranceShare = 0;
        let insuranceProviderId: number | null = null;

        if (encounterInfo.patient.insurancePolicy?.isActive) {
          const copayRate = Number(encounterInfo.patient.insurancePolicy.patientCopayRate || 0) / 100;
          patientShare = Math.round(totalAmount * copayRate * 100) / 100;
          insuranceShare = Math.round((totalAmount - patientShare) * 100) / 100;
          insuranceProviderId = encounterInfo.patient.insurancePolicy.insuranceProviderId;
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
            patientId: encounterInfo.patientId,
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

      return created;
    });

    // ✅ [تصحيح] إطلاق الحدث بعد نجاح الترانزاكشن
    this.logger.log(
      `🔥 Emitting lab.order_created for ${result.length} orders...`,
    );

    if (result.length > 0) {
      this.eventEmitter.emit(
        'lab.order_created',
        new LabOrderCreatedEvent(
          hospitalId,
          result[0].orderId, // نرسل رقم أول طلب كمرجع (أو يمكنك تعديل الـ Event ليقبل مصفوفة)
          encounterInfo.patient.fullName,
          doctorInfo?.fullName || 'طبيب',
          result.length,
        ),
      );
    }

    return result;
  }

  // 5. البدء في المعالجة (Start Processing / Send to Device)
  async startProcessing(hospitalId: number, labOrderId: number, userId: number) {

     return this.prisma.$transaction(async (tx) => {
       const labOrder = await tx.labOrder.findUnique({
         where: { id: labOrderId },
         include: { order: true },
       });

       if (!labOrder) throw new NotFoundException('الطلب غير موجود.');
       if (labOrder.order.hospitalId !== hospitalId)
         throw new BadRequestException('غير مصرح لك.');

       if (labOrder.resultStatus === LabResultStatus.COMPLETED) {
         return labOrder;
       }
       
       const updated = await tx.labOrder.update({
         where: { id: labOrderId },
         data: { resultStatus: LabResultStatus.IN_PROGRESS },
       });
       
       this.eventEmitter.emit(
         'lab.order_started',
         new LabOrderStartedEvent(hospitalId, labOrderId, userId)
       );

       return updated;
     });
  }

  // 6. إدخال النتيجة
  async completeOrder(params: {
    hospitalId: number;
    labOrderId: number;
    performedById: number;
    resultValue?: string;
    resultUnit?: string;
    referenceRange?: string;
  }) {
    // Static import at top of file, but if not possible, check why
    // We will use 'any' casting for event if import fails, but let's try to assume it's imported at top
    // Wait, I should add the import at the TOP of the file.

    return this.prisma.$transaction(async (tx) => {
      const labOrder = await tx.labOrder.findUnique({
        where: { id: params.labOrderId },
        include: { test: true, order: true },
      });
      if (!labOrder) throw new NotFoundException('الطلب غير موجود.');

      if (labOrder.order.hospitalId !== params.hospitalId)
        throw new BadRequestException('الطلب غير صالح.');

      // Fetch patientId via encounter
      const encounter = await tx.encounter.findUnique({
        where: { id: labOrder.order.encounterId },
        select: { patientId: true },
      });

      const updated = await tx.labOrder.update({
        where: { id: labOrder.id },
        data: {
          resultStatus: LabResultStatus.COMPLETED,
          resultValue: params.resultValue,
          resultUnit: params.resultUnit,
          referenceRange: params.referenceRange,
          resultDate: new Date(),
        },
      });

      await tx.order.update({
        where: { id: labOrder.orderId },
        data: { status: OrderStatus.COMPLETED, completedAt: new Date() },
      });

      // ✨ [EVENT] Lab Result Verified -> CDSS
      if (params.resultValue && encounter) {
        const numericValue = parseFloat(params.resultValue);
        if (!isNaN(numericValue)) {
          this.eventEmitter.emit(
            'lab.result_verified',
            {
              hospitalId: params.hospitalId,
              labOrderId: updated.id,
              patientId: encounter.patientId, // Fixed: get from encounter
              testCode: labOrder.test.code,
              value: numericValue,
              unit: params.resultUnit || labOrder.test.unit || '',
              verifiedAt: new Date(),
            } as any,
          );
        }
      }

      return updated;
    });
  }

  // 6. التقرير المجمع
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
        order: { encounterId, type: OrderType.LAB, isDeleted: false },
        resultStatus: LabResultStatus.COMPLETED,
      },
      include: {
        test: true,
        order: { select: { createdAt: true } },
        results: true,
      },
      orderBy: {
        test: { category: 'asc' },
      },
    });

    return { encounter, labOrders };
  }
}

// // src/labs/labs.service.ts

// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   ChargeSource,
//   LabResultStatus,
//   OrderStatus,
//   OrderType,
//   LabOrder,
// } from '@prisma/client';
// // ✅ إضافة خدمة قوائم الأسعار
// import { PriceListsService } from '../price-lists/price-lists.service';

// @Injectable()
// export class LabService {
//   constructor(
//     private prisma: PrismaService,
//     private priceService: PriceListsService, // ✅ حقن الخدمة
//   ) {}

//   // 1. الكتالوج
//   async getCatalog(hospitalId: number) {
//     return this.prisma.labTest.findMany({
//       where: { hospitalId, isDeleted: false, isActive: true },
//       orderBy: { name: 'asc' },
//       select: {
//         id: true,
//         code: true,
//         name: true,
//         category: true,
//         unit: true,
//       },
//     });
//   }

//   // 2. قائمة العمل (Worklist)
//   async getWorklist(hospitalId: number) {
//     const labOrders = await this.prisma.labOrder.findMany({
//       where: {
//         order: {
//           hospitalId,
//           type: OrderType.LAB,
//           isDeleted: false,
//         },
//       },
//       include: {
//         order: {
//           include: {
//             encounter: {
//               select: {
//                 id: true,
//                 patient: { select: { id: true, fullName: true, mrn: true } },
//               },
//             },
//           },
//         },
//         test: true,
//       },
//       orderBy: { id: 'desc' },
//       take: 100,
//     });

//     return labOrders.map((lo) => ({
//       id: lo.id,
//       resultStatus: lo.resultStatus,
//       resultDate: lo.resultDate,
//       order: {
//         id: lo.order.id,
//         status: lo.order.status,
//         createdAt: lo.order.createdAt,
//         encounterId: lo.order.encounterId,
//       },
//       patient: lo.order.encounter?.patient ?? null,
//       test: {
//         id: lo.test.id,
//         code: lo.test.code,
//         name: lo.test.name,
//         category: lo.test.category,
//         unit: lo.test.unit,
//       },
//     }));
//   }

//   // 3. طلبات حالة معينة
//   async listOrdersForEncounter(encounterId: number, hospitalId: number) {
//     return this.prisma.labOrder.findMany({
//       where: {
//         order: {
//           hospitalId,
//           encounterId,
//           type: OrderType.LAB,
//           isDeleted: false,
//         },
//       },
//       include: {
//         order: true,
//         test: true,
//       },
//       orderBy: { id: 'asc' },
//     });
//   }

//   // 4. إنشاء طلبات (مع إنشاء المطالبة المالية فوراً)
//   async createOrdersForEncounter(params: {
//     encounterId: number;
//     hospitalId: number;
//     doctorId: number;
//     testIds: number[];
//     notes?: string;
//   }) {
//     const { encounterId, hospitalId, doctorId, testIds, notes } = params;

//     return this.prisma.$transaction(async (tx) => {
//       // ✅ جلب بيانات الحالة والتأمين
//       const encounter = await tx.encounter.findUnique({
//         where: { id: encounterId },
//         include: {
//           patient: { include: { insurancePolicy: true } },
//         },
//       });

//       if (!encounter || encounter.hospitalId !== hospitalId) {
//         throw new BadRequestException('خطأ في بيانات الحالة.');
//       }

//       // معرفة البوليصة
//       const policyId = encounter.patient.insurancePolicy?.isActive
//         ? encounter.patient.insurancePolicy.id
//         : null;

//       const tests = await tx.labTest.findMany({
//         where: { id: { in: testIds }, hospitalId },
//         include: { serviceItem: true },
//       });

//       if (tests.length === 0)
//         throw new BadRequestException('لا توجد تحاليل مختارة.');

//       const created: LabOrder[] = [];

//       for (const test of tests) {
//         // 1. إنشاء Order
//         const order = await tx.order.create({
//           data: {
//             hospitalId,
//             encounterId,
//             orderedById: doctorId,
//             type: OrderType.LAB,
//             status: OrderStatus.NEW,
//             notes: notes ?? null,
//           },
//         });

//         // 2. إنشاء LabOrder
//         const labOrder = await tx.labOrder.create({
//           data: {
//             orderId: order.id,
//             testId: test.id,
//             resultStatus: LabResultStatus.PENDING,
//           },
//         });

//         // 3. إنشاء EncounterCharge
//         if (test.serviceItem) {
//           // ✅ استخدام خدمة التسعير
//           const price = await this.priceService.getServicePrice(
//             hospitalId,
//             test.serviceItem.id,
//             policyId,
//           );

//           await tx.encounterCharge.create({
//             data: {
//               hospitalId,
//               encounterId,
//               serviceItemId: test.serviceItem.id,
//               sourceType: ChargeSource.LAB_ORDER,
//               sourceId: labOrder.id,
//               quantity: 1,
//               unitPrice: price,
//               totalAmount: price,

//               // ✅ ربط الطبيب بالخدمة لحساب العمولة
//               performerId: doctorId,
//             },
//           });
//         }

//         created.push(labOrder);
//       }
//       return created;
//     });
//   }

//   // 5. إدخال النتيجة
//   async completeOrder(params: {
//     hospitalId: number;
//     labOrderId: number;
//     performedById: number;
//     resultValue?: string;
//     resultUnit?: string;
//     referenceRange?: string;
//   }) {
//     // استيراد الحدث هنا لتجنب Circular Dependency إذا لزم
//     const { LabResultVerifiedEvent } = await import('./events/lab-result-verified.event');

//     return this.prisma.$transaction(async (tx) => {
//       const labOrder = await tx.labOrder.findUnique({
//         where: { id: params.labOrderId },
//         include: { test: true, order: true },
//       });

//       if (!labOrder) throw new NotFoundException('الطلب غير موجود.');

//       // تحديث النتيجة
//       const updated = await tx.labOrder.update({
//         where: { id: labOrder.id },
//         data: {
//           resultStatus: LabResultStatus.COMPLETED,
//           resultValue: params.resultValue,
//           resultUnit: params.resultUnit,
//           referenceRange: params.referenceRange,
//           resultDate: new Date(),
//         },
//       });

//       await tx.order.update({
//         where: { id: order.id },
//         data: { status: OrderStatus.COMPLETED, completedAt: new Date() },
//       });

//       return updated;
//     });
//   }

//   // 6. التقرير المجمع
//   async getCumulativeReport(hospitalId: number, encounterId: number) {
//     const encounter = await this.prisma.encounter.findUnique({
//       where: { id: encounterId, hospitalId },
//       include: {
//         patient: true,
//         doctor: { select: { fullName: true } },
//         department: true,
//       },
//     });

//     if (!encounter) throw new NotFoundException('الحالة غير موجودة.');

//     const labOrders = await this.prisma.labOrder.findMany({
//       where: {
//         order: {
//           encounterId,
//           type: OrderType.LAB,
//           isDeleted: false,
//         },
//         resultStatus: LabResultStatus.COMPLETED,
//       },
//       include: {
//         test: true,
//         order: { select: { createdAt: true } },
//       },
//       orderBy: {
//         test: { category: 'asc' },
//       },
//     });

//     return {
//       encounter,
//       labOrders,
//     };
//   }
// }
