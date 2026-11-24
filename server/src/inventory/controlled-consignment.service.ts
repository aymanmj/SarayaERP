import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  computeConsignmentLineTotal,
  computeControlledLogHash,
  evaluateWardReturnEligibility,
  type ControlledTxType,
} from './controlled-consignment.util';
import type {
  ConsumeConsignmentDto,
  ReceiveConsignmentDto,
  RecordControlledTransactionDto,
  RequestWardReturnDto,
  ReturnConsignmentToSupplierDto,
  ReviewWardReturnDto,
} from './dto/controlled-consignment.dto';

@Injectable()
export class ControlledConsignmentService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureActiveUserInHospital(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    userId: number,
    label: string,
  ) {
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        isDeleted: false,
        OR: [{ hospitalId }, { accessibleHospitals: { some: { hospitalId } } }],
      },
      select: { id: true, fullName: true },
    });
    if (!user) {
      throw new NotFoundException(`${label} غير متاح أو غير نشط ضمن المنشأة.`);
    }
    return user;
  }

  // =========================================================================
  // 1. Controlled Substances / Narcotics Double-Sign Register (JCI MMU.3.1)
  // =========================================================================

  async listControlledLogs(
    hospitalId: number,
    filters?: {
      warehouseId?: number;
      productId?: number;
      batchNumber?: string;
    },
  ) {
    return this.prisma.controlledSubstanceLog.findMany({
      where: {
        hospitalId,
        ...(filters?.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters?.productId ? { productId: filters.productId } : {}),
        ...(filters?.batchNumber
          ? { batchNumber: filters.batchNumber.trim() }
          : {}),
      },
      include: {
        warehouse: { select: { id: true, name: true } },
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            controlledSchedule: true,
          },
        },
        patient: { select: { id: true, fullName: true, mrn: true } },
        performedBy: { select: { id: true, fullName: true } },
        witnessedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { id: 'desc' },
      take: 100,
    });
  }

  async recordControlledTransaction(
    hospitalId: number,
    performedById: number,
    dto: RecordControlledTransactionDto,
  ) {
    if (dto.witnessedById === performedById) {
      throw new ConflictException(
        'الرقابة الثنائية للأدوية المخدّرة والمقيّدة (4 عيون) تتطلب شاهدًا مستقلاً مختلفًا عن المُنفِّذ.',
      );
    }

    const batchNumber = dto.batchNumber.trim();
    const qtyDec = Money.roundDecimal(dto.quantity, 3);
    const wastedDec = Money.roundDecimal(dto.wastedQuantity ?? 0, 3);

    if (
      dto.transactionType !== 'SHIFT_COUNT' &&
      !Money.isPositive(qtyDec) &&
      !Money.isPositive(wastedDec)
    ) {
      throw new BadRequestException(
        'يجب أن تكون الكمية أكبر من صفر لحركات الأدوية المقيّدة.',
      );
    }
    if (dto.transactionType === 'DISPENSE' && !dto.patientId) {
      throw new BadRequestException(
        'صرف دواء مخدّر/مقيّد يتطلب ربطه بملف مريض محدد (patientId).',
      );
    }

    const { entry, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27020, ${hospitalId}::integer)`;

      await this.ensureActiveUserInHospital(
        tx,
        hospitalId,
        dto.witnessedById,
        'الشاهد المستقل',
      );

      const [warehouse, product] = await Promise.all([
        tx.warehouse.findFirst({
          where: { id: dto.warehouseId, hospitalId, isActive: true },
          select: { id: true, name: true },
        }),
        tx.product.findFirst({
          where: {
            id: dto.productId,
            hospitalId,
            isActive: true,
            isDeleted: false,
          },
          select: { id: true, name: true, isControlled: true },
        }),
      ]);
      if (!warehouse) {
        throw new NotFoundException('المخزن غير متاح ضمن المنشأة.');
      }
      if (!product) {
        throw new NotFoundException('الصنف الدوائي غير موجود ضمن المنشأة.');
      }
      if (!product.isControlled) {
        throw new BadRequestException(
          'هذا الصنف غير مصنّف كدواء مخدّر أو مقيّد (isControlled=false).',
        );
      }

      if (dto.patientId) {
        const patient = await tx.patient.findFirst({
          where: { id: dto.patientId, hospitalId, isDeleted: false },
          select: { id: true },
        });
        if (!patient) {
          throw new NotFoundException('ملف المريض غير موجود ضمن المنشأة.');
        }
      }
      if (dto.encounterId) {
        const enc = await tx.encounter.findFirst({
          where: { id: dto.encounterId, hospitalId, isDeleted: false },
          select: { id: true },
        });
        if (!enc) {
          throw new NotFoundException('الزيارة غير موجودة ضمن المنشأة.');
        }
      }

      const lastEntry = await tx.controlledSubstanceLog.findFirst({
        where: {
          hospitalId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          batchNumber,
        },
        orderBy: { id: 'desc' },
      });

      const quantityBeforeDec = lastEntry
        ? Money.roundDecimal(lastEntry.quantityAfter, 3)
        : Money.roundDecimal(0, 3);
      const previousHash = lastEntry?.entryHash ?? 'GENESIS';

      let quantityChangeDec = Money.roundDecimal(0, 3);
      switch (dto.transactionType) {
        case 'RECEIPT':
        case 'RETURN':
          quantityChangeDec = qtyDec;
          break;
        case 'DISPENSE':
          quantityChangeDec = Money.multiply(
            Money.addDecimal(qtyDec, wastedDec),
            -1,
          );
          break;
        case 'WASTE':
          quantityChangeDec = Money.multiply(
            Money.isPositive(wastedDec) ? wastedDec : qtyDec,
            -1,
          );
          break;
        case 'ADJUSTMENT':
          quantityChangeDec = qtyDec;
          break;
        case 'SHIFT_COUNT':
          quantityChangeDec = Money.roundDecimal(0, 3);
          break;
      }

      const quantityAfterDec = Money.addDecimal(
        quantityBeforeDec,
        quantityChangeDec,
      );
      if (quantityAfterDec.lt(0)) {
        throw new ConflictException(
          `رصيد الدواء المقيّد غير كافٍ: الرصيد الحالي ${Money.toDbString(quantityBeforeDec)} والخصم المطلوب يتجاوزه.`,
        );
      }

      const createdAt = new Date();
      const quantityBeforeStr = Money.toDbString(quantityBeforeDec);
      const quantityChangeStr = Money.toDbString(quantityChangeDec);
      const quantityAfterStr = Money.toDbString(quantityAfterDec);
      const wastedStr = Money.toDbString(
        dto.transactionType === 'WASTE' && !Money.isPositive(wastedDec)
          ? qtyDec
          : wastedDec,
      );

      const entryHash = computeControlledLogHash({
        previousHash,
        hospitalId,
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        batchNumber,
        patientId: dto.patientId ?? null,
        encounterId: dto.encounterId ?? null,
        transactionType: dto.transactionType,
        quantityBefore: quantityBeforeStr,
        quantityChange: quantityChangeStr,
        quantityAfter: quantityAfterStr,
        wastedQuantity: wastedStr,
        performedById,
        witnessedById: dto.witnessedById,
        reason: dto.reason,
        createdAt,
      });

      const created = await tx.controlledSubstanceLog.create({
        data: {
          hospitalId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          batchNumber,
          patientId: dto.patientId ?? null,
          encounterId: dto.encounterId ?? null,
          transactionType: dto.transactionType,
          quantityBefore: quantityBeforeStr,
          quantityChange: quantityChangeStr,
          quantityAfter: quantityAfterStr,
          wastedQuantity: wastedStr,
          performedById,
          witnessedById: dto.witnessedById,
          reason: dto.reason.trim(),
          previousHash,
          entryHash,
          createdAt,
        },
        include: {
          performedBy: { select: { id: true, fullName: true } },
          witnessedBy: { select: { id: true, fullName: true } },
          product: { select: { id: true, code: true, name: true } },
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: performedById,
        action: `CONTROLLED_SUBSTANCE_${dto.transactionType}`,
        entity: 'ControlledSubstanceLog',
        entityId: created.id,
        details: {
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          batchNumber,
          witnessedById: dto.witnessedById,
          quantityBefore: quantityBeforeStr,
          quantityChange: quantityChangeStr,
          quantityAfter: quantityAfterStr,
          wastedQuantity: wastedStr,
          entryHash,
        },
      });

      return { entry: created, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return entry;
  }

  async verifyControlledChain(
    hospitalId: number,
    warehouseId: number,
    productId: number,
    batchNumber: string,
  ) {
    const entries = await this.prisma.controlledSubstanceLog.findMany({
      where: {
        hospitalId,
        warehouseId,
        productId,
        batchNumber: batchNumber.trim(),
      },
      orderBy: { id: 'asc' },
    });

    let expectedPrev = 'GENESIS';
    for (const row of entries) {
      if (row.previousHash !== expectedPrev) {
        return {
          valid: false,
          count: entries.length,
          brokenAtId: row.id,
          reason: 'PREVIOUS_HASH_MISMATCH',
        };
      }
      const recomputed = computeControlledLogHash({
        previousHash: row.previousHash,
        hospitalId: row.hospitalId,
        warehouseId: row.warehouseId,
        productId: row.productId,
        batchNumber: row.batchNumber,
        patientId: row.patientId,
        encounterId: row.encounterId,
        transactionType: row.transactionType as ControlledTxType,
        quantityBefore: Money.toDbString(row.quantityBefore),
        quantityChange: Money.toDbString(row.quantityChange),
        quantityAfter: Money.toDbString(row.quantityAfter),
        wastedQuantity: Money.toDbString(row.wastedQuantity),
        performedById: row.performedById,
        witnessedById: row.witnessedById,
        reason: row.reason,
        createdAt: row.createdAt,
      });
      if (recomputed !== row.entryHash) {
        return {
          valid: false,
          count: entries.length,
          brokenAtId: row.id,
          reason: 'ENTRY_HASH_MISMATCH',
        };
      }
      expectedPrev = row.entryHash;
    }

    const latest = entries[entries.length - 1];
    return {
      valid: true,
      count: entries.length,
      currentBalance: latest ? Money.toDbString(latest.quantityAfter) : '0.000',
      latestHash: latest?.entryHash ?? null,
    };
  }

  // =========================================================================
  // 2. Consignment Stock Lifecycle (Supplier-Owned Until Patient Consumption)
  // =========================================================================

  async listConsignments(hospitalId: number) {
    const rows = await this.prisma.consignmentReceipt.findMany({
      where: { hospitalId },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        warehouse: { select: { id: true, name: true } },
        product: { select: { id: true, code: true, name: true } },
        receivedBy: { select: { id: true, fullName: true } },
        consumptions: {
          orderBy: { createdAt: 'desc' },
          include: {
            patient: { select: { id: true, fullName: true, mrn: true } },
            consumedBy: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
      take: 100,
    });

    return rows.map((r) => {
      const remaining = Money.subtractDecimal(
        Money.subtractDecimal(r.quantityReceived, r.quantityConsumed),
        r.quantityReturned,
      );
      return {
        ...r,
        quantityRemaining: Money.toDbString(remaining),
      };
    });
  }

  async receiveConsignment(
    hospitalId: number,
    receivedById: number,
    dto: ReceiveConsignmentDto,
  ) {
    const { receipt, audit } = await this.prisma.$transaction(async (tx) => {
      const [supplier, warehouse, product] = await Promise.all([
        tx.supplier.findFirst({
          where: { id: dto.supplierId, hospitalId, isActive: true },
          select: { id: true, name: true },
        }),
        tx.warehouse.findFirst({
          where: { id: dto.warehouseId, hospitalId, isActive: true },
          select: { id: true, name: true },
        }),
        tx.product.findFirst({
          where: {
            id: dto.productId,
            hospitalId,
            isActive: true,
            isDeleted: false,
          },
          select: { id: true, name: true },
        }),
      ]);
      if (!supplier) {
        throw new NotFoundException('المورد غير موجود أو غير نشط ضمن المنشأة.');
      }
      if (!warehouse) {
        throw new NotFoundException('المخزن غير موجود ضمن المنشأة.');
      }
      if (!product) {
        throw new NotFoundException('الصنف غير موجود ضمن المنشأة.');
      }

      const qtyStr = Money.toDbString(
        Money.roundDecimal(dto.quantityReceived, 3),
      );
      const priceStr = Money.toUnitDbString(
        Money.roundDecimal(dto.agreedUnitPrice, 4),
      );

      const created = await tx.consignmentReceipt.create({
        data: {
          hospitalId,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          batchNumber: dto.batchNumber.trim(),
          serialNumber: dto.serialNumber?.trim() || null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          quantityReceived: qtyStr,
          agreedUnitPrice: priceStr,
          status: 'ACTIVE',
          receivedById,
          notes: dto.notes?.trim() || null,
        },
        include: {
          supplier: { select: { id: true, name: true } },
          product: { select: { id: true, code: true, name: true } },
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: receivedById,
        action: 'CONSIGNMENT_STOCK_RECEIVED',
        entity: 'ConsignmentReceipt',
        entityId: created.id,
        details: {
          supplierId: dto.supplierId,
          productId: dto.productId,
          batchNumber: created.batchNumber,
          quantityReceived: qtyStr,
          agreedUnitPrice: priceStr,
        },
      });

      return { receipt: created, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return receipt;
  }

  async consumeConsignment(
    hospitalId: number,
    consignmentReceiptId: number,
    consumedById: number,
    dto: ConsumeConsignmentDto,
  ) {
    const { consumption, receipt, audit } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ConsignmentReceipt" WHERE id = ${consignmentReceiptId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        const existing = await tx.consignmentReceipt.findFirst({
          where: { id: consignmentReceiptId, hospitalId },
        });
        if (!existing) {
          throw new NotFoundException('إيصال الأمانة غير موجود ضمن المنشأة.');
        }
        if (
          existing.expiryDate &&
          existing.expiryDate.getTime() <= Date.now()
        ) {
          throw new ConflictException(
            'تاريخ صلاحية مستلزم الأمانة منتهٍ ولا يجوز استهلاكه سريريًا.',
          );
        }

        const encounter = await tx.encounter.findFirst({
          where: { id: dto.encounterId, hospitalId, isDeleted: false },
          select: { id: true, patientId: true, status: true },
        });
        if (!encounter) {
          throw new NotFoundException('الزيارة غير موجودة ضمن المنشأة.');
        }

        if (dto.witnessedById) {
          if (dto.witnessedById === consumedById) {
            throw new ConflictException('الشاهد يجب أن يختلف عن المستهلك.');
          }
          await this.ensureActiveUserInHospital(
            tx,
            hospitalId,
            dto.witnessedById,
            'الشاهد المستقل',
          );
        }

        const consumeQtyDec = Money.roundDecimal(dto.quantity, 3);
        const remainingDec = Money.subtractDecimal(
          Money.subtractDecimal(
            existing.quantityReceived,
            existing.quantityConsumed,
          ),
          existing.quantityReturned,
        );
        if (consumeQtyDec.gt(remainingDec)) {
          throw new ConflictException(
            `الكمية المتاحة في الأمانة (${Money.toDbString(remainingDec)}) أقل من المطلوب استهلاكه (${Money.toDbString(consumeQtyDec)}).`,
          );
        }

        const { unitPriceStr, totalAmountStr } = computeConsignmentLineTotal(
          Money.toDbString(consumeQtyDec),
          existing.agreedUnitPrice.toString(),
        );

        const createdConsumption = await tx.consignmentConsumption.create({
          data: {
            hospitalId,
            consignmentReceiptId,
            encounterId: encounter.id,
            patientId: encounter.patientId,
            quantity: Money.toDbString(consumeQtyDec),
            unitPrice: unitPriceStr,
            totalAmount: totalAmountStr,
            consumedById,
            witnessedById: dto.witnessedById ?? null,
            supplierBillStatus: 'PENDING_BILLING',
            notes: dto.notes?.trim() || null,
          },
        });

        const nextConsumed = Money.addDecimal(
          existing.quantityConsumed,
          consumeQtyDec,
        );
        const nextTotalUsed = Money.addDecimal(
          nextConsumed,
          existing.quantityReturned,
        );
        const nextStatus = nextTotalUsed.eq(existing.quantityReceived)
          ? 'FULLY_CONSUMED'
          : 'PARTIALLY_CONSUMED';

        const updatedReceipt = await tx.consignmentReceipt.update({
          where: { id: consignmentReceiptId },
          data: {
            quantityConsumed: Money.toDbString(nextConsumed),
            status: nextStatus,
          },
        });

        const auditEntry = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId: consumedById,
          action: 'CONSIGNMENT_STOCK_CONSUMED',
          entity: 'ConsignmentConsumption',
          entityId: createdConsumption.id,
          details: {
            consignmentReceiptId,
            encounterId: encounter.id,
            patientId: encounter.patientId,
            quantity: Money.toDbString(consumeQtyDec),
            unitPrice: unitPriceStr,
            totalAmount: totalAmountStr,
            nextStatus,
          },
        });

        return {
          consumption: createdConsumption,
          receipt: updatedReceipt,
          audit: auditEntry,
        };
      },
    );

    publishCommittedCriticalAudit(audit);
    return { consumption, receipt };
  }

  async returnConsignmentToSupplier(
    hospitalId: number,
    consignmentReceiptId: number,
    userId: number,
    dto: ReturnConsignmentToSupplierDto,
  ) {
    const { receipt, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ConsignmentReceipt" WHERE id = ${consignmentReceiptId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.consignmentReceipt.findFirst({
        where: { id: consignmentReceiptId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('إيصال الأمانة غير موجود ضمن المنشأة.');
      }

      const returnQtyDec = Money.roundDecimal(dto.quantity, 3);
      const remainingDec = Money.subtractDecimal(
        Money.subtractDecimal(
          existing.quantityReceived,
          existing.quantityConsumed,
        ),
        existing.quantityReturned,
      );
      if (returnQtyDec.gt(remainingDec)) {
        throw new ConflictException(
          `الكمية المتاحة للإرجاع للمورد (${Money.toDbString(remainingDec)}) أقل من المطلوب (${Money.toDbString(returnQtyDec)}).`,
        );
      }

      const nextReturned = Money.addDecimal(
        existing.quantityReturned,
        returnQtyDec,
      );
      const nextTotalUsed = Money.addDecimal(
        existing.quantityConsumed,
        nextReturned,
      );
      const nextStatus = nextTotalUsed.eq(existing.quantityReceived)
        ? Money.isPositive(existing.quantityConsumed)
          ? 'FULLY_CONSUMED'
          : 'RETURNED_TO_SUPPLIER'
        : existing.status;

      const updated = await tx.consignmentReceipt.update({
        where: { id: consignmentReceiptId },
        data: {
          quantityReturned: Money.toDbString(nextReturned),
          status: nextStatus,
          notes: existing.notes
            ? `${existing.notes} | إرجاع للمورد: ${dto.reason.trim()}`
            : `إرجاع للمورد: ${dto.reason.trim()}`,
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'CONSIGNMENT_RETURNED_TO_SUPPLIER',
        entity: 'ConsignmentReceipt',
        entityId: consignmentReceiptId,
        details: {
          quantityReturned: Money.toDbString(returnQtyDec),
          reason: dto.reason.trim(),
          nextStatus,
        },
      });

      return { receipt: updated, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return receipt;
  }

  // =========================================================================
  // 3. Ward Stock Returns (Nurse Request -> Independent Pharmacist Approval)
  // =========================================================================

  async listWardReturns(hospitalId: number) {
    return this.prisma.wardStockReturn.findMany({
      where: { hospitalId },
      include: {
        ward: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        product: { select: { id: true, code: true, name: true } },
        requestedBy: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { id: 'desc' },
      take: 100,
    });
  }

  async requestWardReturn(
    hospitalId: number,
    requestedById: number,
    dto: RequestWardReturnDto,
  ) {
    const { wardReturn, audit } = await this.prisma.$transaction(async (tx) => {
      const [warehouse, product] = await Promise.all([
        tx.warehouse.findFirst({
          where: { id: dto.warehouseId, hospitalId, isActive: true },
          select: { id: true },
        }),
        tx.product.findFirst({
          where: {
            id: dto.productId,
            hospitalId,
            isActive: true,
            isDeleted: false,
          },
          select: { id: true },
        }),
      ]);
      if (!warehouse) {
        throw new NotFoundException('المخزن غير موجود ضمن المنشأة.');
      }
      if (!product) {
        throw new NotFoundException('الصنف غير موجود ضمن المنشأة.');
      }
      if (dto.wardId) {
        const ward = await tx.ward.findFirst({
          where: { id: dto.wardId, hospitalId },
          select: { id: true },
        });
        if (!ward) {
          throw new NotFoundException('العنبر غير موجود ضمن المنشأة.');
        }
      }

      const qtyStr = Money.toDbString(Money.roundDecimal(dto.quantity, 3));
      const created = await tx.wardStockReturn.create({
        data: {
          hospitalId,
          wardId: dto.wardId ?? null,
          encounterId: dto.encounterId ?? null,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          batchNumber: dto.batchNumber?.trim() || null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          quantity: qtyStr,
          reason: dto.reason.trim(),
          sealIntact: dto.sealIntact,
          coldChainMaintained: dto.coldChainMaintained,
          status: 'PENDING_PHARMACIST',
          requestedById,
        },
        include: {
          product: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: requestedById,
        action: 'WARD_STOCK_RETURN_REQUESTED',
        entity: 'WardStockReturn',
        entityId: created.id,
        details: {
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          quantity: qtyStr,
          sealIntact: dto.sealIntact,
          coldChainMaintained: dto.coldChainMaintained,
        },
      });

      return { wardReturn: created, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return wardReturn;
  }

  async reviewWardReturn(
    hospitalId: number,
    returnId: number,
    reviewedById: number,
    dto: ReviewWardReturnDto,
  ) {
    const { wardReturn, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "WardStockReturn" WHERE id = ${returnId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.wardStockReturn.findFirst({
        where: { id: returnId, hospitalId },
        include: {
          product: { select: { id: true, costPrice: true } },
        },
      });
      if (!existing) {
        throw new NotFoundException('طلب مرتجع العنبر غير موجود ضمن المنشأة.');
      }
      if (existing.status !== 'PENDING_PHARMACIST') {
        throw new ConflictException('تم البتّ في طلب مرتجع العنبر مسبقًا.');
      }
      if (existing.requestedById === reviewedById) {
        throw new ConflictException(
          'اعتماد مرتجع العنبر (4 عيون) يشترط صيدليًا مستقلاً مختلفًا عن مُقدِّم الطلب.',
        );
      }

      const now = new Date();
      let stockTransactionId: number | null = null;
      let nextStatus: 'APPROVED_RESTOCKED' | 'REJECTED_DESTROY' =
        'REJECTED_DESTROY';

      if (dto.decision === 'APPROVE_RESTOCK') {
        const eligibility = evaluateWardReturnEligibility({
          sealIntact: existing.sealIntact,
          coldChainMaintained: existing.coldChainMaintained,
          expiryDate: existing.expiryDate,
          referenceDate: now,
        });
        if (!eligibility.eligibleForRestock) {
          throw new ConflictException(
            `حظر سلامة دوائية: لا يمكن إعادة الصنف للمخزون — ${eligibility.reasons.join(' ')}`,
          );
        }

        const unitCostDec = Money.roundDecimal(existing.product.costPrice, 4);
        const qtyDec = Money.roundDecimal(existing.quantity, 3);
        const totalCostDec = Money.roundDecimal(
          Money.multiply(qtyDec, unitCostDec),
          3,
        );
        const qtyStr = Money.toDbString(qtyDec);

        // Atomic restock: StockTransaction + ProductStock + Product.stockOnHand
        const stockTx = await tx.stockTransaction.create({
          data: {
            hospitalId,
            warehouseId: existing.warehouseId,
            productId: existing.productId,
            type: StockTransactionType.IN,
            quantity: qtyStr,
            baseQuantity: qtyStr,
            unitCost: Money.toUnitDbString(unitCostDec),
            totalCost: Money.toDbString(totalCostDec),
            referenceType: 'WARD_RETURN',
            referenceId: existing.id,
            batchNumber: existing.batchNumber,
            expiryDate: existing.expiryDate,
            notes: `مرتجع عنبر معتمد #${existing.id}: ${existing.reason}`,
            createdById: reviewedById,
          },
        });
        stockTransactionId = stockTx.id;

        const batchKey = existing.batchNumber ?? 'WARD-RETURN';
        const existingStock = await tx.productStock.findFirst({
          where: {
            hospitalId,
            warehouseId: existing.warehouseId,
            productId: existing.productId,
            batchNumber: batchKey,
          },
        });
        if (existingStock) {
          await tx.productStock.update({
            where: { id: existingStock.id },
            data: { quantity: { increment: new Prisma.Decimal(qtyStr) } },
          });
        } else {
          await tx.productStock.create({
            data: {
              hospitalId,
              warehouseId: existing.warehouseId,
              productId: existing.productId,
              batchNumber: batchKey,
              expiryDate: existing.expiryDate,
              quantity: qtyStr,
              unitCost: Money.toUnitDbString(unitCostDec),
            },
          });
        }

        await tx.product.update({
          where: { id: existing.productId },
          data: { stockOnHand: { increment: new Prisma.Decimal(qtyStr) } },
        });
        nextStatus = 'APPROVED_RESTOCKED';
      }

      const updated = await tx.wardStockReturn.update({
        where: { id: returnId },
        data: {
          status: nextStatus,
          reviewedById,
          reviewedAt: now,
          reviewNotes: dto.reviewNotes?.trim() || null,
          stockTransactionId,
        },
        include: {
          product: { select: { id: true, code: true, name: true } },
          reviewedBy: { select: { id: true, fullName: true } },
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: reviewedById,
        action:
          nextStatus === 'APPROVED_RESTOCKED'
            ? 'WARD_STOCK_RETURN_RESTOCKED'
            : 'WARD_STOCK_RETURN_REJECTED',
        entity: 'WardStockReturn',
        entityId: returnId,
        details: {
          decision: dto.decision,
          status: nextStatus,
          stockTransactionId,
          quantity: Money.toDbString(existing.quantity),
        },
      });

      return { wardReturn: updated, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return wardReturn;
  }
}
