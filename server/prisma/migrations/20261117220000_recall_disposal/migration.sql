BEGIN;
CREATE TYPE "RecallDisposalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXECUTED', 'POSTED');
CREATE TABLE "InventoryRecallDisposal" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL,
  "stockId" INTEGER NOT NULL REFERENCES "ProductStock"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "isolationId" INTEGER NOT NULL REFERENCES "InventoryRecallIsolation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" UUID NOT NULL,
  quantity DECIMAL(18,3) NOT NULL CHECK (quantity > 0 AND quantity <> 'NaN'::numeric),
  reason TEXT NOT NULL,
  status "RecallDisposalStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedById" INTEGER NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "cancellationNote" TEXT,
  "cancelledById" INTEGER,
  "cancelledAt" TIMESTAMP(3),
  "evidenceReference" TEXT,
  "performedBy" TEXT,
  "performedQuantity" DECIMAL(18,3) CHECK ("performedQuantity" >= 0 AND "performedQuantity" <> 'NaN'::numeric),
  "performedAt" TIMESTAMP(3),
  "recordedById" INTEGER,
  "recordedAt" TIMESTAMP(3),
  "postedById" INTEGER,
  "postedAt" TIMESTAMP(3),
  "movementId" INTEGER REFERENCES "StockTransaction"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountingEntryId" INTEGER REFERENCES "AccountingEntry"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "valuationBefore" DECIMAL(18,3),
  "valuationAfter" DECIMAL(18,3),
  CHECK ("reviewedById" IS NULL OR "reviewedById" <> "requestedById"),
  CHECK (status NOT IN ('APPROVED','REJECTED','EXECUTED','POSTED') OR
    ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL)),
  CHECK (status NOT IN ('EXECUTED','POSTED') OR
    ("evidenceReference" IS NOT NULL AND "performedBy" IS NOT NULL AND "performedAt" IS NOT NULL AND "performedQuantity" IS NOT NULL
     AND "recordedById" IS NOT NULL AND "recordedAt" IS NOT NULL)),
  CHECK (status <> 'CANCELLED' OR ("cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationNote" IS NOT NULL)),
  CHECK (status <> 'POSTED' OR ("movementId" IS NOT NULL AND "postedAt" IS NOT NULL AND "postedById" IS NOT NULL
    AND "performedQuantity" = quantity AND "valuationBefore" IS NOT NULL AND "valuationAfter" IS NOT NULL AND "valuationBefore" >= "valuationAfter"
    AND (("accountingEntryId" IS NULL) = ("valuationBefore" = "valuationAfter"))))
);
CREATE UNIQUE INDEX "InventoryRecallDisposal_hospitalId_requestId_key" ON "InventoryRecallDisposal" ("hospitalId", "requestId");
CREATE UNIQUE INDEX "InventoryRecallDisposal_movementId_key" ON "InventoryRecallDisposal" ("movementId");
CREATE UNIQUE INDEX "InventoryRecallDisposal_accountingEntryId_key" ON "InventoryRecallDisposal" ("accountingEntryId");
CREATE INDEX "InventoryRecallDisposal_stockId_id_idx" ON "InventoryRecallDisposal" ("stockId", id);
CREATE UNIQUE INDEX recall_disposal_active_stock_key ON "InventoryRecallDisposal" ("stockId") WHERE status IN ('APPROVED','EXECUTED');
CREATE UNIQUE INDEX recall_disposal_movement_key ON "StockTransaction" ("hospitalId","referenceId") WHERE "referenceType" = 'RECALL_DISPOSAL';

CREATE FUNCTION protect_recall_disposal_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.quantity, NEW.version, NEW."hospitalId", NEW."warehouseId", NEW."productId", NEW."batchNumber")
    IS DISTINCT FROM (OLD.quantity, OLD.version, OLD."hospitalId", OLD."warehouseId", OLD."productId", OLD."batchNumber")
    AND EXISTS (SELECT 1 FROM "InventoryRecallDisposal" WHERE "stockId" = OLD.id AND status IN ('APPROVED','EXECUTED'))
  THEN
    RAISE EXCEPTION 'Stock is reserved for an approved recall disposal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recall_disposal_stock_reservation BEFORE UPDATE ON "ProductStock"
  FOR EACH ROW EXECUTE FUNCTION protect_recall_disposal_stock();

