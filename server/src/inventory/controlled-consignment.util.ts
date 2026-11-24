import { createHash } from 'node:crypto';
import { Money } from '../common/utils/money.util';

export const CONTROLLED_SCHEDULES = [
  'SCHEDULE_I',
  'SCHEDULE_II',
  'SCHEDULE_III',
  'SCHEDULE_IV',
  'SCHEDULE_V',
  'PSYCHOTROPIC',
] as const;
export type ControlledSchedule = (typeof CONTROLLED_SCHEDULES)[number];

export const CONTROLLED_TX_TYPES = [
  'RECEIPT',
  'DISPENSE',
  'WASTE',
  'RETURN',
  'ADJUSTMENT',
  'SHIFT_COUNT',
] as const;
export type ControlledTxType = (typeof CONTROLLED_TX_TYPES)[number];

/**
 * Deterministic SHA-256 tamper-evident chain hash for ControlledSubstanceLog entries.
 */
export function computeControlledLogHash(input: {
  previousHash: string;
  hospitalId: number;
  warehouseId: number;
  productId: number;
  batchNumber: string;
  patientId: number | null;
  encounterId: number | null;
  transactionType: ControlledTxType;
  quantityBefore: string;
  quantityChange: string;
  quantityAfter: string;
  wastedQuantity: string;
  performedById: number;
  witnessedById: number;
  reason: string;
  createdAt: Date;
}): string {
  const canonical = JSON.stringify({
    v: 1,
    previousHash: input.previousHash,
    hospitalId: input.hospitalId,
    warehouseId: input.warehouseId,
    productId: input.productId,
    batchNumber: input.batchNumber,
    patientId: input.patientId,
    encounterId: input.encounterId,
    transactionType: input.transactionType,
    quantityBefore: input.quantityBefore,
    quantityChange: input.quantityChange,
    quantityAfter: input.quantityAfter,
    wastedQuantity: input.wastedQuantity,
    performedById: input.performedById,
    witnessedById: input.witnessedById,
    reason: input.reason.trim(),
    createdAt: input.createdAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Computes exact supplier consignment consumption monetary total using Money (ROUND_HALF_EVEN).
 */
export function computeConsignmentLineTotal(
  quantity: number | string,
  agreedUnitPrice: number | string,
): { unitPriceStr: string; totalAmountStr: string } {
  const unitPriceDec = Money.roundDecimal(agreedUnitPrice, 4);
  const qtyDec = Money.roundDecimal(quantity, 3);
  const totalDec = Money.roundDecimal(Money.multiply(qtyDec, unitPriceDec), 3);
  return {
    unitPriceStr: Money.toUnitDbString(unitPriceDec),
    totalAmountStr: Money.toDbString(totalDec),
  };
}

export interface WardReturnEligibilityResult {
  eligibleForRestock: boolean;
  reasons: string[];
}

/**
 * Evaluates whether a ward-returned medication or supply is clinically safe
 * to restock into pharmacy/warehouse inventory (JCI MMU.3).
 */
export function evaluateWardReturnEligibility(input: {
  sealIntact: boolean;
  coldChainMaintained: boolean;
  expiryDate?: Date | null;
  referenceDate?: Date;
}): WardReturnEligibilityResult {
  const now = input.referenceDate ?? new Date();
  const reasons: string[] = [];

  if (!input.sealIntact) {
    reasons.push(
      'العبوة غير محكمة الإغلاق أو فُتح ختمها؛ لا يجوز إعادتها للمخزون القابل للصرف.',
    );
  }
  if (!input.coldChainMaintained) {
    reasons.push(
      'سلسلة التبريد غير محفوظة؛ يجب رفض الإعادة للمخزون وتحويل الصنف للإتلاف.',
    );
  }
  if (input.expiryDate && input.expiryDate.getTime() <= now.getTime()) {
    reasons.push('تاريخ صلاحية الصنف منتهٍ؛ يمنع إعادته للمخزون القابل للصرف.');
  }

  return {
    eligibleForRestock: reasons.length === 0,
    reasons,
  };
}
