BEGIN;
CREATE TABLE "InventoryRecallSupplierReceipt" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL,
  "movementId" INTEGER NOT NULL REFERENCES "StockTransaction"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" UUID NOT NULL,
  quantity DECIMAL(18,3) NOT NULL CHECK (quantity > 0),
  "evidenceReference" TEXT NOT NULL CHECK (length(btrim("evidenceReference")) BETWEEN 3 AND 200 AND "evidenceReference" = btrim("evidenceReference")),
  "receivedBy" TEXT NOT NULL CHECK (length(btrim("receivedBy")) BETWEEN 2 AND 200),
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "recordedById" INTEGER NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InventoryRecallSupplierReceipt_hospitalId_requestId_key" ON "InventoryRecallSupplierReceipt" ("hospitalId", "requestId");
CREATE UNIQUE INDEX inventory_recall_supplier_receipt_evidence_key ON "InventoryRecallSupplierReceipt" ("movementId", "evidenceReference");
CREATE INDEX inventory_recall_supplier_receipt_history_idx ON "InventoryRecallSupplierReceipt" ("movementId", id);

CREATE FUNCTION guard_recall_supplier_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  returned_quantity NUMERIC;
  acknowledged_quantity NUMERIC;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Recall supplier receipt evidence is append-only' USING ERRCODE = '23514';
  END IF;
  SELECT m.quantity INTO returned_quantity FROM "StockTransaction" m
    JOIN "PurchaseReturn" ret ON ret.id = m."purchaseReturnId" AND ret."hospitalId" = m."hospitalId"
      AND ret.status = 'COMPLETED' AND ret."accountingEntryId" IS NOT NULL
      AND ret."purchaseInvoiceId" = m."purchaseInvoiceId"
    JOIN "Supplier" s ON s.id = ret."supplierId" AND s."hospitalId" = m."hospitalId"
    JOIN "InventoryBatchRestriction" r ON r."hospitalId" = m."hospitalId" AND r."productId" = m."productId"
      AND r."batchNumber" = btrim(m."batchNumber") AND r.status = 'RECALLED'
    WHERE m.id = NEW."movementId" AND m."hospitalId" = NEW."hospitalId"
      AND m."referenceType" = 'PURCHASE_RETURN' AND m."referenceId" = ret.id
      AND m.type = 'OUT' AND m.quantity > 0 AND m.quantity = m."baseQuantity"
    FOR UPDATE OF m;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier receipt must reference a posted return of the recalled batch' USING ERRCODE = '23514';
  END IF;
  IF NEW."receivedAt" > (clock_timestamp() AT TIME ZONE 'UTC') OR NOT EXISTS (
    SELECT 1 FROM "User" u WHERE u.id = NEW."recordedById" AND u."isActive" AND NOT u."isDeleted"
      AND (u."hospitalId" = NEW."hospitalId" OR EXISTS (
        SELECT 1 FROM "UserHospitalAccess" a WHERE a."userId" = u.id AND a."hospitalId" = NEW."hospitalId"))
  ) THEN
    RAISE EXCEPTION 'Supplier receipt requires a valid time and facility staff identity' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(SUM(quantity), 0) INTO acknowledged_quantity
    FROM "InventoryRecallSupplierReceipt" WHERE "movementId" = NEW."movementId";
  IF acknowledged_quantity + NEW.quantity > returned_quantity THEN
    RAISE EXCEPTION 'Supplier receipt exceeds the returned quantity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_recall_supplier_receipt_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "InventoryRecallSupplierReceipt"
  FOR EACH ROW EXECUTE FUNCTION guard_recall_supplier_receipt();
COMMIT;
