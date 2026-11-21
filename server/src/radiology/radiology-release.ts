import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  RadiologyStatus,
} from '@prisma/client';

export const radiologyReleasedPaymentStatuses: PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.WAIVED,
];

export async function lockRadiologyOrder(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  radiologyOrderId: number,
) {
  const [order] = await tx.$queryRaw<
    {
      paymentStatus: PaymentStatus;
      orderStatus: OrderStatus;
      radiologyStatus: RadiologyStatus;
      dicomAccessionNumber: string | null;
      dicomStudyUid: string | null;
      isDeleted: boolean;
    }[]
  >`
    SELECT o."paymentStatus", o.status AS "orderStatus", r.status AS "radiologyStatus",
           r."dicomAccessionNumber", r."dicomStudyUid", o."isDeleted"
    FROM "RadiologyOrder" r JOIN "Order" o ON o.id = r."orderId"
    WHERE r.id = ${radiologyOrderId} AND o."hospitalId" = ${hospitalId}
      AND o.type = 'RADIOLOGY'
    FOR UPDATE OF o, r
  `;
  return order;
}

export async function lockRadiologyExecution(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  radiologyOrderId: number,
  operation?: 'report' | 'legacy-report',
) {
  const order = await lockRadiologyOrder(tx, hospitalId, radiologyOrderId);
  if (!order || order.isDeleted)
    throw new NotFoundException('طلب الأشعة غير موجود في المنشأة');
  if (
    order.orderStatus === OrderStatus.CANCELLED ||
    order.radiologyStatus === RadiologyStatus.CANCELLED
  ) {
    throw new BadRequestException('طلب الأشعة ملغى');
  }
  if (!radiologyReleasedPaymentStatuses.includes(order.paymentStatus)) {
    throw new BadRequestException(
      'يجب تسوية طلب الأشعة في الخزينة قبل التنفيذ',
    );
  }
  if (order.dicomAccessionNumber && operation === 'legacy-report')
    throw new BadRequestException('اعتمد التقرير من مسار دراسة DICOM المرتبطة');
  if (
    order.dicomAccessionNumber &&
    operation === 'report' &&
    !order.dicomStudyUid
  )
    throw new BadRequestException(
      'يلزم ربط دراسة DICOM المطابقة قبل اعتماد التقرير',
    );
}
