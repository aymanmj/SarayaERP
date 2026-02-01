// src/radiology/radiology.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChargeSource,
  OrderStatus,
  OrderType,
  PaymentStatus,
  RadiologyStatus,
} from '@prisma/client';
import { PriceListsService } from '../price-lists/price-lists.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RadiologyOrderCreatedEvent } from './events/radiology-order-created.event';
import { RadiologyOrderStartedEvent } from './events/radiology-order-started.event';
import { AccountingService } from '../accounting/accounting.service';

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
        modality: true,
        bodyPart: true,
      },
    });
  }

  // ✅ [FIXED] إضافة pacsUrl هنا ليظهر في ملف المريض
  async listOrdersForEncounter(encounterId: number, hospitalId: number) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true, hospitalId: true },
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
      include: { order: true, study: true },
      orderBy: { id: 'asc' },
    });

    return radOrders.map((ro) => ({
      id: ro.id,
      status: ro.status,
      scheduledAt: ro.scheduledAt,
      reportedAt: ro.reportedAt,
      reportText: ro.reportText,
      pacsUrl: ro.pacsUrl, // ✅ تم إضافة الرابط
      study: {
        id: ro.study.id,
        code: ro.study.code,
        name: ro.study.name,
        modality: ro.study.modality,
        bodyPart: ro.study.bodyPart,
      },
      order: {
        id: ro.order.id,
        status: ro.order.status,
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
  }) {
    const { encounterId, hospitalId, doctorId, studyIds, notes } = params;

    const encounterInfo = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: { patient: { include: { insurancePolicy: true } } },
    });
    if (!encounterInfo || encounterInfo.hospitalId !== hospitalId) {
      throw new BadRequestException('هذه الحالة لا تنتمي لهذه المنشأة.');
    }
    const doctorInfo = await this.prisma.user.findUnique({
      where: { id: doctorId },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const studies = await tx.radiologyStudy.findMany({
        where: {
          id: { in: studyIds },
          hospitalId,
          isDeleted: false,
          isActive: true,
        },
        include: { serviceItem: true },
      });

      if (studies.length === 0)
        throw new BadRequestException('لا توجد دراسات أشعة صالحة.');

      const created: any[] = [];
      const chargeIds: number[] = [];
      let totalAmount = 0;
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
          data: { orderId: order.id, studyId: study.id },
        });

        if (study.serviceItem) {
          const price = await this.priceService.getServicePrice(
            hospitalId,
            study.serviceItem.id,
            policyId,
          );

          const charge = await tx.encounterCharge.create({
            data: {
              hospitalId,
              encounterId,
              serviceItemId: study.serviceItem.id,
              sourceType: ChargeSource.RADIOLOGY_ORDER,
              sourceId: radOrder.id,
              quantity: 1,
              unitPrice: price,
              totalAmount: price,
              performerId: doctorId,
            },
          });
          chargeIds.push(charge.id);
          totalAmount += price;
        }
        created.push({ ...radOrder, studyName: study.name });
      }

      // ✅ إنشاء فاتورة تلقائية لطلبات الأشعة
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

  // ✅ [FIXED] إضافة pacsUrl للقائمة
  async getWorklist(hospitalId: number) {
    const radOrders = await this.prisma.radiologyOrder.findMany({
      where: {
        order: { 
          hospitalId, 
          type: OrderType.RADIOLOGY, 
          isDeleted: false,
          // ✅ [PAYWALL] لا تظهر للفني إلا إذا كانت مدفوعة أو معفاة
          paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.WAIVED] }
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
      },
      orderBy: { id: 'desc' },
      take: 100,
    });

    return radOrders.map((ro) => ({
      id: ro.id,
      status: ro.status,
      reportedAt: ro.reportedAt,
      reportText: ro.reportText,
      pacsUrl: ro.pacsUrl, // ✅
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
      },
    }));
  }

  // ✅ [FIXED] إضافة pacsUrl للتفاصيل
  async getOrderById(hospitalId: number, id: number) {
    const radOrder = await this.prisma.radiologyOrder.findFirst({
      where: { id, order: { hospitalId } },
      include: {
        study: true,
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
      scheduledAt: radOrder.scheduledAt,
      reportedAt: radOrder.reportedAt,
      reportText: radOrder.reportText,
      pacsUrl: radOrder.pacsUrl, // ✅
      study: radOrder.study,
      order: {
        id: radOrder.order.id,
        status: radOrder.order.status,
        createdAt: radOrder.order.createdAt,
        patient: radOrder.order.encounter.patient,
        orderedBy: radOrder.order.orderedBy,
        encounter: { id: radOrder.order.encounter.id },
      },
    };
  }

  // ✅ [NEW] البدء في المعالجة (Start Processing / Send to Device)
  async startProcessing(hospitalId: number, radiologyOrderId: number, userId: number) {
     return this.prisma.$transaction(async (tx) => {
       const radOrder = await tx.radiologyOrder.findUnique({
         where: { id: radiologyOrderId },
         include: { order: true },
       });

       if (!radOrder) throw new NotFoundException('الطلب غير موجود.');
       if (radOrder.order.hospitalId !== hospitalId)
         throw new BadRequestException('غير مصرح لك.');

       if (radOrder.status === RadiologyStatus.COMPLETED) {
         return radOrder;
       }
       
       const updated = await tx.radiologyOrder.update({
         where: { id: radiologyOrderId },
         data: { status: RadiologyStatus.IN_PROGRESS }, // Enum updated in schema
       });
       
       this.eventEmitter.emit(
         'radiology.order_started',
         new RadiologyOrderStartedEvent(hospitalId, radiologyOrderId, userId)
       );

       return updated;
     });
  }

  async completeOrderWithReport(params: {
    hospitalId: number;
    radiologyOrderId: number;
    reportedById: number;
    reportText?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const radOrder = await tx.radiologyOrder.findUnique({
        where: { id: params.radiologyOrderId },
      });
      if (!radOrder) throw new NotFoundException('طلب الأشعة غير موجود.');

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
          encounterId: order.encounterId!,
          sourceType: ChargeSource.RADIOLOGY_ORDER,
          sourceId: radOrder.id,
        },
      });

      if (!existingCharge) {
        const policyId = order.encounter.patient.insurancePolicy?.isActive
          ? order.encounter.patient.insurancePolicy.id
          : null;

        const price = await this.priceService.getServicePrice(
          order.hospitalId,
          study.serviceItem.id,
          policyId,
        );

        await tx.encounterCharge.create({
          data: {
            hospitalId: order.hospitalId,
            encounterId: order.encounterId!,
            serviceItemId: study.serviceItem.id,
            sourceType: ChargeSource.RADIOLOGY_ORDER,
            sourceId: radOrder.id,
            quantity: 1,
            unitPrice: price,
            totalAmount: price,
            performerId: params.reportedById,
          },
        });
      }

      const updatedRadOrder = await tx.radiologyOrder.update({
        where: { id: radOrder.id },
        data: {
          status: RadiologyStatus.COMPLETED,
          reportedAt: new Date(),
          reportText: params.reportText ?? radOrder.reportText,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.COMPLETED, completedAt: new Date() },
      });

      return updatedRadOrder;
    });
  }
}

