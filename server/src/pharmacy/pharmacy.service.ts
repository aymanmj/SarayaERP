import { usableStockWhere } from '../inventory/stock-batch-safety';
import {
  adjustPharmacyStock,
  type ManualAdjustment,
} from './manual-stock-adjustment';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChargeSource,
  PrescriptionStatus,
  InvoiceStatus,
  MedicationRoute,
  MedicationFrequency,
  ProductType,
  StockTransactionType,
  PaymentMethod,
  PharmacistVerificationStatus,
  Prisma,
} from '@prisma/client';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DispenseCompletedEvent } from './events/dispense-completed.event';
import { guardCashierMovement } from '../cashier/cash-control';
import { AccountingService } from '../accounting/accounting.service'; // Fixed relative import
import { CDSSService } from '../cdss/cdss.service';

import {
  confirmPrescriptionSettlement,
  createPrescriptionInvoice,
  pricePrescription,
  pricePrescriptionCoverage,
  prescriptionBillingService,
  settledPrescriptionInvoice,
  currentPrescriptionAuthorization,
} from './prescription-prepayment';
import { captureInvoiceSnapshot } from '../billing/invoice-snapshot';
import { createHash } from 'node:crypto';
import {
  cancelledPrescriptionInvoice,
  findPrescriptionReplacement,
} from './prescription-replacement';

@Injectable()
export class PharmacyService {
  private readonly logger = new Logger(PharmacyService.name);
  constructor(
    private prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private accounting: AccountingService,
    @Inject(forwardRef(() => CDSSService))
    private cdssService: CDSSService,
  ) {}

