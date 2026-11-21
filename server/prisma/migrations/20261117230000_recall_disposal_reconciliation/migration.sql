BEGIN;
ALTER TYPE "RecallDisposalStatus" ADD VALUE IF NOT EXISTS 'NO_DISPOSAL';
COMMIT;

BEGIN;
ALTER TABLE "InventoryRecallDisposal"
  ADD COLUMN "reconciledById" INTEGER,
  ADD COLUMN "reconciledAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationReference" TEXT,
  ADD COLUMN "reconciliationNote" TEXT,
  ADD COLUMN "countedRemaining" DECIMAL(18,3),
  DROP CONSTRAINT "InventoryRecallDisposal_check4",
  ADD CONSTRAINT recall_disposal_posting_check CHECK (
    status <> 'POSTED' OR ("movementId" IS NOT NULL AND "postedAt" IS NOT NULL AND "postedById" IS NOT NULL
      AND "performedQuantity" IS NOT NULL AND "performedQuantity" > 0
      AND ("performedQuantity" = quantity OR "reconciledById" IS NOT NULL)
      AND "valuationBefore" IS NOT NULL AND "valuationAfter" IS NOT NULL AND "valuationBefore" >= "valuationAfter"
      AND (("accountingEntryId" IS NULL) = ("valuationBefore" = "valuationAfter")))),
  ADD CONSTRAINT recall_disposal_reconciliation_check CHECK (
    ("reconciledById" IS NULL AND "reconciledAt" IS NULL AND "reconciliationReference" IS NULL
      AND "reconciliationNote" IS NULL AND "countedRemaining" IS NULL)
    OR ("reconciledById" IS NOT NULL AND "reconciledById" <> "requestedById" AND "recordedById" IS NOT NULL
      AND "reconciledById" <> "recordedById" AND "reconciledAt" IS NOT NULL
      AND "reconciliationReference" IS NOT NULL AND length(btrim("reconciliationReference")) BETWEEN 3 AND 200
      AND "reconciliationNote" IS NOT NULL AND length(btrim("reconciliationNote")) BETWEEN 5 AND 1000
      AND "countedRemaining" IS NOT NULL AND "countedRemaining" >= 0 AND "countedRemaining" <> 'NaN'::numeric
      AND "performedQuantity" IS NOT NULL AND "performedQuantity" <> quantity
      AND status IN ('EXECUTED','POSTED','NO_DISPOSAL'))),
  ADD CONSTRAINT recall_disposal_no_execution_check CHECK (
    status <> 'NO_DISPOSAL' OR ("reconciledById" IS NOT NULL AND "performedQuantity" = 0
      AND "movementId" IS NULL AND "accountingEntryId" IS NULL));

CREATE OR REPLACE FUNCTION guard_recall_disposal_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Recall disposal history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'REQUESTED' AND NEW."reconciledById" IS NULL AND EXISTS (
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
      OR (OLD.status = 'EXECUTED' AND NEW.status = 'POSTED'
        AND NEW."performedQuantity" > 0 AND (NEW."performedQuantity" = NEW.quantity OR OLD."reconciledById" IS NOT NULL))
      OR (OLD.status = 'EXECUTED' AND OLD."reconciledById" IS NULL AND NEW."reconciledById" IS NOT NULL
        AND NEW."performedQuantity" <> NEW.quantity
        AND ((NEW.status = 'NO_DISPOSAL' AND NEW."performedQuantity" = 0)
          OR (NEW.status = 'EXECUTED' AND NEW."performedQuantity" > 0)))
    )
    AND (OLD.status = 'REQUESTED' OR (NEW."reviewedById",NEW."reviewedAt",NEW."reviewNote")
      IS NOT DISTINCT FROM (OLD."reviewedById",OLD."reviewedAt",OLD."reviewNote"))
    AND (OLD.status <> 'EXECUTED' OR (NEW."evidenceReference",NEW."performedBy",NEW."performedQuantity",NEW."performedAt",NEW."recordedById",NEW."recordedAt")
      IS NOT DISTINCT FROM (OLD."evidenceReference",OLD."performedBy",OLD."performedQuantity",OLD."performedAt",OLD."recordedById",OLD."recordedAt"))
    AND (
      (NEW."reconciledById",NEW."reconciledAt",NEW."reconciliationReference",NEW."reconciliationNote",NEW."countedRemaining")
        IS NOT DISTINCT FROM
      (OLD."reconciledById",OLD."reconciledAt",OLD."reconciliationReference",OLD."reconciliationNote",OLD."countedRemaining")
      OR (OLD.status = 'EXECUTED' AND NEW.status IN ('EXECUTED','NO_DISPOSAL')
        AND OLD."reconciledById" IS NULL AND NEW."reconciledById" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "ProductStock" s JOIN "InventoryRecallIsolation" i ON i."stockId" = s.id
            JOIN "User" u ON u.id = NEW."reconciledById" AND u."isActive" AND NOT u."isDeleted"
          WHERE s.id = NEW."stockId" AND s."hospitalId" = NEW."hospitalId"
            AND i.id = NEW."isolationId" AND i."hospitalId" = NEW."hospitalId"
            AND i."stockVersion" = s.version AND i."onHand" = s.quantity
            AND NEW."performedQuantity" <= i."isolatedQuantity"
            AND NEW."countedRemaining" + NEW."performedQuantity" = s.quantity
            AND (u."hospitalId" = s."hospitalId" OR EXISTS (
              SELECT 1 FROM "UserHospitalAccess" a WHERE a."userId" = u.id AND a."hospitalId" = s."hospitalId"))
          FOR UPDATE OF s
        ))
    )
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
        AND d."performedQuantity" > 0
        AND (d."performedQuantity" = d.quantity OR d."reconciledById" IS NOT NULL)
        AND s."hospitalId" = NEW."hospitalId" AND s."warehouseId" = NEW."warehouseId" AND s."productId" = NEW."productId"
        AND s."batchNumber" = NEW."batchNumber" AND s.version = i."stockVersion"
        AND s.quantity = i."onHand" AND s.quantity >= d."performedQuantity"
        AND NEW.quantity = d."performedQuantity" AND NEW."baseQuantity" = d."performedQuantity"
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
COMMIT;
