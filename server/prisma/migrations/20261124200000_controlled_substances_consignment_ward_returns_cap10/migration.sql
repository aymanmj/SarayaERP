-- Migration #76: CAP10 Controlled Substances (Narcotics Double-Sign), Consignment Stock & Ward Stock Returns

-- 1. Extend Product with controlled substance schedule metadata
ALTER TABLE "Product"
  ADD COLUMN "isControlled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "controlledSchedule" VARCHAR(24);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_controlled_schedule_chk"
    CHECK (
      "controlledSchedule" IS NULL
      OR "controlledSchedule" IN ('SCHEDULE_I', 'SCHEDULE_II', 'SCHEDULE_III', 'SCHEDULE_IV', 'SCHEDULE_V', 'PSYCHOTROPIC')
    );

-- 2. Append-only ControlledSubstanceLog (4-eyes double-sign + SHA-256 chain)
CREATE TABLE "ControlledSubstanceLog" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "warehouseId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "batchNumber" VARCHAR(80) NOT NULL,
  "patientId" INTEGER,
  "encounterId" INTEGER,
  "transactionType" VARCHAR(24) NOT NULL,
  "quantityBefore" DECIMAL(18,3) NOT NULL,
  "quantityChange" DECIMAL(18,3) NOT NULL,
  "quantityAfter" DECIMAL(18,3) NOT NULL,
  "wastedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "performedById" INTEGER NOT NULL,
  "witnessedById" INTEGER NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "previousHash" VARCHAR(64) NOT NULL,
  "entryHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ControlledSubstanceLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ControlledSubstanceLog_type_chk" CHECK ("transactionType" IN ('RECEIPT', 'DISPENSE', 'WASTE', 'RETURN', 'ADJUSTMENT', 'SHIFT_COUNT')),
  CONSTRAINT "ControlledSubstanceLog_four_eyes_chk" CHECK ("witnessedById" <> "performedById"),
  CONSTRAINT "ControlledSubstanceLog_balance_chk" CHECK (
    "quantityBefore" >= 0
    AND "quantityAfter" >= 0
    AND "wastedQuantity" >= 0
    AND "quantityAfter" = ("quantityBefore" + "quantityChange")
  ),
  CONSTRAINT "ControlledSubstanceLog_reason_chk" CHECK (length(trim("reason")) >= 3),
  CONSTRAINT "ControlledSubstanceLog_hash_chk" CHECK ("entryHash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "ControlledLog_scope_idx"
  ON "ControlledSubstanceLog"("hospitalId", "warehouseId", "productId", "batchNumber");

ALTER TABLE "ControlledSubstanceLog"
  ADD CONSTRAINT "ControlledSubstanceLog_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledSubstanceLog_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledSubstanceLog_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledSubstanceLog_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledSubstanceLog_encounterId_fkey"
    FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledSubstanceLog_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ControlledSubstanceLog_witnessedById_fkey"
    FOREIGN KEY ("witnessedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_controlled_substance_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ControlledSubstanceLog records are append-only and cannot be modified or deleted' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER controlled_substance_log_immutable_guard
  BEFORE UPDATE OR DELETE ON "ControlledSubstanceLog"
  FOR EACH ROW
  EXECUTE FUNCTION guard_controlled_substance_log_immutable();

-- 3. ConsignmentReceipt (Supplier-owned consignment stock)
CREATE TABLE "ConsignmentReceipt" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "warehouseId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "batchNumber" VARCHAR(80) NOT NULL,
  "serialNumber" VARCHAR(100),
  "expiryDate" TIMESTAMP(3),
  "quantityReceived" DECIMAL(18,3) NOT NULL,
  "quantityConsumed" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "quantityReturned" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "agreedUnitPrice" DECIMAL(19,4) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  "receivedById" INTEGER NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsignmentReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsignmentReceipt_qty_chk" CHECK (
    "quantityReceived" > 0
    AND "quantityConsumed" >= 0
    AND "quantityReturned" >= 0
    AND ("quantityConsumed" + "quantityReturned") <= "quantityReceived"
    AND "agreedUnitPrice" >= 0
  ),
  CONSTRAINT "ConsignmentReceipt_status_chk" CHECK ("status" IN ('ACTIVE', 'PARTIALLY_CONSUMED', 'FULLY_CONSUMED', 'RETURNED_TO_SUPPLIER'))
);

CREATE INDEX "ConsignmentReceipt_hospitalId_supplierId_status_idx"
  ON "ConsignmentReceipt"("hospitalId", "supplierId", "status");
CREATE INDEX "ConsignmentReceipt_hospitalId_productId_status_idx"
  ON "ConsignmentReceipt"("hospitalId", "productId", "status");

ALTER TABLE "ConsignmentReceipt"
  ADD CONSTRAINT "ConsignmentReceipt_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentReceipt_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentReceipt_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentReceipt_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentReceipt_receivedById_fkey"
    FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_consignment_receipt()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ConsignmentReceipt records cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."hospitalId" IS DISTINCT FROM NEW."hospitalId"
     OR OLD."supplierId" IS DISTINCT FROM NEW."supplierId"
     OR OLD."productId" IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'ConsignmentReceipt ownership and product scope are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."quantityConsumed" > 0 AND OLD."agreedUnitPrice" IS DISTINCT FROM NEW."agreedUnitPrice" THEN
    RAISE EXCEPTION 'ConsignmentReceipt agreedUnitPrice cannot change after consumption' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consignment_receipt_guard
  BEFORE UPDATE OR DELETE ON "ConsignmentReceipt"
  FOR EACH ROW
  EXECUTE FUNCTION guard_consignment_receipt();