  private async lockDispense(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    prescriptionId: number,
    items?: {
      prescriptionItemId: number;
      quantity: number;
      dispensedDrugItemId?: number;
    }[],
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
    const patients = await tx.$queryRaw<
      { id: number }[]
    >`SELECT p.id FROM "Patient" p JOIN "Prescription" r ON r."patientId"=p.id WHERE r.id=${prescriptionId} AND r."hospitalId"=${hospitalId} AND p."hospitalId"=${hospitalId} AND p."isDeleted"=false AND p."isActive"=true FOR UPDATE OF p`;
    const encounters = await tx.$queryRaw<
      { id: number }[]
    >`SELECT e.id FROM "Encounter" e JOIN "Prescription" r ON r."encounterId"=e.id WHERE r.id=${prescriptionId} AND r."hospitalId"=${hospitalId} AND e."hospitalId"=${hospitalId} AND e."patientId"=r."patientId" AND e."isDeleted"=false FOR UPDATE OF e`;
    if (patients.length !== 1 || encounters.length !== 1)
      throw new NotFoundException(
        'الوصفة أو المريض أو الحالة غير متاحين ضمن المنشأة',
      );
    await tx.$queryRaw`SELECT id FROM "Prescription" WHERE id=${prescriptionId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
    const lines = await tx.prescriptionItem.findMany({
      where: { prescriptionId },
      select: { productId: true },
    });
    const ids = [
      ...new Set([
        ...lines.map((l) => l.productId),
        ...(items ?? [])
          .map((i) => i.dispensedDrugItemId)
          .filter((id): id is number => id !== undefined),
      ]),
    ].sort((a, b) => a - b);
    for (const id of ids) {
      const rows = await tx.$queryRaw<
        { id: number }[]
      >`SELECT id FROM "Product" WHERE id=${id} AND "hospitalId"=${hospitalId} AND "isActive"=true AND "isDeleted"=false AND type='DRUG' FOR UPDATE`;
      if (rows.length !== 1)
        throw new BadRequestException('الصنف خارج المنشأة أو غير متاح');
    }
  }
  private validateDispenseItems(
    lines: {
      id: number;
      productId: number;
      quantity: number | Prisma.Decimal;
    }[],
    items?: {
      prescriptionItemId: number;
      quantity: number;
      dispensedDrugItemId?: number;
    }[],
    finalPartial = false,
  ) {
    if (
      !lines.length ||
      lines.some(
        (line) =>
          !new Prisma.Decimal(line.quantity).isFinite() ||
          new Prisma.Decimal(line.quantity).lte(0),
      ) ||
      (items &&
        (!items.length ||
          items.length !== lines.length ||
          new Set(items.map((i) => i.prescriptionItemId)).size !==
            items.length))
    )
      throw new BadRequestException('بنود الصرف فارغة أو مكررة');
    for (const item of items ?? []) {
      const line = lines.find((l) => l.id === item.prescriptionItemId);
      if (
        !line ||
        !Number.isFinite(item.quantity) ||
        (finalPartial
          ? !Number.isInteger(item.quantity) ||
            item.quantity < 0 ||
            Money.gt(item.quantity, line.quantity)
          : !Money.eq(item.quantity, line.quantity)) ||
        (item.dispensedDrugItemId &&
          item.dispensedDrugItemId !== line.productId)
      )
        throw new BadRequestException(
          'يلزم صرف الكمية والصنف المعتمدين؛الصرف الجزئي والبدائل يحتاجان دورة اعتماد مستقلة',
        );
    }
    if (
      finalPartial &&
      (!items ||
        !items.some(({ quantity }) => quantity > 0) ||
        !items.some(({ prescriptionItemId, quantity }) =>
          Money.lt(
            quantity,
            lines.find(({ id }) => id === prescriptionItemId)!.quantity,
          ),
        ))
    ) {
      throw new BadRequestException(
        'يلزم صرف كمية موجبة أقل من الوصفة لإقفال المتبقي',
      );
    }
  }

  async pharmacySourcePolicy(hospitalId: number) {
    return (
      (await this.prisma.pharmacyWarehousePolicy.findUnique({
        where: { hospitalId },
        include: {
          warehouse: { select: { id: true, name: true, isActive: true } },
        },
      })) ?? { hospitalId, warehouseId: null, warehouse: null }
    );
  }

  async pharmacySourceWarehouses(hospitalId: number) {
    return this.prisma.warehouse.findMany({
      where: { hospitalId, isActive: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  async configurePharmacySource(
    hospitalId: number,
    userId: number,
    dto: { warehouseId: number; reason: string },
  ) {
    if (
      !Number.isInteger(dto.warehouseId) ||
      dto.warehouseId <= 0 ||
      dto.warehouseId > 2147483647 ||
      typeof dto.reason !== 'string' ||
      dto.reason.trim().length < 10 ||
      dto.reason.length > 500
    )
      throw new BadRequestException('يلزم مخزن صالح وسبب واضح من10 إلى500 حرف');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
      if (
        !(await tx.user.findFirst({
          where: { id: userId, hospitalId, isActive: true, isDeleted: false },
        }))
      )
        throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
      const warehouses = await tx.$queryRaw<
        { id: number }[]
      >`SELECT id FROM "Warehouse" WHERE id=${dto.warehouseId} AND "hospitalId"=${hospitalId} AND "isActive"=true FOR SHARE`;
      if (warehouses.length !== 1)
        throw new BadRequestException('المخزن غير نشط أو خارج المنشأة');
      const previous = await tx.pharmacyWarehousePolicy.findUnique({
        where: { hospitalId },
      });
      const result = await tx.pharmacyWarehousePolicy.upsert({
        where: { hospitalId },
        create: {
          hospitalId,
          warehouseId: dto.warehouseId,
          updatedById: userId,
        },
        update: { warehouseId: dto.warehouseId, updatedById: userId },
      });
      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'CONFIGURE_PHARMACY_WAREHOUSE',
        entity: 'PharmacyWarehousePolicy',
        entityId: result.id,
        details: {
          reason: dto.reason.trim(),
          previousWarehouseId: previous?.warehouseId ?? null,
          warehouseId: dto.warehouseId,
        },
      });
      return result;
    });
  }

  private async getPharmacyWarehouseId(
    tx: Prisma.TransactionClient,
    hospitalId: number,
  ): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
    const policy = await tx.pharmacyWarehousePolicy.findUnique({
      where: { hospitalId },
    });
    if (!policy)
      throw new BadRequestException(
        'يلزم تعيين مخزن الصيدلية صراحةً من الإعدادات قبل تسجيل الحركة',
      );
    const warehouses = await tx.$queryRaw<
      { id: number }[]
    >`SELECT id FROM "Warehouse" WHERE id=${policy.warehouseId} AND "hospitalId"=${hospitalId} AND "isActive"=true FOR SHARE`;
    if (warehouses.length !== 1)
      throw new BadRequestException(
        'مخزن الصيدلية غير نشط أو خارج المنشأة؛راجع إعداد المصدر',
      );
    return policy.warehouseId;
  }

  // ... (allocateStockFEFO implementation omitted for brevity) ...
  // ⚡ خوارزمية FEFO مع الاستعداد للقفل التفاؤلي (Optimistic Locking)
  private async allocateStockFEFO(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    warehouseId: number,
    productId: number,
    requestedQty: number,
    productName: string,
  ) {
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      throw new BadRequestException('كمية الصرف يجب أن تكون موجبة ومحدودة');
    }
    const stocks = await tx.productStock.findMany({
      where: {
        warehouseId,
        ...(await usableStockWhere(tx, hospitalId, productId)),
        quantity: { gt: 0 },
      },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    const totalAvailable = stocks.reduce(
      (sum, s) => sum.plus(s.quantity),
      new Prisma.Decimal(0),
    );

    if (totalAvailable.lt(requestedQty)) {
      throw new BadRequestException(
        `رصيد غير كافٍ للصنف "${productName}". المتاح: ${totalAvailable.toString()}، المطلوب: ${requestedQty}.`,
      );
    }

    const allocation: {
      stockId: number;
      batchNumber: string | null;
      expiryDate: Date | null;
      quantity: number;
      currentVersion: number;
    }[] = [];

    let remainingToPick = new Prisma.Decimal(requestedQty);

    for (const stock of stocks) {
      if (remainingToPick.lte(0)) break;
      const swallow = Prisma.Decimal.min(remainingToPick, stock.quantity);

      allocation.push({
        stockId: stock.id,
        batchNumber: stock.batchNumber,
        expiryDate: stock.expiryDate,
        quantity: swallow.toNumber(),
        currentVersion: stock.version,
      });

      remainingToPick = remainingToPick.minus(swallow);
    }

    return allocation;
  }

  async getWorklist(hospitalId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const where: Prisma.PrescriptionWhereInput = {
      hospitalId,
      status: PrescriptionStatus.ACTIVE,
      encounter: { hospitalId, status: 'OPEN', isDeleted: false },
      dispenses: { none: {} },
      OR: [
        { prepaidInvoiceId: null },
        {
          prepaidInvoice: {
            hospitalId,
            ...settledPrescriptionInvoice(
              this.prisma.invoice.fields.patientShare,
            ),
          },
          OR: [
            { preAuthorizationId: null },
            {
              preAuthorization: {
                hospitalId,
                ...currentPrescriptionAuthorization(),
              },
            },
          ],
        },
      ],
    };
    const [prescriptions, totalCount] = await this.prisma.$transaction([
      this.prisma.prescription.findMany({
        where,
        include: {
          patient: { select: { id: true, fullName: true, mrn: true } },
          doctor: { select: { id: true, fullName: true } },
          encounter: { select: { id: true, type: true } },
          items: { include: { product: true } },
          prepaidInvoice: {
            select: {
              coveragePolicyId: true,
              insuranceProviderId: true,
              insuranceShare: true,
              patientShare: true,
              payments: {
                where: {
                  OR: [
                    { isDepositApplication: true },
                    { method: { notIn: ['CASH', 'CARD', 'TRANSFER'] } },
                  ],
                },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.prescription.count({
        where,
      }),
    ]);

    const mapped = prescriptions.map((p) => ({
      prepaidInvoiceId: p.prepaidInvoiceId,
      partialClosureEligible: Boolean(
        p.encounter?.type === 'OPD' &&
          p.prepaidInvoice?.coveragePolicyId &&
          p.prepaidInvoice.insuranceProviderId &&
          Money.isPositive(p.prepaidInvoice.patientShare) &&
          Money.isPositive(p.prepaidInvoice.insuranceShare) &&
          !p.prepaidInvoice.payments.length &&
          (p.items.length > 1 || p.items.some((item) => item.quantity > 1)),
      ),
      id: p.id,
      status: p.status,
      pharmacistVerificationStatus: p.pharmacistVerificationStatus,
      createdAt: p.createdAt,
      encounterId: p.encounter?.id ?? null,
      encounter: p.encounter
        ? { id: p.encounter.id, type: p.encounter.type }
        : null,
      patient: p.patient,
      doctor: p.doctor,
      items: p.items.map((it) => ({
        id: it.id,
        dose: it.dose,
        route: it.route,
        frequency: it.frequency,
        durationDays: it.durationDays,
        quantity: it.quantity,
        notes: it.notes,
        drugItem: it.product
          ? {
              id: it.product.id,
              code: it.product.code,
              name: it.product.name,
              genericName: it.product.genericName,
              strength: it.product.strength,
              form: it.product.form,
              unitPrice:
                it.prepaidUnitPrice === null
                  ? Number(it.product.sellPrice ?? 0)
                  : Money.toDbString(it.prepaidUnitPrice),
            }
          : null,
      })),
    }));

    return {
      data: mapped,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  async getEncounterPrescriptions(hospitalId: number, encounterId: number) {
    const list = await this.prisma.prescription.findMany({
      where: {
        hospitalId,
        encounterId,
        OR: [
          { status: { not: 'CANCELLED' } },
          { prepaidInvoiceId: { not: null } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      omit: { replacementFingerprint: true },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        doctor: { select: { id: true, fullName: true } },
        items: { include: { product: true } },
        replacesPrescription: { select: { id: true, prepaidInvoiceId: true } },
        replacement: { select: { id: true, prepaidInvoiceId: true } },
        dispenses: {
          where: { partialClosureReason: { not: null } },
          select: {
            partialClosureReason: true,
            items: { select: { prescriptionItemId: true, quantity: true } },
          },
          take: 1,
        },
        preAuthorization: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            decisionReason: true,
          },
        },
      },
    });

    return list.map(({ dispenses, ...prescription }) => {
      const partial = dispenses?.[0];
      return {
        ...prescription,
        partialClosureReason: partial?.partialClosureReason ?? null,
        items: prescription.items.map((item) => ({
          ...item,
          drugItem: item.product,
          dispensedQuantity:
            partial?.items
              .filter((row) => row.prescriptionItemId === item.id)
              .reduce(
                (quantity, row) => quantity.plus(row.quantity),
                new Prisma.Decimal(0),
              )
              .toString() ?? null,
        })),
      };
    });
  }

  async getDrugCatalog(hospitalId: number, q?: string) {
    return this.prisma.product.findMany({
      where: {
        hospitalId,
        type: ProductType.DRUG,
        isActive: true,
        isDeleted: false,
        ...(q && q.trim().length > 0
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { genericName: { contains: q, mode: 'insensitive' } },
                { code: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        genericName: true,
        strength: true,
        form: true,
        sellPrice: true,
        rxNormCode: true, // ✅ Add RxNorm
      },
    });
  }

  // ✅ [UPDATED] إنشاء وصفة مع فحص الأمان (Safety Check)
  async createPrescriptionForEncounter(params: {
    hospitalId: number;
    encounterId: number;
    doctorId: number;
    notes?: string;
    overrideSafety?: boolean; // 👈 إضافة خيار تجاوز التحذيرات
    overrideReason?: string; // 👈 إضافة مبرر التجاوز
    replacement?: { originalId: number; reason: string };
    items: {
      drugItemId: number;
      dose: string;
      route: string;
      frequency: string;
      durationDays: number;
      quantity: number;
      notes?: string;
    }[];
  }) {
    const { hospitalId, encounterId, doctorId, notes, items } = params;

    if (!items || items.length === 0)
      throw new BadRequestException('لا توجد أدوية.');

    const replacement = params.replacement;
    const replacementReason = replacement?.reason.trim();
    if (
      replacement &&
      (!replacementReason ||
        replacementReason.length < 5 ||
        (params.overrideSafety &&
          (params.overrideReason?.trim().length ?? 0) < 5))
    )
      throw new BadRequestException('يلزم توثيق سبب التصحيح وأي تجاوز سريري');
    const identity = replacement && {
      hospitalId,
      encounterId,
      doctorId,
      originalId: replacement.originalId,
      fingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            reason: replacementReason,
            notes,
            overrideSafety: params.overrideSafety === true,
            overrideReason: params.overrideReason?.trim(),
            items: items.map(
              ({
                drugItemId,
                dose,
                route,
                frequency,
                durationDays,
                quantity,
                notes,
              }) => ({
                drugItemId,
                dose,
                route,
                frequency,
                durationDays,
                quantity,
                notes,
              }),
            ),
          }),
        )
        .digest('hex'),
    };
    if (identity) {
      const replay = await findPrescriptionReplacement(this.prisma, identity);
      if (replay) return replay;
    }

    // 1. جلب بيانات المريض والحساسيات
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patient: {
          include: { allergies: true }, // 👈 جلب الحساسيات
        },
      },
    });

    if (!encounter || encounter.hospitalId !== hospitalId)
      throw new BadRequestException('الحالة غير صحيحة.');

    if (
      items.some(
        ({ quantity }) =>
          !Number.isSafeInteger(quantity) ||
          quantity <= 0 ||
          quantity > 2147483647,
      )
    )
      throw new BadRequestException('كمية الوصفة غير صالحة');
    const productIds = items.map((item) => item.drugItemId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        hospitalId,
        type: ProductType.DRUG,
        isActive: true,
        isDeleted: false,
      },
    });

    // 2. تشغيل الفحص السريري الشامل باستخدام CDSS
    const cdssResult = await this.cdssService.checkPrescription({
      patientId: encounter.patientId,
      hospitalId,
      userId: doctorId,
      drugs: items.map((it) => {
        const prod = products.find((p) => p.id === it.drugItemId);
        return {
          productId: it.drugItemId,
          genericName: prod?.genericName || prod?.name || '',
          dose: it.dose,
          route: it.route,
        };
      }),
    });

    const blockers = cdssResult.alerts.filter((a) => a.requiresOverride);

    if (blockers.length > 0 && !params.overrideSafety) {
      throw new BadRequestException({
        message: '⚠️ تحذير سلامة: تم اكتشاف مخاطر سريرية حرجة تتطلب التجاوز.',
        code: 'SAFETY_WARNING',
        interactions: blockers.map((b) => ({
          drugs:
            b.context?.drug || b.context?.drugA
              ? [b.context?.drug || b.context?.drugA, b.context?.drugB].filter(
                  Boolean,
                )
              : [],
          description: b.messageAr || b.message,
          severity: b.severity,
        })),
      });
    }

    // 4. إنشاء الوصفة وتخزين التنبيهات المرتبطة بها
    return this.prisma.$transaction(async (tx) => {
      const [patient] = await tx.$queryRaw<
        { id: number; insurancePolicyId: number | null }[]
      >`SELECT id, "insurancePolicyId" FROM "Patient" WHERE id=${encounter.patientId} AND "hospitalId"=${hospitalId} AND "isActive" AND NOT "isDeleted" FOR UPDATE`;
      const [openEncounter] = await tx.$queryRaw<
        { id: number }[]
      >`SELECT id FROM "Encounter" WHERE id=${encounterId} AND "hospitalId"=${hospitalId} AND "patientId"=${encounter.patientId} AND status='OPEN' AND NOT "isDeleted" FOR UPDATE`;
      if (!patient || !openEncounter)
        throw new BadRequestException(
          'الحالة أو المريض غير متاحين لتسجيل الوصفة',
        );
      let originalInvoiceId: number | null = null;
      if (identity) {
        const replay = await findPrescriptionReplacement(tx, identity);
        if (replay) return replay;
        originalInvoiceId = await cancelledPrescriptionInvoice(
          tx,
          identity,
          patient.id,
        );
      }
      const prices = await pricePrescription(tx, hospitalId, items);
      const amount = Money.toDbString(
        Money.sumPosted(...prices.map(({ amount }) => amount)),
      );
      const service = await prescriptionBillingService(tx, hospitalId);
      const coverage = await pricePrescriptionCoverage(
        tx,
        {
          hospitalId,
          patientId: patient.id,
          insurancePolicyId: patient.insurancePolicyId,
        },
        service.id,
        amount,
      );
      const waiting =
        coverage.requiresAuthorization && !coverage.preAuthorizationId;
      const request = waiting
        ? await tx.preAuthorization.create({
            data: {
              hospitalId,
              patientId: patient.id,
              policyId: patient.insurancePolicyId!,
              serviceItemId: service.id,
              requestedAmount: coverage.insuranceShare,
              isPrescriptionRequest: true,
            },
          })
        : null;
      const invoice = waiting
        ? null
        : await createPrescriptionInvoice(tx, {
            hospitalId,
            encounterId,
            patientId: encounter.patientId,
            amount,
            coverage,
          });
      const pres = await tx.prescription.create({
        omit: { replacementFingerprint: true },
        data: {
          hospitalId,
          encounterId,
          patientId: encounter.patientId,
          doctorId,
          prepaidInvoiceId: invoice?.id,
          preAuthorizationId: request?.id ?? coverage.preAuthorizationId,
          replacesPrescriptionId: identity?.originalId,
          replacementReason,
          replacementFingerprint: identity?.fingerprint,
          status: waiting
            ? PrescriptionStatus.DRAFT
            : PrescriptionStatus.ACTIVE,
          notes,
        },
      });

      for (const [index, item] of items.entries()) {
        await tx.prescriptionItem.create({
          data: {
            prescriptionId: pres.id,
            productId: item.drugItemId,
            dose: item.dose,
            route: (item.route as MedicationRoute) || MedicationRoute.OTHER,
            frequency:
              (item.frequency as MedicationFrequency) ||
              MedicationFrequency.OTHER,
            durationDays: item.durationDays,
            quantity: item.quantity,
            prepaidUnitPrice: prices[index].unitPrice,
            notes: item.notes,
          },
        });
      }

      if (invoice) {
        await this.postPrescriptionCharge(tx, {
          hospitalId,
          encounterId,
          serviceItemId: service.id,
          prescriptionId: pres.id,
          invoiceId: invoice.id,
          userId: doctorId,
          amount,
        });
      }
      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: doctorId,
        action: waiting
          ? 'PRESCRIPTION_AUTHORIZATION_REQUESTED'
          : identity
            ? 'REPLACE_PREPAID_PRESCRIPTION'
            : 'PHARMACY_PREPAYMENT_INVOICED',
        entity: 'Prescription',
        entityId: pres.id,
        details: {
          invoiceId: invoice?.id ?? null,
          amount,
          ...coverage,
          preAuthorizationId: request?.id ?? coverage.preAuthorizationId,
          ...(identity
            ? {
                originalPrescriptionId: identity.originalId,
                originalInvoiceId,
                reason: replacementReason,
              }
            : {}),
        },
      });

      // حفظ التنبيهات المرتبطة بهذه الوصفة في قاعدة البيانات
      for (const alert of cdssResult.alerts) {
        const isOverridden =
          alert.requiresOverride || alert.context?.autoSuppressed;
        await tx.cDSSAlert.create({
          data: {
            hospitalId,
            patientId: encounter.patientId,
            encounterId,
            prescriptionId: pres.id,
            alertType: alert.type,
            severity: alert.severity,
            message: alert.message,
            messageAr: alert.messageAr || alert.message,
            context: alert.context as any,
            status: isOverridden ? 'OVERRIDDEN' : 'ACTIVE',
            acknowledgedById: doctorId,
            acknowledgedAt: isOverridden ? new Date() : null,
            overrideReason: alert.context?.autoSuppressed
              ? `Auto-Suppressed: ${alert.context?.originalOverrideReason}`
              : alert.requiresOverride
                ? params.overrideReason ||
                  'Overridden by doctor during prescription creation'
                : null,
          },
        });
      }

      return pres;
    });
  }

  private async postPrescriptionCharge(
    tx: Prisma.TransactionClient,
    data: {
      hospitalId: number;
      encounterId: number;
      serviceItemId: number;
      prescriptionId: number;
      invoiceId: number;
      userId: number;
      amount: string;
    },
  ) {
    await tx.encounterCharge.create({
      data: {
        hospitalId: data.hospitalId,
        encounterId: data.encounterId,
        invoiceId: data.invoiceId,
        serviceItemId: data.serviceItemId,
        sourceType: ChargeSource.PHARMACY_PRESCRIPTION,
        sourceId: data.prescriptionId,
        quantity: 1,
        unitPrice: data.amount,
        totalAmount: data.amount,
      },
    });
    if (Money.isPositive(data.amount)) {
      await this.accounting.recordInvoiceEntry({
        prisma: tx,
        hospitalId: data.hospitalId,
        invoiceId: data.invoiceId,
        userId: data.userId,
      });
      await captureInvoiceSnapshot(tx, data.hospitalId, data.invoiceId);
    }
  }

  async reviewPrescriptionAuthorization(
    hospitalId: number,
    authorizationId: number,
    userId: number,
    input: {
      status?: unknown;
      authCode?: unknown;
      approvedAmount?: unknown;
      expiresAt?: unknown;
      decisionReason?: unknown;
    },
  ) {
    const { status } = input;
    const reason =
      typeof input.decisionReason === 'string'
        ? input.decisionReason.trim()
        : '';
    if (
      !['APPROVED', 'REJECTED'].some((value) => value === status) ||
      reason.length < 5 ||
      reason.length > 1000
    )
      throw new BadRequestException('يلزم توثيق قرار الموافقة أو الرفض وسببه');
    const approved = status === 'APPROVED';
    const code =
      typeof input.authCode === 'string' ? input.authCode.trim() : '';
    const amount =
      typeof input.approvedAmount === 'string' &&
      /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(input.approvedAmount)
        ? Money.toDbString(input.approvedAmount)
        : null;
    const expiry =
      typeof input.expiresAt === 'string' ? new Date(input.expiresAt) : null;
    if (
      approved &&
      (!code ||
        code.length > 200 ||
        !Money.isPositive(amount) ||
        (input.expiresAt != null &&
          (!expiry || !Number.isFinite(expiry.getTime()))))
    )
      throw new BadRequestException(
        'رمز الاعتماد أو المبلغ أو تاريخ الانتهاء غير صالح',
      );
    const decision = {
      status: approved ? 'APPROVED' : 'REJECTED',
      decisionReason: reason,
      authCode: approved ? code : null,
      approvedAmount: approved ? amount : null,
      expiresAt: approved ? expiry : null,
    };
    const original = await this.prisma.prescription.findFirst({
      where: { hospitalId, preAuthorizationId: authorizationId },
      select: { id: true, patientId: true, encounterId: true },
    });
    if (!original) throw new NotFoundException('طلب الوصفة غير موجود');

    return this.prisma.$transaction(async (tx) => {
      const [patient] = await tx.$queryRaw<
        { insurancePolicyId: number | null }[]
      >`
        SELECT "insurancePolicyId" FROM "Patient"
        WHERE id = ${original.patientId} AND "hospitalId" = ${hospitalId}
          AND "isActive" AND NOT "isDeleted" FOR UPDATE
      `;
      const [encounter] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM "Encounter"
        WHERE id = ${original.encounterId} AND "hospitalId" = ${hospitalId}
          AND "patientId" = ${original.patientId} AND NOT "isDeleted" FOR UPDATE
      `;
      if (!patient || !encounter)
        throw new NotFoundException('المريض أو الحالة غير متاحين');
      await tx.$queryRaw`SELECT id FROM "Prescription" WHERE id = ${original.id} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "PreAuthorization" WHERE id = ${authorizationId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const prescription = await tx.prescription.findFirstOrThrow({
        where: {
          ...original,
          hospitalId,
          preAuthorizationId: authorizationId,
        },
        include: { items: true },
      });
      const authorization = await tx.preAuthorization.findFirstOrThrow({
        where: {
          id: authorizationId,
          hospitalId,
          patientId: original.patientId,
          isPrescriptionRequest: true,
        },
      });
      const sameDecision =
        authorization.status === decision.status &&
        authorization.decisionReason === reason &&
        authorization.authCode === decision.authCode &&
        Money.eq(authorization.approvedAmount, decision.approvedAmount) &&
        authorization.expiresAt?.getTime() === decision.expiresAt?.getTime();
      if (sameDecision && (!approved || prescription.prepaidInvoiceId))
        return authorization;
      if (
        prescription.status !== PrescriptionStatus.DRAFT ||
        prescription.prepaidInvoiceId ||
        !['PENDING', 'REJECTED'].includes(authorization.status)
      )
        throw new ConflictException('سبق حسم هذا الطلب وإصدار فاتورته');

      let invoiceId: number | null = null;
      if (approved) {
        if (
          encounter.status !== 'OPEN' ||
          patient.insurancePolicyId !== authorization.policyId
        )
          throw new ConflictException(
            'تغيّرت حالة الزيارة أو بوليصة الوصفة منذ تسجيل الطلب',
          );
        if (expiry && expiry.getTime() <= Date.now())
          throw new BadRequestException('انتهت صلاحية الموافقة');
        if (
          !prescription.items.length ||
          prescription.items.some((item) => item.prepaidUnitPrice == null)
        )
          throw new ConflictException('تسعير الوصفة المثبّت غير متاح');
        const service = await prescriptionBillingService(tx, hospitalId);
        if (service.id !== authorization.serviceItemId)
          throw new ConflictException(
            'تغيّرت خدمة فوترة الوصفة منذ تسجيل الطلب',
          );
        await pricePrescription(
          tx,
          hospitalId,
          prescription.items.map((item) => ({
            drugItemId: item.productId,
            quantity: item.quantity,
          })),
        );
        const total = Money.toDbString(
          Money.sumPosted(
            ...prescription.items.map((item) =>
              Money.decimal(item.prepaidUnitPrice).times(item.quantity),
            ),
          ),
        );
        const coverage = await pricePrescriptionCoverage(
          tx,
          {
            hospitalId,
            patientId: original.patientId,
            insurancePolicyId: authorization.policyId,
          },
          service.id,
          total,
          true,
        );
        if (
          !coverage.requiresAuthorization ||
          !Money.eq(coverage.insuranceShare, authorization.requestedAmount)
        )
          throw new ConflictException(
            'تغيّرت التغطية منذ تسجيل الطلب؛ يلزم مراجعة الوصفة',
          );
        if (Money.lt(amount, coverage.insuranceShare))
          throw new BadRequestException('المبلغ المعتمد لا يغطي حصة التأمين');
        const invoice = await createPrescriptionInvoice(tx, {
          hospitalId,
          ...original,
          amount: total,
          coverage,
        });
        invoiceId = invoice.id;
        await tx.prescription.update({
          where: { id: original.id },
          data: {
            status: PrescriptionStatus.ACTIVE,
            prepaidInvoiceId: invoice.id,
          },
        });
        await this.postPrescriptionCharge(tx, {
          hospitalId,
          encounterId: original.encounterId,
          invoiceId: invoice.id,
          prescriptionId: original.id,
          serviceItemId: service.id,
          userId,
          amount: total,
        });
      }
      const result = await tx.preAuthorization.update({
        where: { id: authorizationId },
        data: decision,
      });
      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: approved
          ? 'PRESCRIPTION_AUTHORIZATION_APPROVED'
          : 'PRESCRIPTION_AUTHORIZATION_REJECTED',
        entity: 'Prescription',
        entityId: original.id,
        details: {
          authorizationId,
          invoiceId,
          reason,
          approvedAmount: decision.approvedAmount,
        },
      });
      return result;
    });
  }

  // -----------------------------------------------------------------------
  // 🟢 CPOE: التحقق الصيدلاني (Pharmacist Verification) - HIMSS Stage 6
  // -----------------------------------------------------------------------
  async verifyOrder(
    prescriptionId: number,
    pharmacistId: number,
    hospitalId: number,
  ) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId, hospitalId },
      include: {
        items: { include: { product: true } },
        patient: { include: { allergies: true } },
      },
    });

    if (!prescription) throw new NotFoundException('الوصفة غير موجودة.');
    if (prescription.status !== PrescriptionStatus.ACTIVE)
      throw new BadRequestException('الوصفة غير متاحة للمراجعة الصيدلانية');

    // 1. تشغيل التدقيق السريري العميق CDSS قبل الاعتماد النهائي (للتحق من عدم تغير حالة المريض منذ وصف الطبيب)
    const safety = await this.cdssService.checkPrescription({
      patientId: prescription.patientId,
      hospitalId,
      userId: pharmacistId,
      drugs: prescription.items.map((item) => ({
        productId: item.productId,
        genericName: item.product.genericName || item.product.name,
        dose: item.dose,
        route: item.route,
      })),
    });
    if (
      safety.alerts.some(
        (alert) => alert.requiresOverride || alert.severity === 'CRITICAL',
      )
    ) {
      throw new BadRequestException({
        message: 'تستلزم الوصفة مراجعة مخاطر السلامة قبل اعتمادها.',
        code: 'SAFETY_WARNING',
        alerts: safety.alerts,
      });
    }

    return this.prisma.prescription.update({
      where: {
        id: prescription.id,
        hospitalId,
        status: PrescriptionStatus.ACTIVE,
      },
      data: {
        pharmacistVerificationStatus: PharmacistVerificationStatus.VERIFIED,
        verifiedById: pharmacistId,
        verifiedAt: new Date(),
      },
    });
  }

  // -----------------------------------------------------------------------
  // 🟢 عمليات الصرف (Dispense) - ✅ تحديث القفل التفاؤلي
  // -----------------------------------------------------------------------

  async dispensePrescription(params: {
    hospitalId: number;
    prescriptionId: number;
    pharmacistId: number;
    notes?: string;
    partialClosureReason?: string;
    items?: {
      prescriptionItemId: number;
      quantity: number;
      dispensedDrugItemId?: number;
    }[];
  }) {
    const { hospitalId, prescriptionId, pharmacistId, notes, items } = params;
    const finalPartial = params.partialClosureReason !== undefined;
    const partialClosureReason = params.partialClosureReason;
    if (
      finalPartial &&
      (typeof partialClosureReason !== 'string' ||
        partialClosureReason.trim().length < 5 ||
        partialClosureReason.trim().length > 1000)
    )
      throw new BadRequestException('يلزم توثيق سبب إقفال الكمية غير المصروفة');
    if (
      finalPartial &&
      (!Array.isArray(items) ||
        items.some(
          (item) => !item || !Number.isInteger(item.prescriptionItemId),
        ))
    )
      throw new BadRequestException('يلزم تحديد بنود الوصفة وكمياتها');
    let calculatedTotalCost = new Prisma.Decimal(0);

    // سنحاول العملية، إذا فشلت بسبب التزامن، الفرونت إند يجب أن يعيد المحاولة أو يظهر رسالة
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockDispense(tx, hospitalId, prescriptionId, items);
      const warehouseId = await this.getPharmacyWarehouseId(tx, hospitalId);
      const prescription = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: {
          items: { include: { product: true } },
          encounter: true,
        },
      });

      if (!prescription) throw new NotFoundException('الوصفة غير موجودة.');
      if (
        prescription.hospitalId !== hospitalId ||
        prescription.encounter.status !== 'OPEN'
      )
        throw new BadRequestException('الوصفة خارج المنشأة أو الحالة مغلقة');
      if (finalPartial && prescription.encounter.type !== 'OPD')
        throw new BadRequestException(
          'إقفال الصرف الجزئي متاح لوصفات العيادات الخارجية',
        );
      this.validateDispenseItems(prescription.items, items, finalPartial);
      if (prescription.status !== PrescriptionStatus.ACTIVE) {
        throw new BadRequestException('حالة الوصفة لا تسمح بالصرف.');
      }

      // 🛡️ CPOE Check: يمنع صرف العلاج دون تحقق صيدلاني
      if (
        prescription.pharmacistVerificationStatus !==
        PharmacistVerificationStatus.VERIFIED
      ) {
        throw new BadRequestException(
          'لا يمكن الصرف: الوصفة لم تخضع للتدقيق والاعتماد الصيدلاني (CPOE).',
        );
      }

      if (finalPartial && prescription.prepaidInvoiceId != null)
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${prescription.prepaidInvoiceId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const prepaidInvoice =
        prescription.prepaidInvoiceId == null
          ? null
          : await confirmPrescriptionSettlement(tx, {
              prepaidInvoiceId: prescription.prepaidInvoiceId,
              hospitalId,
              encounterId: prescription.encounterId,
              patientId: prescription.patientId,
            });
      if (
        finalPartial &&
        (!prepaidInvoice ||
          !prepaidInvoice.coveragePolicyId ||
          !prepaidInvoice.insuranceProviderId ||
          !Money.isPositive(prepaidInvoice.insuranceShare) ||
          !Money.isPositive(prepaidInvoice.patientShare) ||
          !Money.eq(prepaidInvoice.paidAmount, prepaidInvoice.patientShare) ||
          !Money.isZero(prepaidInvoice.discountAmount) ||
          !Money.eq(
            prepaidInvoice.patientShare.plus(prepaidInvoice.insuranceShare),
            prepaidInvoice.totalAmount,
          ))
      )
        throw new BadRequestException(
          'إقفال الصرف الجزئي يتطلب وصفة مؤمّنة وحصة مريض مسددة بإيصالات قابلة للرد',
        );
      if (finalPartial && prepaidInvoice) {
        const payments = await tx.payment.findMany({
          where: { hospitalId, invoiceId: prepaidInvoice.id },
          select: { amount: true, method: true, isDepositApplication: true },
        });
        if (
          ![null, 'PENDING'].includes(prepaidInvoice.claimStatus) ||
          payments.some(
            ({ method, isDepositApplication }) =>
              isDepositApplication ||
              !['CASH', 'CARD', 'TRANSFER'].includes(method),
          ) ||
          !Money.eq(
            Money.sumDecimal(...payments.map(({ amount }) => amount)),
            prepaidInvoice.patientShare,
          ) ||
          (await tx.claim.count({
            where: { hospitalId, invoiceId: prepaidInvoice.id },
          })) ||
          (await tx.insuranceSettlementAllocation.count({
            where: { invoiceId: prepaidInvoice.id },
          })) ||
          (await tx.invoiceAdjustment.count({
            where: {
              hospitalId,
              invoiceId: prepaidInvoice.id,
              status: { in: ['PENDING', 'POSTED'] },
            },
          }))
        )
          throw new BadRequestException(
            'يلزم مطابقة إيصالات الوصفة والتأكد من عدم وجود مطالبة أو تسوية قبل الإقفال الجزئي',
          );
      }
      if (prepaidInvoice) {
        const frozenTotal = Money.sumPosted(
          ...prescription.items.map((item) => {
            if (item.prepaidUnitPrice == null)
              throw new ConflictException('لا يوجد سعر مثبت لبند الوصفة');
            return Money.decimal(item.prepaidUnitPrice).times(item.quantity);
          }),
        );
        if (!Money.eq(frozenTotal, prepaidInvoice.totalAmount))
          throw new ConflictException('أسعار الوصفة المثبتة لا تطابق الفاتورة');
        if (finalPartial) {
          const quantities = new Map(
            items?.map((item) => [item.prescriptionItemId, item.quantity]),
          );
          const actual = Money.sumPosted(
            ...prescription.items.map((item) =>
              Money.multiply(
                item.prepaidUnitPrice,
                quantities.get(item.id) ?? 0,
              ),
            ),
          );
          if (!actual.gt(0) || !actual.lt(frozenTotal))
            throw new BadRequestException(
              'قيمة الكمية المصروفة يجب أن تكون موجبة وأقل من أصل الفاتورة',
            );
        }
      }

      const existingDispense = await tx.dispenseRecord.findFirst({
        where: { prescriptionId: prescription.id },
      });
      if (existingDispense) {
        throw new BadRequestException('تم صرف هذه الوصفة مسبقاً.');
      }

      const overrides = new Map<
        number,
        { quantity?: number; dispensedProductId?: number }
      >();
      if (items) {
        for (const it of items) {
          overrides.set(it.prescriptionItemId, {
            quantity: Number(it.quantity),
            dispensedProductId: it.dispensedDrugItemId,
          });
        }
      }

      const dispense = await tx.dispenseRecord.create({
        data: {
          hospitalId,
          prescriptionId: prescription.id,
          dispensedById: pharmacistId,
          notes: notes ?? null,
          partialClosureReason: partialClosureReason?.trim(),
        },
      });

      let totalSalesAmount = new Prisma.Decimal(0);

      for (const item of prescription.items) {
        if (!item.product) continue;
        const ov = overrides.get(item.id);
        const qtyToDispense =
          ov?.quantity !== undefined ? ov.quantity : Number(item.quantity);
        if (qtyToDispense <= 0) continue;

        let productToDispense = item.product;
        if (
          ov?.dispensedProductId &&
          ov.dispensedProductId !== item.product.id
        ) {
          const alt = await tx.product.findUnique({
            where: { id: ov.dispensedProductId },
          });
          if (alt) productToDispense = alt;
        }

        // 1. تحديد الكميات والتشغيلات المطلوبة
        const allocations = await this.allocateStockFEFO(
          tx,
          hospitalId,
          warehouseId,
          productToDispense.id,
          qtyToDispense,
          productToDispense.name,
        );

        const unitPrice = prepaidInvoice
          ? item.prepaidUnitPrice!
          : productToDispense.sellPrice;
        const costPrice = productToDispense.costPrice;

        if (
          new Prisma.Decimal(unitPrice).lt(0) ||
          new Prisma.Decimal(costPrice).lt(0)
        )
          throw new BadRequestException('سعر أو تكلفة غير صالحة');
        const salesParts = Money.allocate(
          Money.multiply(unitPrice, qtyToDispense),
          allocations.map((a) => a.quantity),
        );
        const costParts = Money.allocate(
          Money.multiply(costPrice, qtyToDispense),
          allocations.map((a) => a.quantity),
        );
        for (const [allocationIndex, alloc] of allocations.entries()) {
          const lineTotal = salesParts[allocationIndex];
          const lineCost = costParts[allocationIndex];
          totalSalesAmount = new Prisma.Decimal(
            Money.sumPosted(totalSalesAmount, lineTotal).toString(),
          );
          calculatedTotalCost = new Prisma.Decimal(
            Money.sumPosted(calculatedTotalCost, lineCost).toString(),
          );

          await tx.dispenseItem.create({
            data: {
              dispenseRecordId: dispense.id,
              prescriptionItemId: item.id,
              productId: productToDispense.id,
              quantity: alloc.quantity,
              unitPrice,
              totalAmount: lineTotal,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
            },
          });

          // 2. 🛡️ تحديث المخزون مع Optimistic Lock
          const updateResult = await tx.productStock.updateMany({
            where: {
              id: alloc.stockId,
              quantity: { gte: alloc.quantity },
              version: alloc.currentVersion, // يجب أن تطابق النسخة التي قرأناها
            },
            data: {
              quantity: { decrement: alloc.quantity },
              version: { increment: 1 }, // زيادة النسخة
            },
          });

          if (updateResult.count === 0) {
            // إذا كان العدد 0، فهذا يعني أن السجل تغير بواسطة شخص آخر في هذه اللحظة
            throw new ConflictException(
              `حدث تغيير في مخزون الصنف "${productToDispense.name}" (تشغيلة ${alloc.batchNumber}) أثناء العملية. يرجى إعادة المحاولة.`,
            );
          }

          await tx.stockTransaction.create({
            data: {
              hospitalId,
              warehouseId,
              productId: productToDispense.id,
              type: StockTransactionType.OUT,
              quantity: alloc.quantity,
              baseQuantity: alloc.quantity,
              unitCost: costPrice,
              totalCost: lineCost,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
              referenceType: 'DISPENSE',
              referenceId: dispense.id,
              dispenseRecordId: dispense.id,
              createdById: pharmacistId,
            },
          });
        }

        // تحديث المنتج الرئيسي (يمكن إضافة version هنا أيضاً إذا كان التزامن حرجاً جداً في السعر)
        const updatedProduct = await tx.product.updateMany({
          where: {
            id: productToDispense.id,
            hospitalId,
            stockOnHand: { gte: qtyToDispense },
          },
          data: {
            stockOnHand: { decrement: qtyToDispense },
            version: { increment: 1 },
          },
        });
        if (updatedProduct.count !== 1)
          throw new ConflictException('الرصيد الإجمالي غير كافٍ للصرف');
      }

      if (!prepaidInvoice) {
        const pharmacyServiceItem = await tx.serviceItem.findFirst({
          where: { hospitalId, code: 'PHARMACY-DRUGS' },
        });

        if (!pharmacyServiceItem)
          throw new BadRequestException(
            'يلزم تعريف خدمة PHARMACY-DRUGS للفوترة',
          );
        if (totalSalesAmount.gt(0)) {
          await tx.encounterCharge.create({
            data: {
              hospitalId,
              encounterId: prescription.encounterId,
              serviceItemId: pharmacyServiceItem.id,
              sourceType: ChargeSource.PHARMACY,
              sourceId: dispense.id,
              quantity: 1,
              unitPrice: totalSalesAmount,
              totalAmount: totalSalesAmount,
            },
          });
        }
      }

      await tx.prescription.update({
        where: { id: prescription.id },
        data: {
          status: finalPartial
            ? PrescriptionStatus.PARTIALLY_COMPLETED
            : PrescriptionStatus.COMPLETED,
        },
      });
      if (
        prepaidInvoice &&
        !finalPartial &&
        Money.isPositive(prepaidInvoice.insuranceShare)
      ) {
        await tx.invoice.update({
          where: { id: prepaidInvoice.id },
          data: { claimStatus: 'PENDING' },
        });
      }

      if (calculatedTotalCost.gt(0))
        await this.accounting.recordCogsEntry({
          sourceId: dispense.id,
          hospitalId,
          userId: pharmacistId,
          totalCost: calculatedTotalCost,
          module: 'PHARMACY',
          tx,
        });
      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: pharmacistId,
        action: 'PHARMACY_DISPENSE',
        entity: 'DispenseRecord',
        entityId: dispense.id,
        details: {
          prescriptionId,
          warehouseId,
          totalAmount: Money.toDbString(totalSalesAmount),
          totalCost: Money.toDbString(calculatedTotalCost),
          partialClosureReason: partialClosureReason?.trim(),
        },
      });
      return {
        dispense,
        totalAmount: Money.toWire(totalSalesAmount),
        partialClosureInvoiceId: finalPartial ? prepaidInvoice?.id : undefined,
      };
    });

    const { partialClosureInvoiceId, ...outcome } = result;
    // A UI notification is best effort; all financial writes already committed.
    try {
      this.eventEmitter.emit(
        'pharmacy.dispense_completed',
        new DispenseCompletedEvent(
          result.dispense.id,
          hospitalId,
          pharmacistId,
          partialClosureInvoiceId,
        ),
      );
    } catch {
      this.logger.warn('Pharmacy refresh notification failed after commit');
    }
    return outcome;
  }

  // -----------------------------------------------------------------------
  // 🟢 عمليات الصرف المباشر (POS) - ✅ تحديث القفل التفاؤلي
  // -----------------------------------------------------------------------

  async dispenseAndPay(params: {
    hospitalId: number;
    prescriptionId: number;
    pharmacistId: number;
    paymentMethod: PaymentMethod;
    amountPaid: number;
    notes?: string;
    items?: {
      prescriptionItemId: number;
      quantity: number;
      dispensedDrugItemId?: number;
    }[];
  }) {
    const {
      hospitalId,
      prescriptionId,
      pharmacistId,
      paymentMethod,
      amountPaid,
      notes,
      items,
    } = params;

    if (!['CASH', 'CARD', 'TRANSFER'].includes(paymentMethod))
      throw new BadRequestException('طريقة التحصيل غير مدعومة');
    let calculatedTotalCost = new Prisma.Decimal(0);

    const result = await this.prisma.$transaction(async (tx) => {
      const { session } = await guardCashierMovement(
        tx,
        hospitalId,
        pharmacistId,
        true,
      );
      await this.lockDispense(tx, hospitalId, prescriptionId, items);
      const warehouseId = await this.getPharmacyWarehouseId(tx, hospitalId);
      const prescription = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: {
          items: { include: { product: true } },
          encounter: true,
          patient: true,
        },
      });

      if (!prescription) throw new NotFoundException('الوصفة غير موجودة.');
      if (
        prescription.hospitalId !== hospitalId ||
        prescription.encounter.status !== 'OPEN'
      )
        throw new BadRequestException('الوصفة خارج المنشأة أو الحالة مغلقة');
      if (prescription.prepaidInvoiceId != null)
        throw new BadRequestException(
          'هذه الوصفة مرتبطة بفاتورة خزينة؛ استخدم الصرف دون تحصيل جديد',
        );
      this.validateDispenseItems(prescription.items, items);
      if (prescription.status !== PrescriptionStatus.ACTIVE) {
        throw new BadRequestException('تم صرف هذه الوصفة مسبقاً.');
      }

      // 🛡️ CPOE Check
      if (
        prescription.pharmacistVerificationStatus !==
        PharmacistVerificationStatus.VERIFIED
      ) {
        throw new BadRequestException(
          'لا يمكن الصرف: الوصفة لم تخضع للتدقيق والاعتماد الصيدلاني (CPOE).',
        );
      }

      const overrides = new Map<
        number,
        { quantity?: number; dispensedProductId?: number }
      >();
      if (items) {
        for (const it of items) {
          overrides.set(it.prescriptionItemId, {
            quantity: Number(it.quantity),
            dispensedProductId: it.dispensedDrugItemId
              ? Number(it.dispensedDrugItemId)
              : undefined,
          });
        }
      }

      const dispense = await tx.dispenseRecord.create({
        data: {
          hospitalId,
          prescriptionId,
          dispensedById: pharmacistId,
          notes: notes ?? 'صرف مباشر (POS)',
        },
      });

      let invoiceTotal = new Prisma.Decimal(0);

      for (const item of prescription.items) {
        if (!item.product) continue;

        const ov = overrides.get(item.id);
        const qtyToDispense =
          ov?.quantity !== undefined ? ov.quantity : Number(item.quantity);

        if (qtyToDispense <= 0) continue;

        let productToDispense = item.product;
        if (
          ov?.dispensedProductId &&
          ov.dispensedProductId !== item.product.id
        ) {
          const alt = await tx.product.findUnique({
            where: { id: ov.dispensedProductId },
          });
          if (alt) productToDispense = alt;
        }

        const allocations = await this.allocateStockFEFO(
          tx,
          hospitalId,
          warehouseId,
          productToDispense.id,
          qtyToDispense,
          productToDispense.name,
        );

        const unitPrice = productToDispense.sellPrice;
        const costPrice = productToDispense.costPrice;

        if (
          new Prisma.Decimal(unitPrice).lt(0) ||
          new Prisma.Decimal(costPrice).lt(0)
        )
          throw new BadRequestException('سعر أو تكلفة غير صالحة');
        const salesParts = Money.allocate(
          Money.multiply(unitPrice, qtyToDispense),
          allocations.map((a) => a.quantity),
        );
        const costParts = Money.allocate(
          Money.multiply(costPrice, qtyToDispense),
          allocations.map((a) => a.quantity),
        );
        for (const [allocationIndex, alloc] of allocations.entries()) {
          const lineTotal = salesParts[allocationIndex];
          const lineCost = costParts[allocationIndex];
          invoiceTotal = new Prisma.Decimal(
            Money.sumPosted(invoiceTotal, lineTotal).toString(),
          );
          calculatedTotalCost = new Prisma.Decimal(
            Money.sumPosted(calculatedTotalCost, lineCost).toString(),
          );

          await tx.dispenseItem.create({
            data: {
              dispenseRecordId: dispense.id,
              prescriptionItemId: item.id,
              productId: productToDispense.id,
              quantity: alloc.quantity,
              unitPrice: unitPrice,
              totalAmount: lineTotal,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
            },
          });

          await tx.stockTransaction.create({
            data: {
              hospitalId,
              warehouseId,
              productId: productToDispense.id,
              type: StockTransactionType.OUT,
              quantity: alloc.quantity,
              baseQuantity: alloc.quantity,
              unitCost: costPrice,
              totalCost: lineCost,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
              referenceType: 'DISPENSE_POS',
              referenceId: dispense.id,
              dispenseRecordId: dispense.id,
              createdById: pharmacistId,
            },
          });

          // 🛡️ تحديث المخزون مع Optimistic Lock
          const updateResult = await tx.productStock.updateMany({
            where: {
              id: alloc.stockId,
              quantity: { gte: alloc.quantity },
              version: alloc.currentVersion, // الشرط الحاسم
            },
            data: {
              quantity: { decrement: alloc.quantity },
              version: { increment: 1 },
            },
          });

          if (updateResult.count === 0) {
            throw new ConflictException(
              `حدث تغيير في مخزون الصنف "${productToDispense.name}" أثناء العملية. يرجى إعادة المحاولة.`,
            );
          }
        }

        const updatedProduct = await tx.product.updateMany({
          where: {
            id: productToDispense.id,
            hospitalId,
            stockOnHand: { gte: qtyToDispense },
          },
          data: {
            stockOnHand: { decrement: qtyToDispense },
            version: { increment: 1 },
          },
        });
        if (updatedProduct.count !== 1)
          throw new ConflictException('الرصيد الإجمالي غير كافٍ للصرف');
      }

      if (invoiceTotal.lte(0))
        throw new BadRequestException('لا توجد أصناف للصرف.');

      if (
        prescription.patient.insurancePolicyId ||
        !Money.eq(amountPaid, invoiceTotal)
      )
        throw new BadRequestException(
          'الدفع الفوري يتطلب سداد المبلغ كاملًا دون تأمين',
        );
      const invoice = await tx.invoice.create({
        data: {
          hospitalId,
          patientId: prescription.patientId,
          encounterId: prescription.encounterId,
          status: InvoiceStatus.PAID,
          totalAmount: Money.toDbString(invoiceTotal),
          patientShare: Money.toDbString(invoiceTotal),
          paidAmount: Money.toDbString(amountPaid),
          currency: 'LYD',
        },
      });

      const payment = await tx.payment.create({
        data: {
          hospitalId,
          invoiceId: invoice.id,
          amount: Money.toDbString(amountPaid),
          sessionId: paymentMethod === 'CASH' ? session?.id : null,
          method: paymentMethod,
          paidAt: new Date(),
          cashierId: pharmacistId,
        },
      });

      const pharmacyServiceItem = await tx.serviceItem.findFirst({
        where: { hospitalId, code: 'PHARMACY-DRUGS' },
      });

      if (!pharmacyServiceItem)
        throw new BadRequestException('يلزم تعريف خدمة PHARMACY-DRUGS للفوترة');
      {
        await tx.encounterCharge.create({
          data: {
            hospitalId,
            encounterId: prescription.encounterId,
            serviceItemId: pharmacyServiceItem.id,
            sourceType: ChargeSource.PHARMACY,
            sourceId: dispense.id,
            quantity: 1,
            unitPrice: invoiceTotal,
            totalAmount: Money.toDbString(invoiceTotal),
            invoiceId: invoice.id,
          },
        });
      }

      await tx.prescription.update({
        where: { id: prescriptionId },
        data: { status: PrescriptionStatus.COMPLETED },
      });

      await this.accounting.recordInvoiceEntry({
        invoiceId: invoice.id,
        hospitalId,
        userId: pharmacistId,
        prisma: tx,
      });
      await this.accounting.recordPaymentEntry({
        paymentId: payment.id,
        hospitalId,
        userId: pharmacistId,
        prisma: tx,
      });
      if (calculatedTotalCost.gt(0))
        await this.accounting.recordCogsEntry({
          sourceId: dispense.id,
          hospitalId,
          userId: pharmacistId,
          totalCost: calculatedTotalCost,
          module: 'PHARMACY',
          tx,
        });
      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: pharmacistId,
        action: 'PHARMACY_DISPENSE_POS',
        entity: 'DispenseRecord',
        entityId: dispense.id,
        details: {
          prescriptionId,
          warehouseId,
          invoiceId: invoice.id,
          paymentId: payment.id,
          totalAmount: Money.toDbString(invoiceTotal),
          totalCost: Money.toDbString(calculatedTotalCost),
        },
      });
      return { invoice, payment, dispense };
    });

    // A UI notification is best effort; all financial writes already committed.
    try {
      this.eventEmitter.emit(
        'pharmacy.dispense_completed',
        new DispenseCompletedEvent(
          result.dispense.id,
          hospitalId,
          pharmacistId,
        ),
      );
    } catch {
      this.logger.warn('Pharmacy refresh notification failed after commit');
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // 🟢 إدارة المخزون اليدوية (Manual Stock & Reporting)
  // -----------------------------------------------------------------------

  async getDrugStockList(hospitalId: number, q?: string) {
    return this.prisma.product
      .findMany({
        where: {
          hospitalId,
          type: ProductType.DRUG,
          isActive: true,
          isDeleted: false,
          ...(q && q.trim().length > 0
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { genericName: { contains: q, mode: 'insensitive' } },
                  { code: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          genericName: true,
          strength: true,
          form: true,
          sellPrice: true,
          stockOnHand: true,
        },
      })
      .then((list) =>
        list.map((d) => ({
          ...d,
          unitPrice: Number(d.sellPrice ?? 0),
          stockOnHand: Number(d.stockOnHand ?? 0),
        })),
      );
  }

  async createManualStockTransaction(params: ManualAdjustment) {
    return this.prisma.$transaction(
      (tx) =>
        adjustPharmacyStock(
          tx,
          params,
          () => this.getPharmacyWarehouseId(tx, params.hospitalId),
          this.accounting,
        ),
      { maxWait: 10000, timeout: 20000 },
    );
  }

  async getStockTransactionsReport(params: {
    hospitalId: number;
    from?: Date;
    to?: Date;
    drugItemId?: number;
    type?: StockTransactionType;
  }) {
    const { hospitalId, from, to, drugItemId, type } = params;
    const where: any = { hospitalId };
    if (drugItemId) where.productId = drugItemId;
    if (type) where.type = type;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    const txns = await this.prisma.stockTransaction.findMany({
      where,
      include: {
        product: true,
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return txns.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      type: t.type,
      quantity: Number(t.quantity),
      unitCost: Number(t.unitCost),
      totalCost: Number(t.totalCost),
      batchNumber: t.batchNumber,
      expiryDate: t.expiryDate,
      drug: {
        id: t.product.id,
        code: t.product.code,
        name: t.product.name,
        strength: t.product.strength,
        form: t.product.form,
      },
      createdBy: t.createdBy,
      dispenseRecordId: t.dispenseRecordId,
    }));
  }

  async getEncounterDispensesSummary(hospitalId: number, encounterId: number) {
    const records = await this.prisma.dispenseRecord.findMany({
      where: { hospitalId, prescription: { encounterId } },
      include: {
        items: {
          include: {
            product: true,
            prescriptionItem: { include: { product: true } },
          },
        },
        prescription: { include: { doctor: true } },
      },
      orderBy: { dispensedAt: 'asc' },
    });
    return records.map((r) => ({
      id: r.id,
      createdAt: r.dispensedAt,
      notes: r.notes,
      doctor: r.prescription?.doctor,
      totalAmount: r.items.reduce((sum, it) => sum + Number(it.totalAmount), 0),
      items: r.items.map((it) => ({
        id: it.id,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        totalAmount: Number(it.totalAmount),
        batchNumber: it.batchNumber,
        expiryDate: it.expiryDate,
        dispensedDrug: it.product,
        originalDrug: it.prescriptionItem?.product,
        isSubstitute:
          it.productId !== (it.prescriptionItem?.productId ?? it.productId),
      })),
    }));
  }
}
