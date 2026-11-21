-- No automatic inference from warehouse names or pre-existing stock.
CREATE TABLE "PharmacyWarehousePolicy" (
 "id" SERIAL PRIMARY KEY,
 "hospitalId" INTEGER NOT NULL REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "warehouseId" INTEGER NOT NULL,
 "updatedById" INTEGER NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "pharmacy_policy_warehouse_fkey" FOREIGN KEY ("hospitalId","warehouseId") REFERENCES "Warehouse"("hospitalId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PharmacyWarehousePolicy_hospitalId_key" ON "PharmacyWarehousePolicy"("hospitalId");
INSERT INTO "Permission" ("code","description") VALUES ('pharmacy:source:manage','تعيين مخزن الصيدلية ومراجعة مصدر المخزون') ON CONFLICT ("code") DO NOTHING;