// // src/radiology/radiology.service.ts

// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   ChargeSource,
//   OrderStatus,
//   OrderType,
//   RadiologyStatus,
// } from '@prisma/client';
// import { PriceListsService } from '../price-lists/price-lists.service';
// // ✅ الاستيرادات الجديدة
// import { EventEmitter2 } from '@nestjs/event-emitter';
// import { RadiologyOrderCreatedEvent } from './events/radiology-order-created.event';

// @Injectable()
// export class RadiologyService {
//   constructor(
//     private prisma: PrismaService,
//     private priceService: PriceListsService,
//     private eventEmitter: EventEmitter2, // ✅ حقن
//   ) {}

//   // ... (getCatalog, listOrdersForEncounter كما هي) ...
//   async getCatalog(hospitalId: number) {
//     return this.prisma.radiologyStudy.findMany({
//       where: { hospitalId, isDeleted: false, isActive: true },
//       orderBy: { name: 'asc' },
//       select: {
//         id: true,
//         code: true,
//         name: true,
//         modality: true,
//         bodyPart: true,
//       },
//     });
//   }

//   async listOrdersForEncounter(encounterId: number, hospitalId: number) {
//     const encounter = await this.prisma.encounter.findUnique({
//       where: { id: encounterId },
//       select: { id: true, hospitalId: true },
//     });
//     if (!encounter) throw new NotFoundException('الحالة غير موجودة.');
//     if (encounter.hospitalId !== hospitalId)
//       throw new BadRequestException('هذه الحالة لا تنتمي لهذه المنشأة.');

