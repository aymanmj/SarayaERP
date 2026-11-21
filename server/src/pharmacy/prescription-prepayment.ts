import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { financialPeriod } from '../accounting/financial-posting';
import { adjustmentBalance } from '../billing/invoice-snapshot';
import { Money } from '../common/utils/money.util';
import { calculateCoverageExact } from '../insurance/insurance-calculation.service';
import { readCoverageBalance } from '../insurance/coverage-balance';

export const pendingPrescriptionCancellation = {
  status: 'PENDING',
  charge: { sourceType: 'PHARMACY_PRESCRIPTION' },
} satisfies Prisma.InvoiceAdjustmentWhereInput;

export function settledPrescriptionInvoice(
  patientShare: Prisma.DecimalFieldRefInput<'Invoice'>,
) {
  return {
    type: 'INVOICE',
    status: { in: ['PAID', 'PARTIALLY_PAID'] },
    paidAmount: { gte: patientShare },
    refunds: { none: { status: 'EXECUTED' } },
    adjustments: { none: pendingPrescriptionCancellation },
  } satisfies Prisma.InvoiceWhereInput;
}

export function currentPrescriptionAuthorization(now = new Date()) {
  return {
    status: 'APPROVED',
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  } satisfies Prisma.PreAuthorizationWhereInput;
}

export const dispensedPrescriptionClaim = {
  OR: [
    { prepaidPrescription: null },
    { prepaidPrescription: { status: 'COMPLETED', dispenses: { some: {} } } },
    {
      prepaidPrescription: {
        status: 'PARTIALLY_COMPLETED',
        dispenses: { some: { partialClosureReason: { not: null } } },
      },
      adjustments: { some: { partialDispense: true, status: 'POSTED' } },
    },
  ],
} satisfies Prisma.InvoiceWhereInput;

export type PrescriptionCoverage = {
  patientShare: string;
  insuranceShare: string;
  providerId?: number;
  preAuthorizationId?: number;
  policyId?: number;
  maxCoverageAmount?: string | null;
  ruleApplied?: string;
  requiresAuthorization?: boolean;
};

export async function pricePrescriptionCoverage(
  tx: Prisma.TransactionClient,
  identity: {
    hospitalId: number;
    patientId: number;
    insurancePolicyId: number | null;
  },
  serviceItemId: number,
  amount: string,
  linkedRequest = false,
): Promise<PrescriptionCoverage> {
  if (identity.insurancePolicyId == null)
    return { patientShare: amount, insuranceShare: '0.000' };
  const coverage = await calculateCoverageExact(
    tx,
    identity.patientId,
    serviceItemId,
    amount,
    {
      preserveServicePrice: true,
      deferPreAuth: true,
    },
  );
  if (coverage.policyId !== identity.insurancePolicyId || !coverage.providerId)
    throw new BadRequestException(
      'يلزم التحقق من سريان بوليصة التأمين قبل فوترة الوصفة',
    );
  if (
    Money.isNegative(coverage.patientShare) ||
    Money.isNegative(coverage.insuranceShare) ||
    !Money.eq(
      amount,
      Money.sumDecimal(coverage.patientShare, coverage.insuranceShare),
    )
  )
    throw new BadRequestException('حصص الوصفة المؤمّنة غير متسقة');

  let preAuthorizationId: number | undefined;
  const requiresAuthorization =
    coverage.requiresPreAuth && Money.isPositive(coverage.insuranceShare);
  if (requiresAuthorization && !linkedRequest) {
    const approvals = await tx.$queryRaw<{ id: number }[]>`
      SELECT a.id FROM "PreAuthorization" a
      WHERE a."hospitalId" = ${identity.hospitalId} AND a."patientId" = ${identity.patientId}
        AND a."policyId" = ${identity.insurancePolicyId} AND a."serviceItemId" = ${serviceItemId}
        AND NOT a."isPrescriptionRequest"
        AND a.status = 'APPROVED' AND (a."expiresAt" IS NULL OR a."expiresAt" > clock_timestamp())
        AND length(btrim(a."authCode")) > 0 AND a."approvedAmount" >= ${Money.decimal(coverage.insuranceShare)}
        AND NOT EXISTS (SELECT 1 FROM "Prescription" r WHERE r."preAuthorizationId" = a.id)
      ORDER BY a.id DESC LIMIT 1 FOR UPDATE OF a
    `;
    preAuthorizationId = approvals[0]?.id;
  }
  return {
    patientShare: coverage.patientShare,
    insuranceShare: coverage.insuranceShare,
    providerId: Money.isPositive(coverage.insuranceShare)
      ? coverage.providerId
      : undefined,
    policyId: coverage.policyId,
    maxCoverageAmount: coverage.maxCoverageAmount,
    ruleApplied: coverage.ruleApplied,
    preAuthorizationId,
    requiresAuthorization,
  };
}

