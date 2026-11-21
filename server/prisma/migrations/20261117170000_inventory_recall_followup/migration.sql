BEGIN;
CREATE INDEX stock_tx_recall_trace_idx ON "StockTransaction" ("hospitalId", "productId", "batchNumber", id);
CREATE TABLE "InventoryRecallIsolation" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL,
  "stockId" INTEGER NOT NULL REFERENCES "ProductStock"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "recordedById" INTEGER NOT NULL,
  "requestId" UUID NOT NULL,
  "stockVersion" INTEGER NOT NULL,
  "onHand" DECIMAL(18,3) NOT NULL,
  "isolatedQuantity" DECIMAL(18,3) NOT NULL CHECK ("isolatedQuantity" >= 0 AND "isolatedQuantity" <= "onHand"),
  location TEXT NOT NULL CHECK (length(btrim(location)) BETWEEN 2 AND 200),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 1000),
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InventoryRecallIsolation_hospitalId_requestId_key" ON "InventoryRecallIsolation" ("hospitalId", "requestId");
CREATE INDEX "InventoryRecallIsolation_stockId_id_idx" ON "InventoryRecallIsolation" ("stockId", id);

CREATE FUNCTION guard_recall_isolation_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Recall isolation evidence is append-only' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "ProductStock" s
    JOIN "InventoryBatchRestriction" r ON r."hospitalId" = s."hospitalId" AND r."productId" = s."productId"
      AND r."batchNumber" = btrim(s."batchNumber") AND r.status = 'RECALLED'
    JOIN "User" u ON u.id = NEW."recordedById" AND u."isActive" AND NOT u."isDeleted"
      AND (u."hospitalId" = s."hospitalId" OR EXISTS (SELECT 1 FROM "UserHospitalAccess" a
        WHERE a."userId" = u.id AND a."hospitalId" = s."hospitalId"))
    WHERE s.id = NEW."stockId" AND s."hospitalId" = NEW."hospitalId" AND s.version = NEW."stockVersion" AND s.quantity = NEW."onHand"
    FOR UPDATE OF s
  ) THEN
    RAISE EXCEPTION 'Recall evidence requires a current recalled stock balance and staff identity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_recall_isolation_guard BEFORE INSERT OR UPDATE OR DELETE ON "InventoryRecallIsolation"
  FOR EACH ROW EXECUTE FUNCTION guard_recall_isolation_evidence();
COMMIT;
