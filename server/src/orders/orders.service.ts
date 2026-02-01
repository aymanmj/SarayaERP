import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OrderStatus,
  OrderType,
  LabResultStatus,
  RadiologyStatus,
} from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async createLabOrder(data: {
    hospitalId: number;
    encounterId: number;
    orderedById: number;
    testId: number;
    notes?: string;
  }) {
    const enc = await this.prisma.encounter.findFirst({
      where: { id: data.encounterId, hospitalId: data.hospitalId },
    });

    if (!enc) {
      throw new NotFoundException('Encounter غير موجود في هذه المنشأة');
    }

    if (enc.status !== 'OPEN') {
      throw new ForbiddenException('لا يمكن إنشاء أمر لحالة مغلقة');
    }

    const test = await this.prisma.labTest.findFirst({
      where: { id: data.testId, hospitalId: data.hospitalId, isActive: true },
    });

    if (!test) {
      throw new NotFoundException('اختبار المعمل غير موجود أو غير مفعّل');
    }

    const order = await this.prisma.order.create({
      data: {
        hospitalId: data.hospitalId,
        encounterId: data.encounterId,
        orderedById: data.orderedById,
        type: OrderType.LAB,
        status: OrderStatus.NEW,
        notes: data.notes ?? null,
      },
    });

    const labOrder = await this.prisma.labOrder.create({
      data: {
        orderId: order.id,
        testId: test.id,
        resultStatus: 'PENDING',
      },
    });

    return { order, labOrder, test };
  }

  async createRadiologyOrder(data: {
    hospitalId: number;
    encounterId: number;
    orderedById: number;
    studyId: number;
    notes?: string;
  }) {
    const enc = await this.prisma.encounter.findFirst({
      where: { id: data.encounterId, hospitalId: data.hospitalId },
    });

    if (!enc) {
      throw new NotFoundException('Encounter غير موجود في هذه المنشأة');
    }

    const study = await this.prisma.radiologyStudy.findFirst({
      where: { id: data.studyId, hospitalId: data.hospitalId, isActive: true },
    });

    if (!study) {
      throw new NotFoundException('دراسة الأشعة غير موجودة أو غير مفعّلة');
    }

    const order = await this.prisma.order.create({
      data: {
        hospitalId: data.hospitalId,
        encounterId: data.encounterId,
        orderedById: data.orderedById,
        type: OrderType.RADIOLOGY,
        status: OrderStatus.NEW,
        notes: data.notes ?? null,
      },
    });

    const radOrder = await this.prisma.radiologyOrder.create({
      data: {
        orderId: order.id,
        studyId: study.id,
        status: 'PENDING',
      },
    });

    return { order, radiologyOrder: radOrder, study };
  }

  async listForEncounter(hospitalId: number, encounterId: number) {
    const enc = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId },
    });

    if (!enc) {
      throw new NotFoundException('Encounter غير موجود في هذه المنشأة');
    }

    return this.prisma.order.findMany({
      where: { hospitalId, encounterId },
      orderBy: { createdAt: 'desc' },
      include: {
        // ✅ التعديل هنا: استخدام labOrders بدلاً من labOrder
        labOrders: {
          include: {
            test: true,
          },
        },
        radiologyOrder: {
          include: {
            study: true,
          },
        },
      },
    });
  }

  // 🔹 تحديث نتيجة معملية (LabOrder)
  async updateLabResult(params: {
    hospitalId: number;
    labOrderId: number;
    resultValue?: string;
    resultUnit?: string;
    referenceRange?: string;
    resultStatus: LabResultStatus;
    resultDate?: Date;
  }) {
    const labOrder = await this.prisma.labOrder.findFirst({
      where: { id: params.labOrderId },
      include: {
        order: true,
      },
    });

    if (!labOrder) {
      throw new NotFoundException('طلب المعمل غير موجود');
    }

    if (labOrder.order.hospitalId !== params.hospitalId) {
      throw new ForbiddenException('لا يمكنك تعديل طلب من منشأة أخرى');
    }

    const resultDate = params.resultDate ?? new Date();

    const updatedLabOrder = await this.prisma.labOrder.update({
      where: { id: params.labOrderId },
      data: {
        resultValue: params.resultValue ?? labOrder.resultValue,
        resultUnit: params.resultUnit ?? labOrder.resultUnit,
        referenceRange: params.referenceRange ?? labOrder.referenceRange,
        resultStatus: params.resultStatus,
        resultDate,
      },
    });

    // لو اكتملت النتيجة: نحدث حالة الـ Order نفسها
    if (params.resultStatus === LabResultStatus.COMPLETED) {
      await this.prisma.order.update({
        where: { id: labOrder.orderId },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: resultDate,
        },
      });
    }

    return updatedLabOrder;
  }

  // 🔹 تحديث تقرير أشعة (RadiologyOrder)
  async updateRadiologyReport(params: {
    hospitalId: number;
    radiologyOrderId: number;
    status: RadiologyStatus;
    reportText?: string;
    reportedAt?: Date;
  }) {
    const radOrder = await this.prisma.radiologyOrder.findFirst({
      where: { id: params.radiologyOrderId },
      include: {
        order: true,
      },
    });

    if (!radOrder) {
      throw new NotFoundException('طلب الأشعة غير موجود');
    }

    if (radOrder.order.hospitalId !== params.hospitalId) {
      throw new ForbiddenException('لا يمكنك تعديل طلب من منشأة أخرى');
    }

    const reportedAt = params.reportedAt ?? new Date();

    const updatedRadOrder = await this.prisma.radiologyOrder.update({
      where: { id: params.radiologyOrderId },
      data: {
        status: params.status,
        reportText: params.reportText ?? radOrder.reportText,
        reportedAt,
      },
    });

    if (params.status === RadiologyStatus.COMPLETED) {
      await this.prisma.order.update({
        where: { id: radOrder.orderId },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: reportedAt,
        },
      });
    }

    return updatedRadOrder;
  }
}
