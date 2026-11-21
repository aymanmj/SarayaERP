-- No automatic inference from warehouse names or pre-existing stock.
CREATE TABLE "SurgeryWarehousePolicy" (
 "id" SERIAL PRIMARY KEY,
 "hospitalId" INTEGER NOT NULL REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "warehouseId" INTEGER NOT NULL,
 "updatedById" INTEGER NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "surgery_policy_warehouse_fkey" FOREIGN KEY ("hospitalId","warehouseId") REFERENCES "Warehouse"("hospitalId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SurgeryWarehousePolicy_hospitalId_key" ON "SurgeryWarehousePolicy"("hospitalId");
INSERT INTO "Permission" ("code","description") VALUES ('surgery:source:manage','تعيين مخزن العمليات ومراجعة مصدر المخزون') ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "SurgeryConsumable"
 ADD COLUMN "requestKey" TEXT,
 ADD COLUMN "requestFingerprint" TEXT,
 ADD COLUMN "sourceWarehouseId" INTEGER REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "recordedById" INTEGER REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "totalCost" DECIMAL(18,3),
 ADD COLUMN "consumptionVersion" INTEGER NOT NULL DEFAULT 0,
 ADD CONSTRAINT "surgery_consumable_version_check" CHECK (
 "consumptionVersion"=0 OR ("consumptionVersion"=1 AND "requestKey" IS NOT NULL AND "requestFingerprint" IS NOT NULL AND "sourceWarehouseId" IS NOT NULL AND "recordedById" IS NOT NULL AND "totalCost" IS NOT NULL AND "quantity">0 AND "unitPrice">=0 AND "totalPrice">=0 AND "totalCost">=0));
CREATE UNIQUE INDEX "SurgeryConsumable_requestKey_key" ON "SurgeryConsumable"("requestKey");
CREATE UNIQUE INDEX "surgery_consumable_charge_identity_key" ON "EncounterCharge"("hospitalId","sourceType","sourceId") WHERE "sourceType"='SURGERY_CONSUMABLE';

-- Posted supply snapshots are append-only. Corrections require a separate reversal workflow.
CREATE FUNCTION surgery_consumable_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."consumptionVersion"=1 THEN RAISE EXCEPTION 'Posted surgery supply snapshots cannot be changed or deleted'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER surgery_consumable_immutable BEFORE UPDATE OR DELETE ON "SurgeryConsumable"
 FOR EACH ROW EXECUTE FUNCTION surgery_consumable_immutable();