async function assertLinkedAuthorization(
  tx: Prisma.TransactionClient,
  invoice: Pick<
    Prisma.InvoiceGetPayload<object>,
    'id' | 'hospitalId' | 'patientId' | 'insuranceShare' | 'insuranceProviderId'
  > & {
    prepaidPrescription?: { preAuthorizationId: number | null } | null;
  },
) {
  const id = invoice.prepaidPrescription?.preAuthorizationId;
  if (id == null) return;
  const [valid] = await tx.$queryRaw<{ id: number }[]>`
    SELECT a.id FROM "PreAuthorization" a
    JOIN "InsurancePolicy" p ON p.id = a."policyId"
    JOIN "EncounterCharge" c ON c."serviceItemId" = a."serviceItemId"
      AND c."invoiceId" = ${invoice.id} AND c."hospitalId" = a."hospitalId"
      AND c."sourceType" = 'PHARMACY_PRESCRIPTION'
    WHERE a.id = ${id} AND a."hospitalId" = ${invoice.hospitalId}
      AND a."patientId" = ${invoice.patientId}
      AND p."insuranceProviderId" = ${invoice.insuranceProviderId}
      AND a.status = 'APPROVED' AND (a."expiresAt" IS NULL OR a."expiresAt" > clock_timestamp())
      AND length(btrim(a."authCode")) > 0 AND a."approvedAmount" >= ${invoice.insuranceShare}
    FOR SHARE OF a
  `;
  if (!valid)
    throw new BadRequestException(
      'الموافقة التأمينية المرتبطة بالوصفة غير سارية أو لا تغطي حصة التأمين',
    );
}

export async function assertPrescriptionCollectionAvailable(
  tx: Prisma.TransactionClient,
  invoice: Parameters<typeof assertLinkedAuthorization>[1],
) {
  if (
    await tx.invoiceAdjustment.count({
      where: {
        hospitalId: invoice.hospitalId,
        invoiceId: invoice.id,
        charge: pendingPrescriptionCancellation.charge,
        status: { in: ['PENDING', 'POSTED'] },
      },
    })
  )
    throw new BadRequestException('تحصيل الوصفة موقوف بسبب طلب الإلغاء');
  await assertLinkedAuthorization(tx, invoice);
}

export async function prescriptionBillingService(
  tx: Prisma.TransactionClient,
  hospitalId: number,
) {
  const existing = await tx.serviceItem.findFirst({
    where: { hospitalId, code: 'PHARMACY-DRUGS' },
  });
  const service =
    existing ??
    (await tx.serviceItem.upsert({
      where: { code: `PHARMACY-DRUGS-${hospitalId}` },
      create: {
        hospitalId,
        code: `PHARMACY-DRUGS-${hospitalId}`,
        name: 'أدوية الوصفة',
        type: 'PHARMACY',
        defaultPrice: '0.000',
      },
      update: {},
    }));
  if (
    service.hospitalId !== hospitalId ||
    service.type !== 'PHARMACY' ||
    !service.isActive ||
    service.isDeleted ||
    !service.isBillable
  )
    throw new BadRequestException(
      'خدمة فوترة الوصفة معطلة أو إعدادها غير صالح',
    );
  return service;
}

