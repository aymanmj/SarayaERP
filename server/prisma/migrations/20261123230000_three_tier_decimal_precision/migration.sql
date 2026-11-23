-- AlterTable
ALTER TABLE "CashierShiftClosing" ALTER COLUMN "systemCashTotal" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "actualCashTotal" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "difference" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "CommissionRule" ALTER COLUMN "doctorRate" SET DATA TYPE DECIMAL(19,6),
ALTER COLUMN "hospitalRate" SET DATA TYPE DECIMAL(19,6);

-- AlterTable
ALTER TABLE "ContractBenefit" ALTER COLUMN "agreedPrice" SET DATA TYPE DECIMAL(19,4),
ALTER COLUMN "discountPercent" SET DATA TYPE DECIMAL(19,6),
ALTER COLUMN "copayPercent" SET DATA TYPE DECIMAL(19,6);

-- AlterTable
ALTER TABLE "CoverageRule" ALTER COLUMN "copayValue" SET DATA TYPE DECIMAL(19,6);

-- AlterTable
ALTER TABLE "DispenseItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "DoctorSchedule" ALTER COLUMN "consultationPrice" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "EncounterCharge" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "GatewayClearingFeeEntry" ALTER COLUMN "feeRate" SET DATA TYPE DECIMAL(19,6);

-- AlterTable
ALTER TABLE "GoodsReceiptItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(19,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "ICUEquipmentUsage" ALTER COLUMN "dailyRate" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "InsuranceContract" ALTER COLUMN "discountPercentage" SET DATA TYPE DECIMAL(19,6),
ALTER COLUMN "copayPercentage" SET DATA TYPE DECIMAL(19,6);

-- AlterTable
ALTER TABLE "InsurancePlan" ALTER COLUMN "defaultCopayRate" SET DATA TYPE DECIMAL(19,6);

-- AlterTable
ALTER TABLE "InsurancePolicy" ALTER COLUMN "patientCopayRate" SET DATA TYPE DECIMAL(19,6);

-- AlterTable
ALTER TABLE "InventoryCountLine" ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "PrescriptionItem" ALTER COLUMN "prepaidUnitPrice" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "PriceListItem" ALTER COLUMN "price" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(19,4),
ALTER COLUMN "sellPrice" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "ProductStock" ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "ProductUOM" ALTER COLUMN "conversionRate" SET DATA TYPE DECIMAL(19,6);

-- AlterTable
ALTER TABLE "PurchaseInvoiceLine" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(19,4);

-- AlterTable (temporarily drop & recreate column-list trigger on PurchaseOrderItem.unitPrice)
DROP TRIGGER IF EXISTS protect_received_order_terms ON "PurchaseOrderItem";
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(19,4);
CREATE TRIGGER protect_received_order_terms
  BEFORE UPDATE OF "unitPrice", "quantity", "baseQuantity", "uomId", "productId", "purchaseOrderId"
  ON "PurchaseOrderItem"
  FOR EACH ROW
  EXECUTE FUNCTION protect_received_order_terms();

-- AlterTable
ALTER TABLE "PurchaseReturnLine" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "ServiceItem" ALTER COLUMN "defaultPrice" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "ServiceMaterialConsumption" ALTER COLUMN "multiplier" SET DATA TYPE DECIMAL(19,6);

-- AlterTable
ALTER TABLE "StockIssueItem" ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(19,4),
ALTER COLUMN "batchUnitCost" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "StockTransaction" ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "SurgeryConsumable" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(19,4);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "commissionRate" SET DATA TYPE DECIMAL(19,6);

-- AlterTable
ALTER TABLE "admissions" ALTER COLUMN "estimatedCost" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "actualCost" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "discharge_planning" ALTER COLUMN "estimatedCost" SET DATA TYPE DECIMAL(18,3);

