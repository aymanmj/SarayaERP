-- AlterTable
ALTER TABLE "LabTest" ADD COLUMN     "serviceItemId" INTEGER;

-- AlterTable
ALTER TABLE "RadiologyStudy" ADD COLUMN     "serviceItemId" INTEGER;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyStudy" ADD CONSTRAINT "RadiologyStudy_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