//     const radOrders = await this.prisma.radiologyOrder.findMany({
//       where: {
//         order: {
//           hospitalId,
//           encounterId,
//           type: OrderType.RADIOLOGY,
//           isDeleted: false,
//         },
//       },
//       include: { order: true, study: true },
//       orderBy: { id: 'asc' },
//     });
//     return radOrders.map((ro) => ({
//       id: ro.id,
//       status: ro.status,
//       scheduledAt: ro.scheduledAt,
//       reportedAt: ro.reportedAt,
//       reportText: ro.reportText,
//       study: {
//         id: ro.study.id,
//         code: ro.study.code,
//         name: ro.study.name,
//         modality: ro.study.modality,
//         bodyPart: ro.study.bodyPart,
//       },
//       order: {
//         id: ro.order.id,
//         status: ro.order.status,
//         notes: ro.order.notes,
//         createdAt: ro.order.createdAt,
//       },
//     }));
//   }

//   // 3. إنشاء طلبات (مع الإشعار)
//   async createOrdersForEncounter(params: {
//     encounterId: number;
//     hospitalId: number;
//     doctorId: number;
//     studyIds: number[];
//     notes?: string;
//   }) {
//     const { encounterId, hospitalId, doctorId, studyIds, notes } = params;

//     // جلب معلومات إضافية للإشعار والأسعار
//     const encounterInfo = await this.prisma.encounter.findUnique({
//       where: { id: encounterId },
//       include: { patient: { include: { insurancePolicy: true } } },
//     });
//     if (!encounterInfo || encounterInfo.hospitalId !== hospitalId) {
//       throw new BadRequestException('هذه الحالة لا تنتمي لهذه المنشأة.');
//     }
//     const doctorInfo = await this.prisma.user.findUnique({
//       where: { id: doctorId },
//     });

//     // الترانزاكشن
//     const result = await this.prisma.$transaction(async (tx) => {
//       const studies = await tx.radiologyStudy.findMany({
//         where: {
//           id: { in: studyIds },
//           hospitalId,
//           isDeleted: false,
//           isActive: true,
//         },
//         include: { serviceItem: true },
//       });

//       if (studies.length === 0)
//         throw new BadRequestException('لا توجد دراسات أشعة صالحة.');

//       const created: any[] = [];
//       const policyId = encounterInfo.patient.insurancePolicy?.isActive
//         ? encounterInfo.patient.insurancePolicy.id
//         : null;

//       for (const study of studies) {
//         const order = await tx.order.create({
//           data: {
//             hospitalId,
//             encounterId,
//             orderedById: doctorId,
//             type: OrderType.RADIOLOGY,
//             status: OrderStatus.NEW,
//             notes: notes ?? null,
//           },
//         });

//         const radOrder = await tx.radiologyOrder.create({
//           data: { orderId: order.id, studyId: study.id },
//         });

//         if (study.serviceItem) {
//           const price = await this.priceService.getServicePrice(
//             hospitalId,
//             study.serviceItem.id,
//             policyId,
//           );

//           await tx.encounterCharge.create({
//             data: {
//               hospitalId,
//               encounterId,
//               serviceItemId: study.serviceItem.id,
//               sourceType: ChargeSource.RADIOLOGY_ORDER,
//               sourceId: radOrder.id,
//               quantity: 1,
//               unitPrice: price,
//               totalAmount: price,
//               performerId: doctorId, // ✅
//             },
//           });
//         }
//         // نضيف الاسم للنتيجة عشان الإيفنت
//         created.push({ ...radOrder, studyName: study.name });
//       }

//       return created;
//     });

//     // ✅ إطلاق حدث لكل دراسة (أو مجمع)
//     // هنا سنطلق حدثاً واحداً يلخص الطلبات
//     if (result.length > 0) {
//       const studyNames = result.map((r) => r.studyName).join(', ');
//       this.eventEmitter.emit(
//         'radiology.order_created',
//         new RadiologyOrderCreatedEvent(
//           hospitalId,
//           result[0].orderId, // ID الطلب الأول
//           encounterInfo.patient.fullName,
//           doctorInfo?.fullName || 'طبيب',
//           studyNames,
//         ),
//       );
//     }

//     return result;
//   }

//   // ... (باقي الدوال getWorklist, getOrderById, completeOrderWithReport كما هي) ...
//   async getWorklist(hospitalId: number) {
//     const radOrders = await this.prisma.radiologyOrder.findMany({
//       where: {
//         order: { hospitalId, type: OrderType.RADIOLOGY, isDeleted: false },
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
//         study: true,
//       },
//       orderBy: { id: 'desc' },
//       take: 100,
//     });

