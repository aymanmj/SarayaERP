BEGIN;
-- Development database is empty; no synthetic confirmation/backfill of historical counts.
ALTER TABLE "InventoryCountLine"
 ADD COLUMN "snapshotStockId" INTEGER NOT NULL,
 ADD COLUMN "snapshotStockVersion" INTEGER NOT NULL,
 ADD COLUMN "snapshotProductVersion" INTEGER NOT NULL,
 ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "countedById" INTEGER REFERENCES "User"("id") ON DELETE RESTRICT,
 ADD COLUMN "countedAt" TIMESTAMP(3),
 ALTER COLUMN "physicalQty" DROP DEFAULT,
 ALTER COLUMN "physicalQty" DROP NOT NULL;
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "count_line_confirmation" CHECK (
 "systemQty">=0 AND "costPrice">=0 AND "revision">=0 AND
 (("physicalQty" IS NULL AND "countedById" IS NULL AND "countedAt" IS NULL) OR
  ("physicalQty" IS NOT NULL AND "physicalQty">=0 AND "countedById" IS NOT NULL AND "countedAt" IS NOT NULL))
);
INSERT INTO "Permission" ("code","description") VALUES ('inventory:counts:post','اعتماد وترحيل الجرد باستقلال عن منفذ العد') ON CONFLICT ("code") DO NOTHING;
CREATE FUNCTION protect_inventory_count_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "InventoryCount" WHERE id=OLD."inventoryCountId" AND status IN ('POSTED','CANCELLED')) THEN
  RAISE EXCEPTION 'Finalized inventory count lines are immutable';
 END IF;
 IF TG_OP='UPDATE' AND (
  NEW."inventoryCountId" IS DISTINCT FROM OLD."inventoryCountId" OR NEW."productId" IS DISTINCT FROM OLD."productId" OR
  NEW."batchNumber" IS DISTINCT FROM OLD."batchNumber" OR NEW."expiryDate" IS DISTINCT FROM OLD."expiryDate" OR
  NEW."systemQty" IS DISTINCT FROM OLD."systemQty" OR NEW."costPrice" IS DISTINCT FROM OLD."costPrice" OR
  NEW."snapshotStockId" IS DISTINCT FROM OLD."snapshotStockId" OR NEW."snapshotStockVersion" IS DISTINCT FROM OLD."snapshotStockVersion" OR
  NEW."snapshotProductVersion" IS DISTINCT FROM OLD."snapshotProductVersion"
 ) THEN RAISE EXCEPTION 'Inventory count snapshot is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_inventory_count_line BEFORE UPDATE OR DELETE ON "InventoryCountLine" FOR EACH ROW EXECUTE FUNCTION protect_inventory_count_line();
COMMIT;
