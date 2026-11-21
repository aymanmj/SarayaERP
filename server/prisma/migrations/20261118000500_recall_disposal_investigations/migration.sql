BEGIN;
CREATE TYPE "RecallDisposalInvestigationStatus" AS ENUM ('SUBMITTED','RESOLVED','ESCALATED');
CREATE TABLE "InventoryRecallDisposalInvestigation" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL,
  "disposalId" INTEGER NOT NULL REFERENCES "InventoryRecallDisposal"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" UUID NOT NULL,
  status "RecallDisposalInvestigationStatus" NOT NULL DEFAULT 'SUBMITTED',
  "countedRemaining" DECIMAL(18,3) NOT NULL CHECK ("countedRemaining" >= 0 AND "countedRemaining" <> 'NaN'::numeric),
  version INTEGER NOT NULL,
  "movementIds" INTEGER[],
  "countReference" TEXT NOT NULL CHECK (length(btrim("countReference")) BETWEEN 3 AND 200),
  findings TEXT NOT NULL CHECK (length(btrim(findings)) BETWEEN 10 AND 2000),
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedById" INTEGER NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" INTEGER,
  "decisionNote" TEXT,
  CHECK ("movementIds" IS NOT NULL AND cardinality("movementIds") <= 20),
  CHECK (("reviewedAt" IS NULL AND "reviewedById" IS NULL AND "decisionNote" IS NULL AND status = 'SUBMITTED')
    OR ("reviewedAt" IS NOT NULL AND "reviewedById" IS NOT NULL AND "reviewedById" <> "submittedById"
      AND "decisionNote" IS NOT NULL AND length(btrim("decisionNote")) BETWEEN 5 AND 1000 AND status <> 'SUBMITTED'))
);
CREATE UNIQUE INDEX recall_disposal_investigation_request_key ON "InventoryRecallDisposalInvestigation" ("hospitalId","requestId");
CREATE INDEX recall_disposal_investigation_history_idx ON "InventoryRecallDisposalInvestigation" ("disposalId",id);
CREATE UNIQUE INDEX recall_disposal_investigation_pending_key ON "InventoryRecallDisposalInvestigation" ("disposalId") WHERE status = 'SUBMITTED';
CREATE UNIQUE INDEX recall_disposal_investigation_resolved_key ON "InventoryRecallDisposalInvestigation" ("disposalId") WHERE status = 'RESOLVED';

CREATE FUNCTION guard_recall_disposal_investigation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Recall disposal investigation history is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status = 'SUBMITTED' AND EXISTS (
    SELECT 1 FROM "InventoryRecallDisposal" d JOIN "ProductStock" s ON s.id = d."stockId"
    WHERE d.id = NEW."disposalId" AND d."hospitalId" = NEW."hospitalId" AND d.status = 'EXECUTED'
      AND d."reconciledById" IS NULL AND d."performedQuantity" <> d.quantity AND s.version = NEW.version
      AND s."hospitalId" = NEW."hospitalId" AND NEW."movementIds" = ARRAY(
        SELECT m.id FROM "StockTransaction" m WHERE m."hospitalId" = s."hospitalId" AND m."productId" = s."productId"
          AND m."warehouseId" = s."warehouseId" AND btrim(m."batchNumber") = btrim(s."batchNumber")
        ORDER BY m.id DESC LIMIT 20
      )
    FOR UPDATE OF d
  ) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'SUBMITTED' AND NEW.status IN ('RESOLVED','ESCALATED')
    AND (NEW.id,NEW."hospitalId",NEW."disposalId",NEW."requestId",NEW."countedRemaining",NEW.version,NEW."movementIds",
      NEW."countReference",NEW.findings,NEW."submittedAt",NEW."submittedById") IS NOT DISTINCT FROM
      (OLD.id,OLD."hospitalId",OLD."disposalId",OLD."requestId",OLD."countedRemaining",OLD.version,OLD."movementIds",
      OLD."countReference",OLD.findings,OLD."submittedAt",OLD."submittedById")
    AND EXISTS (SELECT 1 FROM "InventoryRecallDisposal" d WHERE d.id = NEW."disposalId"
      AND d."hospitalId" = NEW."hospitalId" AND d.status = 'EXECUTED' AND d."reconciledById" IS NULL
      AND NEW."reviewedById" <> d."requestedById" AND NEW."reviewedById" <> d."recordedById")
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid recall disposal investigation transition' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER recall_disposal_investigation_guard BEFORE INSERT OR UPDATE OR DELETE ON "InventoryRecallDisposalInvestigation"
  FOR EACH ROW EXECUTE FUNCTION guard_recall_disposal_investigation();

CREATE FUNCTION require_approved_recall_disposal_investigation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "InventoryRecallDisposalInvestigation" WHERE "disposalId" = OLD.id)
    AND NOT EXISTS (
      SELECT 1 FROM "InventoryRecallDisposalInvestigation" i WHERE i."disposalId" = OLD.id AND i.status = 'RESOLVED'
        AND i."reviewedById" = NEW."reconciledById" AND i."countedRemaining" = NEW."countedRemaining"
        AND i."countReference" = NEW."reconciliationReference" AND i."decisionNote" = NEW."reconciliationNote"
    )
  THEN RAISE EXCEPTION 'Disposal reconciliation must match the approved investigation' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recall_disposal_reconciliation_investigation_guard BEFORE UPDATE ON "InventoryRecallDisposal"
  FOR EACH ROW WHEN (OLD."reconciledById" IS NULL AND NEW."reconciledById" IS NOT NULL)
  EXECUTE FUNCTION require_approved_recall_disposal_investigation();

CREATE FUNCTION require_reconciled_investigation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "InventoryRecallDisposal" d WHERE d.id = NEW."disposalId"
    AND d."reconciledById" = NEW."reviewedById" AND d."countedRemaining" = NEW."countedRemaining"
    AND d."reconciliationReference" = NEW."countReference" AND d."reconciliationNote" = NEW."decisionNote")
  THEN RAISE EXCEPTION 'Resolved investigation requires a matching disposal reconciliation' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER recall_disposal_investigation_resolution AFTER UPDATE ON "InventoryRecallDisposalInvestigation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.status = 'RESOLVED')
  EXECUTE FUNCTION require_reconciled_investigation();
COMMIT;