CREATE FUNCTION guard_recall_disposal_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Recall disposal history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'REQUESTED' AND EXISTS (
      SELECT 1 FROM "InventoryRecallIsolation" i JOIN "ProductStock" s ON s.id = i."stockId"
      JOIN "InventoryBatchRestriction" r ON r."hospitalId" = s."hospitalId"
        AND r."productId" = s."productId" AND r."batchNumber" = btrim(s."batchNumber")
      WHERE i.id = NEW."isolationId" AND s.id = NEW."stockId" AND i."hospitalId" = NEW."hospitalId"
        AND s."hospitalId" = NEW."hospitalId" AND r.status = 'RECALLED'
        AND NEW.quantity <= i."isolatedQuantity"
    ) THEN RETURN NEW; END IF;
  ELSIF (NEW."hospitalId",NEW."stockId",NEW."isolationId",NEW."requestId",NEW.quantity,NEW.reason,NEW."requestedById",NEW."requestedAt")
      IS NOT DISTINCT FROM (OLD."hospitalId",OLD."stockId",OLD."isolationId",OLD."requestId",OLD.quantity,OLD.reason,OLD."requestedById",OLD."requestedAt")
    AND (
      (OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED'))
      OR (OLD.status = 'APPROVED' AND NEW.status IN ('EXECUTED','CANCELLED'))
      OR (OLD.status = 'EXECUTED' AND NEW.status = 'POSTED')
    )
    AND (OLD.status = 'REQUESTED' OR (NEW."reviewedById",NEW."reviewedAt",NEW."reviewNote")
      IS NOT DISTINCT FROM (OLD."reviewedById",OLD."reviewedAt",OLD."reviewNote"))
    AND (OLD.status <> 'EXECUTED' OR (NEW."evidenceReference",NEW."performedBy",NEW."performedQuantity",NEW."performedAt",NEW."recordedById",NEW."recordedAt")
      IS NOT DISTINCT FROM (OLD."evidenceReference",OLD."performedBy",OLD."performedQuantity",OLD."performedAt",OLD."recordedById",OLD."recordedAt"))
    AND (NEW.status <> 'APPROVED' OR EXISTS (
      SELECT 1 FROM "ProductStock" s JOIN "InventoryRecallIsolation" i ON i."stockId" = s.id
      WHERE s.id = NEW."stockId" AND i.id = NEW."isolationId" AND i."stockVersion" = s.version
        AND i."onHand" = s.quantity AND i."isolatedQuantity" >= NEW.quantity AND s.quantity >= NEW.quantity
        AND NOT EXISTS (SELECT 1 FROM "InventoryRecallIsolation" latest WHERE latest."stockId" = s.id AND latest.id > i.id)
      FOR UPDATE OF s
    ))
  THEN RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid recall disposal transition' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER recall_disposal_history_guard BEFORE INSERT OR UPDATE OR DELETE ON "InventoryRecallDisposal"
  FOR EACH ROW EXECUTE FUNCTION guard_recall_disposal_state();

CREATE OR REPLACE FUNCTION guard_usable_stock_outflow() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  facility_zone TEXT;
  utc_now TIMESTAMP;
BEGIN
  IF NEW."referenceType" = 'RECALL_DISPOSAL' THEN
    IF EXISTS (
      SELECT 1 FROM "InventoryRecallDisposal" d JOIN "ProductStock" s ON s.id = d."stockId"
      JOIN "InventoryRecallIsolation" i ON i.id = d."isolationId"
      JOIN "InventoryBatchRestriction" r ON r."hospitalId" = s."hospitalId"
        AND r."productId" = s."productId" AND r."batchNumber" = btrim(s."batchNumber") AND r.status = 'RECALLED'
      WHERE d.id = NEW."referenceId" AND d."hospitalId" = NEW."hospitalId" AND d.status = 'EXECUTED'
        AND d."performedQuantity" = d.quantity
        AND s."hospitalId" = NEW."hospitalId" AND s."warehouseId" = NEW."warehouseId" AND s."productId" = NEW."productId"
        AND s."batchNumber" = NEW."batchNumber" AND s.version = i."stockVersion"
        AND s.quantity = i."onHand" AND s.quantity >= d.quantity
        AND NEW.quantity = d.quantity AND NEW."baseQuantity" = d.quantity
        AND NEW."purchaseReturnId" IS NULL AND NEW."dispenseRecordId" IS NULL AND NEW."stockIssueId" IS NULL
    ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Recall disposal outflow requires matching executed evidence' USING ERRCODE = '23514';
  END IF;
  IF NEW."referenceType" = 'PURCHASE_RETURN' AND NEW."purchaseReturnId" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM id FROM "Product" WHERE id = NEW."productId" AND "hospitalId" = NEW."hospitalId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock outflow must belong to the same facility' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "InventoryBatchRestriction" r WHERE r."hospitalId" = NEW."hospitalId"
      AND r."productId" = NEW."productId" AND r."batchNumber" = btrim(NEW."batchNumber")
      AND r.status <> 'RELEASED'
  ) THEN
    RAISE EXCEPTION 'Restricted stock batch cannot be issued' USING ERRCODE = '23514';
  END IF;
  IF NEW."expiryDate" IS NOT NULL THEN
    SELECT COALESCE(o.timezone, 'Africa/Tripoli') INTO STRICT facility_zone
    FROM "Hospital" h LEFT JOIN "Organization" o ON o.id = h."organizationId"
    WHERE h.id = NEW."hospitalId";
    utc_now := clock_timestamp() AT TIME ZONE 'UTC';
    IF (CASE WHEN NEW."expiryDate"::time = TIME '00:00:00'
      THEN NEW."expiryDate"::date < (timezone(facility_zone, utc_now AT TIME ZONE 'UTC'))::date
      ELSE NEW."expiryDate" <= utc_now END)
    THEN
      RAISE EXCEPTION 'Expired stock batch cannot be issued' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION require_posted_recall_disposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "InventoryRecallDisposal" WHERE id = NEW."referenceId" AND "hospitalId" = NEW."hospitalId"
      AND status = 'POSTED' AND "movementId" = NEW.id
  ) THEN
    RAISE EXCEPTION 'Recall disposal movement requires a completed posting' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER recall_disposal_movement_complete AFTER INSERT ON "StockTransaction"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."referenceType" = 'RECALL_DISPOSAL')
  EXECUTE FUNCTION require_posted_recall_disposal();

INSERT INTO "Permission" (code, description) VALUES
  ('inventory:recall-disposal:review', 'اعتماد وإلغاء طلبات إتلاف التشغيلات المستدعاة'),
  ('inventory:recall-disposal:post', 'ترحيل إتلاف التشغيلات المستدعاة')
ON CONFLICT (code) DO NOTHING;
COMMIT;