//     return radOrders.map((ro) => ({
//       id: ro.id,
//       status: ro.status,
//       reportedAt: ro.reportedAt,
//       reportText: ro.reportText,
//       order: {
//         id: ro.order.id,
//         status: ro.order.status,
//         createdAt: ro.order.createdAt,
//         encounterId: ro.order.encounterId,
//       },
//       patient: ro.order.encounter?.patient ?? null,
//       study: {
//         id: ro.study.id,
//         code: ro.study.code,
//         name: ro.study.name,
//         modality: ro.study.modality,
//         bodyPart: ro.study.bodyPart,
//       },
//     }));
//   }

//   async getOrderById(hospitalId: number, id: number) {
//     const radOrder = await this.prisma.radiologyOrder.findFirst({
//       where: { id, order: { hospitalId } },
//       include: {
//         study: true,
//         order: {
//           include: {
//             encounter: { include: { patient: true } },
//             orderedBy: { select: { id: true, fullName: true } },
//           },
//         },
//       },
//     });

//     if (!radOrder) throw new NotFoundException('طلب الأشعة غير موجود.');

//     return {
//       id: radOrder.id,
//       status: radOrder.status,
//       scheduledAt: radOrder.scheduledAt,
//       reportedAt: radOrder.reportedAt,
//       reportText: radOrder.reportText,
//       study: radOrder.study,
//       order: {
//         id: radOrder.order.id,
//         status: radOrder.order.status,
//         createdAt: radOrder.order.createdAt,
//         patient: radOrder.order.encounter.patient,
//         orderedBy: radOrder.order.orderedBy,
//         encounter: { id: radOrder.order.encounter.id },
//       },
//     };
//   }

//   async completeOrderWithReport(params: {
//     hospitalId: number;
//     radiologyOrderId: number;
//     reportedById: number;
//     reportText?: string;
//   }) {
//     return this.prisma.$transaction(async (tx) => {
//       const radOrder = await tx.radiologyOrder.findUnique({
//         where: { id: params.radiologyOrderId },
//       });
//       if (!radOrder) throw new NotFoundException('طلب الأشعة غير موجود.');

//       const order = await tx.order.findUnique({
//         where: { id: radOrder.orderId },
//         include: {
//           encounter: {
//             include: { patient: { include: { insurancePolicy: true } } },
//           },
//         },
//       });
//       if (!order || order.hospitalId !== params.hospitalId)
//         throw new BadRequestException('الطلب غير صالح.');

//       const study = await tx.radiologyStudy.findUnique({
//         where: { id: radOrder.studyId },
//         include: { serviceItem: true },
//       });
//       if (!study || !study.serviceItem)
//         throw new BadRequestException('خدمة الأشعة غير معرفة.');

//       const existingCharge = await tx.encounterCharge.findFirst({
//         where: {
//           hospitalId: order.hospitalId,
//           encounterId: order.encounterId!,
//           sourceType: ChargeSource.RADIOLOGY_ORDER,
//           sourceId: radOrder.id,
//         },
//       });

//       if (!existingCharge) {
//         const policyId = order.encounter.patient.insurancePolicy?.isActive
//           ? order.encounter.patient.insurancePolicy.id
//           : null;

//         const price = await this.priceService.getServicePrice(
//           order.hospitalId,
//           study.serviceItem.id,
//           policyId,
//         );

//         await tx.encounterCharge.create({
//           data: {
//             hospitalId: order.hospitalId,
//             encounterId: order.encounterId!,
//             serviceItemId: study.serviceItem.id,
//             sourceType: ChargeSource.RADIOLOGY_ORDER,
//             sourceId: radOrder.id,
//             quantity: 1,
//             unitPrice: price,
//             totalAmount: price,
//             performerId: params.reportedById,
//           },
//         });
//       }

//       const updatedRadOrder = await tx.radiologyOrder.update({
//         where: { id: radOrder.id },
//         data: {
//           status: RadiologyStatus.COMPLETED,
//           reportedAt: new Date(),
//           reportText: params.reportText ?? radOrder.reportText,
//         },
//       });

//       await tx.order.update({
//         where: { id: order.id },
//         data: { status: OrderStatus.COMPLETED, completedAt: new Date() },
//       });

//       return updatedRadOrder;
//     });
//   }
// }
