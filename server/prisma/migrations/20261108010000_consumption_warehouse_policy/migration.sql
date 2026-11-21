CREATE UNIQUE INDEX "warehouse_hospital_id_key" ON "Warehouse"("hospitalId","id");
CREATE TABLE "ConsumptionWarehousePolicy" (
 "id" SERIAL PRIMARY KEY,
 "hospitalId" INTEGER NOT NULL REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "warehouseId" INTEGER NOT NULL, "updatedById" INTEGER NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "consumption_policy_warehouse_fkey" FOREIGN KEY ("hospitalId","warehouseId") REFERENCES "Warehouse"("hospitalId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConsumptionWarehousePolicy_hospitalId_key" ON "ConsumptionWarehousePolicy"("hospitalId");