export async function pricePrescription(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  items: { drugItemId: number; quantity: number }[],
) {
  const ids = [...new Set(items.map((item) => item.drugItemId))];
  const products = await tx.$queryRaw<
    { id: number; sellPrice: Prisma.Decimal }[]
  >`
    SELECT id, "sellPrice" FROM "Product"
    WHERE "hospitalId" = ${hospitalId} AND id IN (${Prisma.join(ids)})
      AND type = 'DRUG' AND "isActive" AND NOT "isDeleted"
    ORDER BY id FOR SHARE
  `;
  const byId = new Map(
    products.map((product) => [product.id, product.sellPrice]),
  );
  return items.map((item) => {
    const price = byId.get(item.drugItemId);
    if (price == null || Money.decimal(price).lt(0))
      throw new BadRequestException(
        'الدواء غير متاح ضمن المنشأة أو سعره غير صالح',
      );
    const unitPrice = Money.toDbString(price);
    return { unitPrice, amount: Money.decimal(unitPrice).times(item.quantity) };
  });
}

export async function createPrescriptionInvoice(
  tx: Prisma.TransactionClient,
  data: {
    hospitalId: number;
    encounterId: number;
    patientId: number;
    amount: string;
    coverage: PrescriptionCoverage;
  },
) {
  const { coverage, hospitalId, patientId } = data;
  if (
    coverage.maxCoverageAmount != null &&
    coverage.providerId &&
    coverage.policyId
  ) {
    const balance = await readCoverageBalance(tx, {
      hospitalId,
      patientId,
      policyId: coverage.policyId,
      providerId: coverage.providerId,
      cap: coverage.maxCoverageAmount,
    });
    if (balance.requiresReconciliation)
      throw new BadRequestException(
        'توجد فواتير تأمينية سابقة تحتاج إلى مطابقة مع البوليصة',
      );
    if (Money.gt(coverage.insuranceShare, balance.remainingAmount))
      throw new BadRequestException(
        `حصة التأمين تتجاوز الرصيد المتبقي من سقف التغطية (${balance.remainingAmount} د.ل.)`,
      );
  }
  const { financialYear, period } = await financialPeriod(
    tx,
    data.hospitalId,
    new Date(),
  );
  return tx.invoice.create({
    data: {
      hospitalId: data.hospitalId,
      encounterId: data.encounterId,
      patientId: data.patientId,
      status: Money.isPositive(data.amount) ? 'ISSUED' : 'PAID',
      currency: 'LYD',
      totalAmount: data.amount,
      patientShare: data.coverage.patientShare,
      insuranceShare: data.coverage.insuranceShare,
      insuranceProviderId: data.coverage.providerId,
      ...(coverage.providerId && { coveragePolicyId: coverage.policyId }),
      financialYearId: financialYear.id,
      financialPeriodId: period.id,
    },
  });
}

export async function confirmPrescriptionSettlement(
  tx: Prisma.TransactionClient,
  prescription: {
    prepaidInvoiceId: number;
    hospitalId: number;
    encounterId: number;
    patientId: number;
  },
) {
  // The caller already holds Patient and Encounter, as do the financial writers.
  const invoice = await tx.invoice.findFirst({
    where: {
      id: prescription.prepaidInvoiceId,
      hospitalId: prescription.hospitalId,
      encounterId: prescription.encounterId,
      patientId: prescription.patientId,
      ...settledPrescriptionInvoice(tx.invoice.fields.patientShare),
    },
    include: { prepaidPrescription: { select: { preAuthorizationId: true } } },
  });
  if (!invoice)
    throw new BadRequestException(
      'يجب تسوية فاتورة الوصفة لدى الخزينة قبل الصرف',
    );
  await assertLinkedAuthorization(tx, invoice);
  const balance = await adjustmentBalance(
    tx,
    invoice.hospitalId,
    invoice.id,
    invoice.patientShare,
    invoice.paidAmount,
  );
  if (balance.balance.gt(0))
    throw new BadRequestException('توجد مبالغ متبقية على فاتورة الوصفة');
  return invoice;
}
