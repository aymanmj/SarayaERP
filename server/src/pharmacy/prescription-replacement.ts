import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Money } from '../common/utils/money.util';

export type ReplacementIdentity = {
  hospitalId: number;
  encounterId: number;
  originalId: number;
  doctorId: number;
  fingerprint: string;
};

export async function findPrescriptionReplacement(
  tx: Pick<Prisma.TransactionClient, 'prescription'>,
  identity: ReplacementIdentity,
) {
  const { hospitalId, encounterId, originalId, doctorId, fingerprint } =
    identity;
  const existing = await tx.prescription.findFirst({
    where: {
      hospitalId,
      encounterId,
      replacesPrescriptionId: originalId,
    },
  });
  if (!existing) return null;
  const { replacementFingerprint, ...prescription } = existing;
  if (
    prescription.doctorId !== doctorId ||
    replacementFingerprint !== fingerprint
  )
    throw new ConflictException('لهذه الوصفة بديل مسجل بالفعل');
  return prescription;
}

export async function cancelledPrescriptionInvoice(
  tx: Prisma.TransactionClient,
  identity: ReplacementIdentity,
  patientId: number,
) {
  // The caller holds the same patient and encounter locks as cancellation and dispensing.
  const { hospitalId, encounterId, originalId } = identity;
  const original = await tx.prescription.findFirst({
    where: { id: originalId, hospitalId, encounterId, patientId },
    select: {
      status: true,
      _count: { select: { dispenses: true } },
      prepaidInvoice: {
        select: {
          id: true,
          type: true,
          status: true,
          patientShare: true,
          insuranceShare: true,
          totalAmount: true,
          paidAmount: true,
          hospitalId: true,
          encounterId: true,
          patientId: true,
        },
      },
    },
  });
  if (!original)
    throw new NotFoundException('الوصفة الأصلية غير موجودة في هذه الحالة');
  const invoice = original.prepaidInvoice;
  if (
    original.status !== 'CANCELLED' ||
    original._count.dispenses !== 0 ||
    !invoice ||
    invoice.hospitalId !== hospitalId ||
    invoice.encounterId !== encounterId ||
    invoice.patientId !== patientId ||
    invoice.type !== 'INVOICE'
  )
    throw new BadRequestException('يلزم إلغاء وصفة الخزينة الأصلية قبل الصرف');

  if (invoice.status === 'CANCELLED' && Money.isZero(invoice.paidAmount))
    return invoice.id;

  const credit = await tx.invoiceAdjustment.findFirst({
    where: {
      hospitalId,
      invoiceId: invoice.id,
      status: 'POSTED',
      kind: 'CREDIT',
      postingEntryId: { not: null },
      correctedAmount: 0,
      charge: {
        hospitalId,
        sourceType: 'PHARMACY_PRESCRIPTION',
        sourceId: originalId,
      },
    },
    select: { delta: true, insuranceDelta: true },
  });
  if (
    !credit ||
    !Money.eq(credit.delta.negated(), invoice.patientShare) ||
    !Money.eq(credit.insuranceDelta.negated(), invoice.insuranceShare) ||
    !Money.eq(
      Money.sumDecimal(invoice.patientShare, invoice.insuranceShare),
      invoice.totalAmount,
    )
  )
    throw new BadRequestException('يلزم اعتماد إشعار إلغاء الفاتورة الأصلية');
  return invoice.id;
}
