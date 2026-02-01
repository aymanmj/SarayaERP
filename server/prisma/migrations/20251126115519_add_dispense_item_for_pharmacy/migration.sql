-- CreateTable
CREATE TABLE "DispenseItem" (
    "id" SERIAL NOT NULL,
    "dispenseRecordId" INTEGER NOT NULL,
    "prescriptionItemId" INTEGER,
    "dispensedDrugItemId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "DispenseItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_dispenseRecordId_fkey" FOREIGN KEY ("dispenseRecordId") REFERENCES "DispenseRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "PrescriptionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_dispensedDrugItemId_fkey" FOREIGN KEY ("dispensedDrugItemId") REFERENCES "DrugItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