-- 4. ConsignmentConsumption (Patient-linked consumption -> Supplier billing obligation)
CREATE TABLE "ConsignmentConsumption" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "consignmentReceiptId" INTEGER NOT NULL,
  "encounterId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unitPrice" DECIMAL(19,4) NOT NULL,
  "totalAmount" DECIMAL(18,3) NOT NULL,
  "consumedById" INTEGER NOT NULL,
  "witnessedById" INTEGER,
  "supplierBillStatus" VARCHAR(24) NOT NULL DEFAULT 'PENDING_BILLING',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsignmentConsumption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsignmentConsumption_amounts_chk" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "totalAmount" >= 0),
  CONSTRAINT "ConsignmentConsumption_bill_status_chk" CHECK ("supplierBillStatus" IN ('PENDING_BILLING', 'BILLED', 'SETTLED'))
);

CREATE INDEX "ConsignmentConsumption_hospitalId_encounterId_idx"
  ON "ConsignmentConsumption"("hospitalId", "encounterId");
CREATE INDEX "ConsignmentConsumption_consignmentReceiptId_idx"
  ON "ConsignmentConsumption"("consignmentReceiptId");

ALTER TABLE "ConsignmentConsumption"
  ADD CONSTRAINT "ConsignmentConsumption_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentConsumption_consignmentReceiptId_fkey"
    FOREIGN KEY ("consignmentReceiptId") REFERENCES "ConsignmentReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentConsumption_encounterId_fkey"
    FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentConsumption_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentConsumption_consumedById_fkey"
    FOREIGN KEY ("consumedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentConsumption_witnessedById_fkey"
    FOREIGN KEY ("witnessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_consignment_consumption_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ConsignmentConsumption records cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."quantity" IS DISTINCT FROM NEW."quantity"
     OR OLD."unitPrice" IS DISTINCT FROM NEW."unitPrice"
     OR OLD."totalAmount" IS DISTINCT FROM NEW."totalAmount"
     OR OLD."encounterId" IS DISTINCT FROM NEW."encounterId" THEN
    RAISE EXCEPTION 'ConsignmentConsumption financial and clinical link fields are immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consignment_consumption_immutable_guard
  BEFORE UPDATE OR DELETE ON "ConsignmentConsumption"
  FOR EACH ROW
  EXECUTE FUNCTION guard_consignment_consumption_immutable();

-- 5. WardStockReturn (Pharmacist 4-eyes approval + sealed/cold-chain restock gate)
CREATE TABLE "WardStockReturn" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "wardId" INTEGER,
  "encounterId" INTEGER,
  "warehouseId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "batchNumber" VARCHAR(80),
  "expiryDate" TIMESTAMP(3),
  "quantity" DECIMAL(18,3) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "sealIntact" BOOLEAN NOT NULL DEFAULT true,
  "coldChainMaintained" BOOLEAN NOT NULL DEFAULT true,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING_PHARMACIST',
  "requestedById" INTEGER NOT NULL,
  "reviewedById" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "stockTransactionId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WardStockReturn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WardStockReturn_qty_chk" CHECK ("quantity" > 0),
  CONSTRAINT "WardStockReturn_status_chk" CHECK ("status" IN ('PENDING_PHARMACIST', 'APPROVED_RESTOCKED', 'REJECTED_DESTROY')),
  CONSTRAINT "WardStockReturn_review_chk" CHECK (
    "status" = 'PENDING_PHARMACIST'
    OR (
      "reviewedById" IS NOT NULL
      AND "reviewedById" <> "requestedById"
      AND "reviewedAt" IS NOT NULL
    )
  ),
  CONSTRAINT "WardStockReturn_restock_safety_chk" CHECK (
    "status" <> 'APPROVED_RESTOCKED'
    OR ("sealIntact" = true AND "coldChainMaintained" = true AND "stockTransactionId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "WardStockReturn_stockTransactionId_key" ON "WardStockReturn"("stockTransactionId");
CREATE INDEX "WardStockReturn_hospitalId_status_idx" ON "WardStockReturn"("hospitalId", "status");
CREATE INDEX "WardStockReturn_hospitalId_warehouseId_idx" ON "WardStockReturn"("hospitalId", "warehouseId");

ALTER TABLE "WardStockReturn"
  ADD CONSTRAINT "WardStockReturn_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WardStockReturn_wardId_fkey"
    FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "WardStockReturn_encounterId_fkey"
    FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "WardStockReturn_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WardStockReturn_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WardStockReturn_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WardStockReturn_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "WardStockReturn_stockTransactionId_fkey"
    FOREIGN KEY ("stockTransactionId") REFERENCES "StockTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_ward_stock_return()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WardStockReturn audit records cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."status" IN ('APPROVED_RESTOCKED', 'REJECTED_DESTROY') THEN
    RAISE EXCEPTION 'Finalized WardStockReturn record is immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ward_stock_return_guard
  BEFORE UPDATE OR DELETE ON "WardStockReturn"
  FOR EACH ROW
  EXECUTE FUNCTION guard_ward_stock_return();
