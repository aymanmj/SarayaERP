BEGIN;
CREATE TYPE "InventoryBatchStatus" AS ENUM ('QUARANTINED', 'RECALLED', 'RELEASED');
CREATE TABLE "InventoryBatchRestriction" (
  "hospitalId" INTEGER NOT NULL REFERENCES "Hospital"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "productId" INTEGER NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "batchNumber" TEXT NOT NULL CHECK (length("batchNumber") BETWEEN 1 AND 200 AND "batchNumber" = btrim("batchNumber")),
  status "InventoryBatchStatus" NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 1000),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("hospitalId", "productId", "batchNumber")
);

CREATE FUNCTION guard_inventory_batch_restriction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Restricted batch history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  PERFORM id FROM "Product" WHERE id = NEW."productId" AND "hospitalId" = NEW."hospitalId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restricted batch must belong to the same facility' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    ROW(NEW."hospitalId", NEW."productId", NEW."batchNumber") IS DISTINCT FROM
      ROW(OLD."hospitalId", OLD."productId", OLD."batchNumber")
    OR OLD.status = 'RECALLED'
    OR (NEW.status = 'RELEASED' AND OLD.status <> 'QUARANTINED')
  ) OR (TG_OP = 'INSERT' AND NEW.status = 'RELEASED') THEN
    RAISE EXCEPTION 'Invalid batch restriction transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_batch_restriction_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "InventoryBatchRestriction"
  FOR EACH ROW EXECUTE FUNCTION guard_inventory_batch_restriction();

CREATE FUNCTION guard_usable_stock_outflow() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  facility_zone TEXT;
  utc_now TIMESTAMP;
BEGIN
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
CREATE TRIGGER usable_stock_outflow_guard
  BEFORE INSERT ON "StockTransaction" FOR EACH ROW WHEN (NEW.type = 'OUT')
  EXECUTE FUNCTION guard_usable_stock_outflow();
COMMIT;
